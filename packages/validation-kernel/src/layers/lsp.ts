import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AetherConfig, PatchProposal, ValidationError } from "@aether/shared";
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
  const launcher = await findLauncherJar(config.jdtls?.home ?? "");
  const javaPath = config.jdtls?.java_path ?? "java";
  const dataDir =
    config.jdtls?.workspace_data_dir ??
    join(config.jdtls?.home ?? "", "data", "aether-workspace");

  const configDir = join(config.jdtls?.home ?? "", "config_win");
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
    throw new Error("Failed to create JDT.LS stdio pipes");
  }

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

  connection.listen();

  const rootUri = pathToFileURL(workspaceRoot).toString();
  await connection.sendRequest("initialize", {
    processId: process.pid,
    rootUri,
    capabilities: {},
    workspaceFolders: [{ uri: rootUri, name: "aether-workspace" }],
  });

  await connection.sendNotification("initialized", {});

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