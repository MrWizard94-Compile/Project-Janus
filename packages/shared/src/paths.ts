import { join } from "node:path";

export const AETHER_DIR = ".aether";
export const TASKS_FILE = "tasks.json";
export const WORKTREES_DIR = ".worktrees";

export function resolveAetherDir(repoRoot: string): string {
  return join(repoRoot, AETHER_DIR);
}

export function resolveTasksPath(repoRoot: string): string {
  return join(resolveAetherDir(repoRoot), TASKS_FILE);
}

export function resolveWorktreesDir(repoRoot: string): string {
  return join(repoRoot, WORKTREES_DIR);
}

export function formatWorktreeName(taskId: string, sequence: number): string {
  const slug = taskId.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  return `wt-${slug}-${String(sequence).padStart(2, "0")}`;
}

export function formatBranchName(taskId: string): string {
  const slug = taskId.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  return `aether/${slug}`;
}