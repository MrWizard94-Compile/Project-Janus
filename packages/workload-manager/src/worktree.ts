import type { Task } from "@aether/shared";
import { resolveWorktreePath } from "@aether/shared";
import { WorktreeManager } from "@aether/worktree-manager";
import { WorkloadManager } from "./manager.js";

export async function resolveTaskWorkspace(
  janusRoot: string,
  task: Task,
): Promise<string> {
  if (!task.worktree) {
    const hint = task.workload
      ? `aether worktree create -t ${task.id} --workload ${task.workload}`
      : `aether worktree create -t ${task.id}`;
    throw new Error(`Task ${task.id} has no worktree. Run: ${hint}`);
  }

  if (task.workload) {
    const manager = new WorkloadManager(janusRoot);
    return manager.resolveWorktreePath(task.workload, task.id, task.worktree);
  }

  const manager = new WorktreeManager(janusRoot);
  const entry = await manager.findByTaskId(task.id);
  if (entry) {
    return entry.path;
  }

  return resolveWorktreePath(janusRoot, task.worktree);
}