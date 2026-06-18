import { access } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

export interface PrepareResult {
  workspace_root: string;
  commands: string[];
  exit_code: number;
  skipped: boolean;
}

export async function prepareWorktreeDependencies(
  workspaceRoot: string,
): Promise<PrepareResult> {
  const gradleWrapper = await findGradleWrapper(workspaceRoot);
  if (gradleWrapper) {
    const command = `${gradleWrapper} compileJava`;
    const result = await runShellCommand(workspaceRoot, command, 600_000);

    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim();
      throw new Error(
        `Worktree prepare failed on "${command}" (exit ${result.exitCode}): ${detail}`,
      );
    }

    return {
      workspace_root: workspaceRoot,
      commands: [command],
      exit_code: result.exitCode,
      skipped: false,
    };
  }

  const packageJsonPath = join(workspaceRoot, "package.json");

  try {
    await access(packageJsonPath);
  } catch {
    return {
      workspace_root: workspaceRoot,
      commands: [],
      exit_code: 0,
      skipped: true,
    };
  }

  const commands = ["pnpm install --frozen-lockfile", "pnpm build"];
  let lastExitCode = 0;

  for (const command of commands) {
    const result = await runShellCommand(workspaceRoot, command);
    lastExitCode = result.exitCode;

    if (result.exitCode !== 0) {
      const detail = result.stderr.trim() || result.stdout.trim();
      throw new Error(
        `Worktree prepare failed on "${command}" (exit ${result.exitCode}): ${detail}`,
      );
    }
  }

  return {
    workspace_root: workspaceRoot,
    commands,
    exit_code: lastExitCode,
    skipped: false,
  };
}

async function findGradleWrapper(workspaceRoot: string): Promise<string | null> {
  const windowsWrapper = join(workspaceRoot, "gradlew.bat");
  const unixWrapper = join(workspaceRoot, "gradlew");

  try {
    await access(windowsWrapper);
    return "gradlew.bat";
  } catch {
    try {
      await access(unixWrapper);
      return "./gradlew";
    } catch {
      return null;
    }
  }
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runShellCommand(
  cwd: string,
  command: string,
  timeoutMs = 300_000,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
        return;
      }
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}