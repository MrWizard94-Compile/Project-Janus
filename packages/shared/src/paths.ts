import { join } from "node:path";

export const AETHER_DIR = ".aether";
export const TOOLS_DIR = ".tools";
export const WORKLOADS_DIR = "workloads";
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

export const CONFIG_FILE = "config.json";
export const RECEIPTS_DIR = "receipts";

export function resolveAetherConfigPath(repoRoot: string): string {
  return join(resolveAetherDir(repoRoot), CONFIG_FILE);
}

export function resolveReceiptsDir(repoRoot: string): string {
  return join(resolveAetherDir(repoRoot), RECEIPTS_DIR);
}

export function resolveReceiptPath(repoRoot: string, taskId: string): string {
  return join(resolveReceiptsDir(repoRoot), `${taskId}.json`);
}

export function resolveWorktreePath(repoRoot: string, worktreeName: string): string {
  return join(resolveWorktreesDir(repoRoot), worktreeName);
}

export function resolveToolsDir(repoRoot: string): string {
  return join(repoRoot, TOOLS_DIR);
}

export function resolveJdtlsDir(repoRoot: string): string {
  return join(resolveToolsDir(repoRoot), "jdtls");
}

export function resolveWorkloadsDir(repoRoot: string): string {
  return join(repoRoot, WORKLOADS_DIR);
}

export function resolveWorkloadDir(repoRoot: string, workloadId: string): string {
  return join(resolveWorkloadsDir(repoRoot), workloadId);
}