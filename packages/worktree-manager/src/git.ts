import { spawn } from "node:child_process";

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runGit(
  cwd: string,
  args: readonly string[],
): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", [...args], {
      cwd,
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

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });
}

export function assertGitSuccess(result: GitResult, action: string): void {
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`Git ${action} failed (exit ${result.exitCode}): ${detail}`);
  }
}