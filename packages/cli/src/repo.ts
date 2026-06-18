import { runGit } from "@aether/worktree-manager";

export async function findRepoRoot(startDir: string): Promise<string> {
  const result = await runGit(startDir, ["rev-parse", "--show-toplevel"]);
  if (result.exitCode !== 0) {
    throw new Error(
      "Not inside a git repository. Run aether from a cloned Project Janus workspace.",
    );
  }

  return result.stdout.trim();
}