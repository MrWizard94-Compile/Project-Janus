import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AetherConfig, PatchProposal, ValidationError } from "@aether/shared";
import {
  resolveJdtlsConfigDir,
  resolveWorkspaceJavaHome,
  type ResolvedWorkspaceJava,
} from "@aether/workload-manager";
import {
  createProtocolConnection,
  DiagnosticSeverity,
  StreamMessageReader,
  StreamMessageWriter,
  type PublishDiagnosticsParams,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { LayerResult } from "../types.js";

export async function runLspLayer(
  proposal: PatchProposal,
  workspaceRoot: string,
  config: AetherConfig,
): Promise<LayerResult> {
  const started = Date.now();
  const javaFiles = proposal.files.filter((file) => file.path.endsWith(".java"));

  if (javaFiles.length === 0) {
    return {
      layer: "lsp",
      ran: false,
      passed: true,
      errors: [],
      duration_ms: Date.now() - started,
    };
  }

  if (!config.jdtls?.home) {
    return {
      layer: "lsp",
      ran: false,
      passed: false,
      errors: [
        {
          layer: "lsp",
          message:
            "JDT.LS is not configured. Set jdtls.home in .aether/config.json before Java LSP validation can run.",
          suggestion: "See references/jdt-lsp/overview.md for setup instructions",
        },
      ],
      duration_ms: Date.now() - started,
    };
  }

  const timeoutMs = config.validation?.lsp_timeout_ms ?? 60_000;

  try {
    const errors = await collectJdtDiagnostics(workspaceRoot, javaFiles, config, timeoutMs);
    return {
      layer: "lsp",
      ran: true,
      passed: errors.length === 0,
      errors,
      duration_ms: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      layer: "lsp",
      ran: true,
      passed: false,
      errors: [
        {
          layer: "lsp",
          message: `JDT.LS validation failed: ${message}`,
        },
      ],
      duration_ms: Date.now() - started,
    };
  }
}

async function collectJdtDiagnostics(
  workspaceRoot: string,
  javaFiles: PatchProposal["files"],
  config: AetherConfig,
  timeoutMs: number,
): Promise<ValidationError[]> {
  const workspaceJava = await resolveWorkspaceJavaHome(workspaceRoot);
  const launcher = await findLauncherJar(config.jdtls?.home ?? "");
  const javaPath = resolveJdtlsProcessJavaPath(config, workspaceJava);
  const dataDir = await mkdtemp(join(tmpdir(), "aether-jdtls-"));

  const configDir = resolveJdtlsConfigDir(config.jdtls?.home ?? "");
  const args = [
    "-Declipse.application=org.eclipse.jdt.ls.core.id1",
    "-Dosgi.bundles.defaultStartLevel=4",
    "-jar",
    launcher,
    "-configuration",
    configDir,
    "-data",
    dataDir,
  ];

  const child = spawn(javaPath, args, {
    cwd: workspaceRoot,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (!child.stdin || !child.stdout) {
    await rm(dataDir, { recursive: true, force: true });
    throw new Error("Failed to create JDT.LS stdio pipes");
  }

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr += chunk.toString();
  });

  const exitPromise = watchJdtlsExit(child);

  const reader = new StreamMessageReader(child.stdout);
  const writer = new StreamMessageWriter(child.stdin);
  const connection = createProtocolConnection(reader, writer);

  const diagnosticsByUri = new Map<string, ValidationError[]>();
  const pendingUris = new Set(
    javaFiles.map((file) => pathToFileURL(join(workspaceRoot, file.path)).toString()),
  );

  connection.onNotification(
    "textDocument/publishDiagnostics",
    (params: PublishDiagnosticsParams) => {
      const mapped = params.diagnostics
        .filter(
          (diag) =>
            (diag.severity ?? DiagnosticSeverity.Error) <= DiagnosticSeverity.Warning,
        )
        .map((diag) => {
          const error: ValidationError = {
            layer: "lsp",
            file: uriToRelativePath(params.uri, workspaceRoot),
            line: diag.range.start.line + 1,
            message: diag.message,
          };
          if (diag.source) {
            error.suggestion = `Source: ${diag.source}`;
          }
          return error;
        });

      diagnosticsByUri.set(params.uri, mapped);
      pendingUris.delete(params.uri);
    },
  );

  try {
    connection.listen();

    const rootUri = pathToFileURL(workspaceRoot).toString();
    await Promise.race([
      connection.sendRequest("initialize", {
        processId: process.pid,
        rootUri,
        capabilities: {},
        workspaceFolders: [{ uri: rootUri, name: "aether-workspace" }],
        initializationOptions: {
          settings: buildJdtlsWorkspaceSettings(workspaceJava),
        },
      }),
      exitPromise,
    ]);

    await connection.sendNotification("initialized", {});

    const gradleImportDelayMs =
      config.validation?.lsp_gradle_import_delay_ms ?? (workspaceJava ? 3_000 : 0);
    if (gradleImportDelayMs > 0) {
      await delay(gradleImportDelayMs);
    }

    for (const file of javaFiles) {
      const absolutePath = join(workspaceRoot, file.path);
      const document = TextDocument.create(
        pathToFileURL(absolutePath).toString(),
        "java",
        1,
        file.content,
      );

      await connection.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri: document.uri,
          languageId: document.languageId,
          version: document.version,
          text: document.getText(),
        },
      });
    }

    await waitForDiagnostics(pendingUris, diagnosticsByUri, timeoutMs);

    await connection.sendRequest("shutdown", null);
    await connection.sendNotification("exit", null);
    child.kill("SIGTERM");

    return [...diagnosticsByUri.values()].flat();
  } catch (error) {
    child.kill("SIGTERM");
    if (error instanceof JdtlsProcessExitError) {
      throw new Error(
        `JDT.LS exited with code ${error.exitCode ?? "unknown"}${stderr.trim() ? `: ${trimOutput(stderr)}` : ""}`,
      );
    }
    throw error;
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
}

