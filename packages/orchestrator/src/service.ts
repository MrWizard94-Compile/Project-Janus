import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Assignee,
  PatchProposal,
  Task,
  TaskStatus,
  ValidationError,
} from "@aether/shared";
import { TaskQueue } from "@aether/task-queue";
import { HandoffService, type SubmitPatchResult } from "@aether/validation-kernel";
import { resolveTaskWorkspace, WorkloadManager } from "@aether/workload-manager";
import {
  prepareWorktreeDependencies,
  WorktreeManager,
} from "@aether/worktree-manager";
import {
  DelegationPlanSchema,
  type DelegationPlan,
} from "./plan.js";
import {
  parsePatchMode,
  parseProvisionOptions,
  publicContextRefs,
  withPatchModeContext,
  withProvisionContext,
} from "./metadata.js";

export interface ExecutorBrief {
  task_id: string;
  assignee: Assignee;
  workspace_root: string;
  files_in_scope: string[];
  objective: string;
  constraints: string[];
  validation_profile: string;
  context_refs: string[];
  last_validation_errors?: ValidationError[];
}

export interface RollupStatus {
  parent_id: string;
  total: number;
  by_status: Record<TaskStatus, number>;
  complete: boolean;
  children: Task[];
}

export interface ProvisionedChild {
  task_id: string;
  worktree: string;
  workspace_root: string;
}

const EMPTY_STATUS_COUNTS: Record<TaskStatus, number> = {
  pending: 0,
  in_progress: 0,
  validating: 0,
  failed: 0,
  accepted: 0,
  abandoned: 0,
};

