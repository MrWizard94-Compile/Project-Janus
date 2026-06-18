import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PatchProposal } from "@aether/shared";
import { assertGitSuccess, runGit } from "@aether/worktree-manager";

export async function applyPatch(
  workspaceRoot: string,
  proposal: PatchProposal,
): Promise<void> {
  for (const file of proposal.files) {
    const targetPath = join(workspaceRoot, file.path);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content, "utf8");
  }
}

export async function revertWorkspace(workspaceRoot: string): Promise<void> {
  const restore = await runGit(workspaceRoot, ["restore", "--staged", "--worktree", "."]);
  assertGitSuccess(restore, "restore worktree");

  const clean = await runGit(workspaceRoot, ["clean", "-fd"]);
  assertGitSuccess(clean, "clean worktree");
}