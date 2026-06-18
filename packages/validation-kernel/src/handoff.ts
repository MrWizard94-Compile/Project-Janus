import type { PatchProposal, Task } from "@aether/shared";
import { hashPatch } from "@aether/shared";
import { TaskQueue } from "@aether/task-queue";
import { resolveTaskWorkspace } from "@aether/workload-manager";
import { ValidationKernel } from "./kernel.js";
import { applyPatch } from "./patch.js";
import { readReceipt, receiptMatchesProposal } from "./receipt.js";
import type { ValidationResult } from "./types.js";
export interface SubmitPatchOptions {
  repoRoot: string;
  proposal: PatchProposal;
  apply: boolean;
}

export interface SubmitPatchResult {
  task: Task;
  validation: ValidationResult;
  applied: boolean;
}

export class HandoffService {
  private readonly queue: TaskQueue;
  private readonly kernel: ValidationKernel;

  constructor(repoRoot: string) {
    this.queue = new TaskQueue(repoRoot);
    this.kernel = new ValidationKernel();
  }

  async submit(options: SubmitPatchOptions): Promise<SubmitPatchResult> {
    let task = await this.queue.get(options.proposal.task_id);

    if (task.status === "pending") {
      task = await this.queue.transition(task.id, "in_progress");
    } else if (task.status === "failed") {
      task = await this.queue.transition(task.id, "in_progress");
    } else if (task.status !== "in_progress") {
      throw new Error(`Task ${task.id} cannot accept patches in status ${task.status}`);
    }

    const workspaceRoot = await this.resolveWorkspace(options.repoRoot, task);
    task = await this.queue.transition(task.id, "validating");

    const validation = await this.kernel.validate({
      repoRoot: options.repoRoot,
      workspaceRoot,
      task,
      proposal: options.proposal,
      persistOnPass: options.apply,
    });

    const updated = await this.queue.recordValidation(
      task.id,
      validation.passed,
      validation.errors,
      options.apply,
    );

    return {
      task: updated,
      validation,
      applied: validation.passed && options.apply,
    };
  }

  async applyValidatedPatch(
    repoRoot: string,
    proposal: PatchProposal,
  ): Promise<Task> {
    const receipt = await readReceipt(repoRoot, proposal.task_id);
    if (!receipt || !receiptMatchesProposal(receipt, proposal)) {
      throw new Error(
        `No passing validation receipt matches patch hash ${hashPatch(proposal)} for task ${proposal.task_id}`,
      );
    }

    const task = await this.queue.get(proposal.task_id);
    const workspaceRoot = await this.resolveWorkspace(repoRoot, task);
    await applyPatch(workspaceRoot, proposal);

    if (task.status !== "accepted") {
      return this.queue.transition(proposal.task_id, "accepted");
    }

    return this.queue.setResult(proposal.task_id, "patch_applied");
  }

  private async resolveWorkspace(
    repoRoot: string,
    task: Awaited<ReturnType<TaskQueue["get"]>>,
  ): Promise<string> {
    return resolveTaskWorkspace(repoRoot, task);
  }
}