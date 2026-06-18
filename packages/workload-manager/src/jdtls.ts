import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import {
  AetherConfigSchema,
  DEFAULT_AETHER_CONFIG,
  resolveAetherConfigPath,
  resolveAetherDir,
  resolveJdtlsDir,
  resolveToolsDir,
} from "@aether/shared";


const JDTLS_LATEST_URL = "https://download.eclipse.org/jdtls/snapshots/latest.txt";
const JDTLS_BASE_URL = "https://download.eclipse.org/jdtls/snapshots/";

export interface JdtlsSetupResult {
  archive: string;
  install_dir: string;
  config_path: string;
  java_path: string;
}

export async function setupJdtls(repoRoot: string, javaPath = "java"): Promise<JdtlsSetupResult> {
  await assertJavaAvailable(javaPath);

  const latestResponse = await fetch(JDTLS_LATEST_URL);
  if (!latestResponse.ok) {
    throw new Error(`Failed to resolve JDT.LS latest release (${latestResponse.status})`);
  }

  const archive = (await latestResponse.text()).trim();
  if (!archive.endsWith(".tar.gz")) {
    throw new Error(`Unexpected JDT.LS latest artifact: ${archive}`);
  }

  const toolsDir = resolveToolsDir(repoRoot);
  const downloadPath = join(toolsDir, archive);
  const installDir = resolveJdtlsDir(repoRoot);

  await mkdir(toolsDir, { recursive: true });

  if (!(await isJdtlsInstalled(installDir))) {
    await downloadFile(`${JDTLS_BASE_URL}${archive}`, downloadPath);
    await mkdir(installDir, { recursive: true });
    await extractTarGz(downloadPath, installDir);
  }

  const config = AetherConfigSchema.parse({
    ...DEFAULT_AETHER_CONFIG,
    jdtls: {
      java_path: javaPath,
      home: installDir,
      workspace_data_dir: join(installDir, "data", "aether-workspace"),
    },
  });

  const configPath = resolveAetherConfigPath(repoRoot);
  await mkdir(resolveAetherDir(repoRoot), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  return {
    archive,
    install_dir: installDir,
    config_path: configPath,
    java_path: javaPath,
  };
}

async function assertJavaAvailable(javaPath: string): Promise<void> {
  const child = await runProcess(javaPath, ["-version"]);
  if (child.exitCode !== 0) {
    throw new Error(
      `Java runtime not found at "${javaPath}". Install JDK 21+ and retry setup.`,
    );
  }
}

async function downloadFile(url: string, destination: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url} (${response.status})`);
  }

  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(destination));
}

async function extractTarGz(archivePath: string, destination: string): Promise<void> {
  const result = await runProcess("tar", ["-xzf", archivePath, "-C", destination, "--strip-components=0"]);
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`Failed to extract ${archivePath}: ${detail}`);
  }
}

async function isJdtlsInstalled(installDir: string): Promise<boolean> {
  try {
    const { readdir } = await import("node:fs/promises");
    const plugins = await readdir(join(installDir, "plugins"));
    return plugins.some((entry) => entry.startsWith("org.eclipse.equinox.launcher_"));
  } catch {
    return false;
  }
}

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runProcess(command: string, args: readonly string[]): Promise<ProcessResult> {
  const { spawn } = await import("node:child_process");

  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { windowsHide: true });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

export function resolveJdtlsConfigDir(jdtlsHome: string): string {
  if (process.platform === "win32") {
    return join(jdtlsHome, "config_win");
  }
  if (process.platform === "darwin") {
    return join(jdtlsHome, "config_mac");
  }
  return join(jdtlsHome, "config_linux");
}