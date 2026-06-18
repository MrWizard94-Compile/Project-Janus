import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  formatBranchName,
  formatWorktreeName,
  resolveWorktreesDir,
} from "@aether/shared";
import { assertGitSuccess, runGit } from "./git.js";

export interface WorktreeEntry {
  name: string;
  path: string;
  branch: string;
  task_id: string;
}

export interface CreateWorktreeOptions {
  taskId: string;
  baseBranch?: string;
  sequence?: number;
}

export class WorktreeManager {
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async list(): Promise<WorktreeEntry[]> {
    const result = await runGit(this.repoRoot, [
      "worktree",
      "list",
      "--porcelain",
    ]);
    assertGitSuccess(result, "worktree list");

    const entries: WorktreeEntry[] = [];
    let currentPath = "";
    let currentBranch = "";

    const flush = (): void => {
      if (!currentPath.includes(".worktrees")) {
        currentPath = "";
        currentBranch = "";
        return;
      }

      const name = currentPath.split(/[\\/]/).pop() ?? currentPath;
      const taskId = extractTaskIdFromBranch(currentBranch) ?? name;
      entries.push({
        name,
        path: currentPath,
        branch: currentBranch,
        task_id: taskId,
      });
      currentPath = "";
      currentBranch = "";
    };

    for (const line of result.stdout.split(/\r?\n/)) {
      if (line.startsWith("worktree ")) {
        if (currentPath) {
          flush();
        }
        currentPath = line.slice("worktree ".length).trim();
        currentBranch = "";
        continue;
      }

      if (line.startsWith("branch ")) {
        currentBranch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
        continue;
      }

      if (line === "" && currentPath) {
        flush();
      }
    }

    if (currentPath) {
      flush();
    }

    return entries;
  }

  async create(options: CreateWorktreeOptions): Promise<WorktreeEntry> {
    const baseBranch = options.baseBranch ?? "main";
    const sequence = options.sequence ?? 1;
    const name = formatWorktreeName(options.taskId, sequence);
    const branch = formatBranchName(options.taskId);
    const worktreesDir = resolveWorktreesDir(this.repoRoot);
    const worktreePath = join(worktreesDir, name);

    await mkdir(worktreesDir, { recursive: true });

    const existing = await this.findByTaskId(options.taskId);
    if (existing) {
      return existing;
    }

    const branchExists = await runGit(this.repoRoot, [
      "show-ref",
      "--verify",
      `refs/heads/${branch}`,
    ]);

    if (branchExists.exitCode !== 0) {
      const createBranch = await runGit(this.repoRoot, [
        "branch",
        branch,
        baseBranch,
      ]);
      assertGitSuccess(createBranch, `branch create ${branch}`);
    }

    const add = await runGit(this.repoRoot, [
      "worktree",
      "add",
      worktreePath,
      branch,
    ]);
    assertGitSuccess(add, `worktree add ${worktreePath}`);

    return {
      name,
      path: worktreePath,
      branch,
      task_id: options.taskId,
    };
  }

  async destroy(taskId: string): Promise<void> {
    const entry = await this.findByTaskId(taskId);
    if (!entry) {
      throw new Error(`No worktree found for task: ${taskId}`);
    }

    const remove = await runGit(this.repoRoot, [
      "worktree",
      "remove",
      entry.path,
      "--force",
    ]);
    assertGitSuccess(remove, `worktree remove ${entry.path}`);

    const deleteBranch = await runGit(this.repoRoot, ["branch", "-D", entry.branch]);
    if (deleteBranch.exitCode !== 0) {
      const detail = deleteBranch.stderr.trim() || deleteBranch.stdout.trim();
      throw new Error(`Git branch delete failed (exit ${deleteBranch.exitCode}): ${detail}`);
    }
  }

  async findByTaskId(taskId: string): Promise<WorktreeEntry | null> {
    const entries = await this.list();
    return entries.find((entry) => entry.task_id === taskId) ?? null;
  }
}

function extractTaskIdFromBranch(branch: string): string | null {
  const match = /^aether\/(task-[0-9a-f-]+)$/i.exec(branch);
  if (!match?.[1]) {
    return null;
  }
  return match[1];
}