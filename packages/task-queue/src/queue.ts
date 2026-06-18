import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import {
  assertTransition,
  CreateTaskInput,
  CreateTaskInputSchema,
  getValidationProfile,
  resolveTasksPath,
  Task,
  TaskSchema,
  TaskStatus,
  ValidationAttempt,
  ValidationError,
} from "@aether/shared";

interface TaskStore {
  version: 1;
  tasks: Task[];
}

const EMPTY_STORE: TaskStore = { version: 1, tasks: [] };

export class TaskQueue {
  private readonly tasksPath: string;

  constructor(repoRoot: string) {
    this.tasksPath = resolveTasksPath(repoRoot);
  }

  async list(): Promise<Task[]> {
    const store = await this.readStore();
    return [...store.tasks].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  async get(taskId: string): Promise<Task> {
    const task = (await this.readStore()).tasks.find((entry) => entry.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const parsed = CreateTaskInputSchema.parse(input);
    getValidationProfile(parsed.validation_profile);

    const now = new Date().toISOString();
    const task: Task = TaskSchema.parse({
      id: `task-${randomUUID()}`,
      parent_id: parsed.parent_id ?? null,
      worktree: parsed.worktree ?? null,
      status: "pending",
      assignee: parsed.assignee ?? null,
      context_refs: parsed.context_refs,
      spec: parsed.spec,
      validation_profile: parsed.validation_profile,
      result: null,
      validation_attempts: [],
      created_at: now,
      updated_at: now,
    });

    await this.mutate((store) => {
      store.tasks.push(task);
    });

    return task;
  }

  async assign(taskId: string, assignee: Task["assignee"]): Promise<Task> {
    return this.mutateTask(taskId, (task) => {
      task.assignee = assignee;
    });
  }

  async setWorktree(taskId: string, worktree: string | null): Promise<Task> {
    return this.mutateTask(taskId, (task) => {
      task.worktree = worktree;
    });
  }

  async transition(taskId: string, status: TaskStatus): Promise<Task> {
    return this.mutateTask(taskId, (task) => {
      assertTransition(task.status, status);
      task.status = status;
    });
  }

  async recordValidation(
    taskId: string,
    passed: boolean,
    errors: ValidationError[],
    acceptTask = true,
  ): Promise<Task> {
    const attempt: ValidationAttempt = {
      attempted_at: new Date().toISOString(),
      passed,
      errors,
    };

    return this.mutateTask(taskId, (task) => {
      if (task.status !== "validating" && task.status !== "in_progress") {
        throw new Error(
          `Cannot record validation for task ${taskId} in status ${task.status}`,
        );
      }

      task.validation_attempts.push(attempt);
      if (!passed) {
        task.status = "failed";
        return;
      }

      if (acceptTask) {
        task.status = "accepted";
        task.result = "validation_passed";
        return;
      }

      task.status = "in_progress";
      task.result = "validation_passed_pending_apply";
    });
  }

  async setResult(taskId: string, result: string | null): Promise<Task> {
    return this.mutateTask(taskId, (task) => {
      task.result = result;
    });
  }

  private async mutateTask(
    taskId: string,
    mutator: (task: Task) => void,
  ): Promise<Task> {
    let updated: Task | null = null;

    await this.mutate((store) => {
      const index = store.tasks.findIndex((entry) => entry.id === taskId);
      if (index === -1) {
        throw new Error(`Task not found: ${taskId}`);
      }

      const task = store.tasks[index];
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      mutator(task);
      task.updated_at = new Date().toISOString();
      updated = TaskSchema.parse(task);
      store.tasks[index] = updated;
    });

    if (!updated) {
      throw new Error(`Failed to update task: ${taskId}`);
    }

    return updated;
  }

  private async readStore(): Promise<TaskStore> {
    try {
      const raw = await readFile(this.tasksPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      const tasks = zodParseStore(parsed);
      return { version: 1, tasks };
    } catch (error) {
      if (isNotFoundError(error)) {
        return { ...EMPTY_STORE };
      }
      throw error;
    }
  }

  private async mutate(mutator: (store: TaskStore) => void): Promise<void> {
    const store = await this.readStore();
    mutator(store);
    store.tasks = store.tasks.map((task) => TaskSchema.parse(task));

    const dir = dirname(this.tasksPath);
    await mkdir(dir, { recursive: true });

    const tempPath = `${this.tasksPath}.${process.pid}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
    await rename(tempPath, this.tasksPath);
  }
}

function zodParseStore(parsed: unknown): Task[] {
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("tasks" in parsed) ||
    !Array.isArray(parsed.tasks)
  ) {
    throw new Error("Invalid task store format");
  }

  return parsed.tasks.map((task) => TaskSchema.parse(task));
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}