export class OrchestratorService {
  private readonly repoRoot: string;
  private readonly queue: TaskQueue;
  private readonly handoff: HandoffService;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.queue = new TaskQueue(repoRoot);
    this.handoff = new HandoffService(repoRoot);
  }

  async createPlan(plan: DelegationPlan): Promise<{ parent: Task; children: Task[] }> {
    const parsed = DelegationPlanSchema.parse(plan);

    const parent = await this.queue.create({
      parent_id: parsed.parent.parent_id ?? null,
      worktree: parsed.parent.worktree ?? null,
      workload: parsed.parent.workload ?? null,
      assignee: "claude",
      context_refs: withProvisionContext(
        parsed.parent.context_refs ?? [],
        parsed.provision,
      ),
      spec: parsed.parent.spec,
      validation_profile: parsed.parent.validation_profile,
    });

    const children: Task[] = [];
    for (const child of parsed.children) {
      const created = await this.queue.create({
        parent_id: parent.id,
        worktree: child.task.worktree ?? null,
        workload: child.task.workload ?? null,
        assignee: child.assignee,
        context_refs: withPatchModeContext(child.task.context_refs ?? [], child.patch_mode),
        spec: child.task.spec,
        validation_profile: child.task.validation_profile,
      });
      children.push(created);
    }

    return { parent, children };
  }

  async listChildren(parentId: string): Promise<Task[]> {
    await this.queue.get(parentId);
    const tasks = await this.queue.list();
    return tasks.filter((task) => task.parent_id === parentId);
  }

  async rollupStatus(parentId: string): Promise<RollupStatus> {
    await this.queue.get(parentId);
    const children = await this.listChildren(parentId);
    const by_status = { ...EMPTY_STATUS_COUNTS };

    for (const child of children) {
      by_status[child.status] += 1;
    }

    const complete =
      children.length > 0 && children.every((child) => child.status === "accepted");

    return {
      parent_id: parentId,
      total: children.length,
      by_status,
      complete,
      children,
    };
  }

  async provisionChildren(parentId: string): Promise<ProvisionedChild[]> {
    const children = await this.listChildren(parentId);
    const provisioned: ProvisionedChild[] = [];

    for (const child of children) {
      provisioned.push(await this.provisionChildTask(child));
    }

    return provisioned;
  }

  async buildExecutorBrief(taskId: string): Promise<ExecutorBrief> {
    const task = await this.queue.get(taskId);
    if (!task.assignee) {
      throw new Error(`Task ${taskId} has no assignee`);
    }

    const workspace_root = await resolveTaskWorkspace(this.repoRoot, task);
    const brief: ExecutorBrief = {
      task_id: task.id,
      assignee: task.assignee,
      workspace_root,
      files_in_scope: task.spec.files_in_scope,
      objective: task.spec.objective,
      constraints: task.spec.constraints,
      validation_profile: task.validation_profile,
      context_refs: publicContextRefs(task.context_refs),
    };

    const lastAttempt = task.validation_attempts.at(-1);
    if (lastAttempt && !lastAttempt.passed) {
      brief.last_validation_errors = lastAttempt.errors;
    }

    return brief;
  }

  async buildIdentityPatch(taskId: string): Promise<PatchProposal> {
    const task = await this.queue.get(taskId);
    const workspaceRoot = await resolveTaskWorkspace(this.repoRoot, task);

    const files = await Promise.all(
      task.spec.files_in_scope.map(async (relativePath) => {
        const absolutePath = join(workspaceRoot, relativePath);
        let content: string;
        try {
          content = await readFile(absolutePath, "utf8");
        } catch {
          throw new Error(
            `File missing from workspace for identity patch: ${relativePath} (${absolutePath})`,
          );
        }

        return { path: relativePath, content };
      }),
    );

    if (files.length === 0) {
      throw new Error(`Task ${taskId} has no files_in_scope for identity patch`);
    }

    return {
      task_id: taskId,
      files,
      allow_overwrite: true,
    };
  }

  async executeIdentityTask(taskId: string): Promise<SubmitPatchResult> {
    let task = await this.queue.get(taskId);
    if (!task.worktree) {
      const provisioned = await this.provisionChildTask(task);
      task = await this.queue.get(provisioned.task_id);
    }

    const proposal = await this.buildIdentityPatch(taskId);
    return this.handoff.submit({
      repoRoot: this.repoRoot,
      proposal,
      apply: true,
    });
  }

  async runChildren(
    parentId: string,
    options?: { parallel?: number },
  ): Promise<SubmitPatchResult[]> {
    const parallel = Math.max(1, options?.parallel ?? 1);
    const children = await this.listChildren(parentId);
    const identityChildren = children.filter((child) => parsePatchMode(child) === "identity");

    const results: SubmitPatchResult[] = [];
    for (let index = 0; index < identityChildren.length; index += parallel) {
      const batch = identityChildren.slice(index, index + parallel);
      const batchResults = await Promise.all(
        batch.map((child) => this.executeIdentityTask(child.id)),
      );
      results.push(...batchResults);
    }

    return results;
  }

  private async provisionChildTask(task: Task): Promise<ProvisionedChild> {
    if (!task.parent_id) {
      throw new Error(`Task ${task.id} is not a delegated child task`);
    }

    const parent = await this.queue.get(task.parent_id);
    const provision = parseProvisionOptions(parent);

    if (!provision.auto_worktree && !task.worktree) {
      throw new Error(
        `Task ${task.id} has no worktree and auto_worktree is disabled on parent ${parent.id}`,
      );
    }

    let updated = task;
    if (!updated.worktree) {
      const created = updated.workload
        ? await new WorkloadManager(this.repoRoot).createWorktree(updated.workload, {
            taskId: updated.id,
          })
        : await new WorktreeManager(this.repoRoot).create({
            taskId: updated.id,
            baseBranch: "main",
          });

      updated = await this.queue.setWorktree(
        updated.id,
        created.name,
        updated.workload ?? null,
      );
    }

    const workspace_root = await resolveTaskWorkspace(this.repoRoot, updated);

    if (provision.auto_prepare) {
      await prepareWorktreeDependencies(workspace_root);
    }

    if (!updated.worktree) {
      throw new Error(`Failed to provision worktree for task ${updated.id}`);
    }

    return {
      task_id: updated.id,
      worktree: updated.worktree,
      workspace_root,
    };
  }
}