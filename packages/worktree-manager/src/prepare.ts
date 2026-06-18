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

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runShellCommand(cwd: string, command: string): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
    });

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
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}