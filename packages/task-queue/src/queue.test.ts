import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TaskQueue } from "./queue.js";

describe("TaskQueue", () => {
  let repoRoot = "";
  let queue: TaskQueue;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "aether-task-queue-"));
    queue = new TaskQueue(repoRoot);
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("creates and retrieves a task", async () => {
    const task = await queue.create({
      spec: {
        objective: "Convert mixin",
        constraints: ["No behavior change"],
        files_in_scope: ["src/MixinFoo.java"],
        acceptance_criteria: ["Compiles"],
      },
      validation_profile: "typescript-v1",
    });

    expect(task.status).toBe("pending");
    expect(await queue.get(task.id)).toEqual(task);
  });

  it("enforces status transitions", async () => {
    const task = await queue.create({
      spec: {
        objective: "Test",
        constraints: [],
        files_in_scope: [],
        acceptance_criteria: [],
      },
      validation_profile: "typescript-v1",
    });

    await queue.transition(task.id, "in_progress");
    await queue.transition(task.id, "validating");

    await expect(queue.transition(task.id, "pending")).rejects.toThrow(
      /Invalid task status transition/,
    );
  });

  it("records validation outcomes", async () => {
    const task = await queue.create({
      spec: {
        objective: "Test",
        constraints: [],
        files_in_scope: [],
        acceptance_criteria: [],
      },
      validation_profile: "typescript-v1",
    });

    await queue.transition(task.id, "in_progress");
    await queue.transition(task.id, "validating");

    const failed = await queue.recordValidation(task.id, false, [
      {
        layer: "rules",
        rule: "M001",
        message: "Mixin target missing",
      },
    ]);

    expect(failed.status).toBe("failed");
    expect(failed.validation_attempts).toHaveLength(1);
  });
});