class JdtlsProcessExitError extends Error {
  readonly exitCode: number | null;

  constructor(exitCode: number | null) {
    super(`JDT.LS process exited with code ${exitCode ?? "unknown"}`);
    this.name = "JdtlsProcessExitError";
    this.exitCode = exitCode;
  }
}

function watchJdtlsExit(child: ChildProcessWithoutNullStreams): Promise<never> {
  return new Promise((_, reject) => {
    child.once("exit", (code) => {
      reject(new JdtlsProcessExitError(code));
    });
  });
}

function trimOutput(output: string): string {
  const lines = output.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.slice(-4).join("\n");
}

async function waitForDiagnostics(
  pendingUris: Set<string>,
  diagnosticsByUri: Map<string, ValidationError[]>,
  timeoutMs: number,
): Promise<void> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const unresolved = [...pendingUris].filter((uri) => !diagnosticsByUri.has(uri));
    if (unresolved.length === 0) {
      return;
    }
    await delay(250);
  }

  throw new Error(`Timed out waiting for JDT.LS diagnostics after ${timeoutMs}ms`);
}

async function findLauncherJar(jdtlsHome: string): Promise<string> {
  const pluginsDir = join(jdtlsHome, "plugins");
  const entries = await readdir(pluginsDir);
  const launcher = entries.find((entry) => entry.startsWith("org.eclipse.equinox.launcher_"));
  if (!launcher) {
    throw new Error(`No equinox launcher found in ${pluginsDir}`);
  }
  return join(pluginsDir, launcher);
}

function uriToRelativePath(uri: string, workspaceRoot: string): string {
  const absolute = decodeURIComponent(new URL(uri).pathname).replace(
    /^\/([A-Za-z]:\/)/,
    "$1",
  );
  const root = workspaceRoot.replace(/\\/g, "/");
  const normalized = absolute.replace(/\\/g, "/");
  if (normalized.startsWith(root)) {
    return normalized.slice(root.length + 1);
  }
  return normalized;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function resolveJdtlsProcessJavaPath(
  config: AetherConfig,
  workspaceJava: ResolvedWorkspaceJava | null,
): string {
  const configuredJavaPath = config.jdtls?.java_path ?? "java";
  if (!workspaceJava || workspaceJava.version < 21) {
    return configuredJavaPath;
  }

  const workspaceJavaBinary = join(
    workspaceJava.home,
    "bin",
    process.platform === "win32" ? "java.exe" : "java",
  );
  return workspaceJavaBinary;
}

function buildJdtlsWorkspaceSettings(
  workspaceJava: ResolvedWorkspaceJava | null,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {
    "java.import.gradle.enabled": true,
    "java.import.gradle.wrapper.enabled": true,
    "java.configuration.updateBuildConfiguration": "automatic",
  };

  if (workspaceJava) {
    settings["java.configuration.runtimes"] = [
      {
        name: `JavaSE-${workspaceJava.version}`,
        path: workspaceJava.home,
        default: true,
      },
    ];
  }

  return settings;
}