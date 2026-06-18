import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { AssigneeSchema, TaskStatusSchema } from "@aether/shared";
import { TaskQueue } from "@aether/task-queue";
import { WorktreeManager } from "@aether/worktree-manager";
import { findRepoRoot } from "./repo.js";

interface TaskCreateFile {
  parent_id?: string | null;
  worktree?: string | null;
  assignee?: "grok" | "claude" | null;
  context_refs?: string[];
  validation_profile: string;
  spec: {
    objective: string;
    constraints: string[];
    files_in_scope: string[];
    acceptance_criteria: string[];
  };
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("aether")
    .description("Aether Phase 0 CLI — task queue and worktree management")
    .version("0.1.0");

  const task = program.command("task").description("Manage structured tasks");

  task
    .command("create")
    .description("Create a task from a JSON file")
    .requiredOption("-f, --file <path>", "Task definition JSON file")
    .action(async (options: { file: string }) => {
      const repoRoot = await findRepoRoot(process.cwd());
      const queue = new TaskQueue(repoRoot);
      const raw = await readFile(options.file, "utf8");
      const parsed = JSON.parse(raw) as TaskCreateFile;
      const created = await queue.create({
        ...parsed,
        context_refs: parsed.context_refs ?? [],
      });
      console.log(JSON.stringify(created, null, 2));
    });

  task
    .command("list")
    .description("List all tasks")
    .action(async () => {
      const repoRoot = await findRepoRoot(process.cwd());
      const queue = new TaskQueue(repoRoot);
      const tasks = await queue.list();
      console.log(JSON.stringify(tasks, null, 2));
    });

  task
    .command("show")
    .description("Show a single task")
    .argument("<taskId>", "Task identifier")
    .action(async (taskId: string) => {
      const repoRoot = await findRepoRoot(process.cwd());
      const queue = new TaskQueue(repoRoot);
      const entry = await queue.get(taskId);
      console.log(JSON.stringify(entry, null, 2));
    });

  task
    .command("assign")
    .description("Assign a task to grok or claude")
    .argument("<taskId>", "Task identifier")
    .requiredOption("-a, --assignee <name>", "grok or claude")
    .action(async (taskId: string, options: { assignee: string }) => {
      const repoRoot = await findRepoRoot(process.cwd());
      const queue = new TaskQueue(repoRoot);
      const assignee = AssigneeSchema.parse(options.assignee);
      const updated = await queue.assign(taskId, assignee);
      console.log(JSON.stringify(updated, null, 2));
    });

  task
    .command("status")
    .description("Transition task status")
    .argument("<taskId>", "Task identifier")
    .requiredOption("-s, --status <status>", "Target status")
    .action(async (taskId: string, options: { status: string }) => {
      const repoRoot = await findRepoRoot(process.cwd());
      const queue = new TaskQueue(repoRoot);
      const status = TaskStatusSchema.parse(options.status);
      const updated = await queue.transition(taskId, status);
      console.log(JSON.stringify(updated, null, 2));
    });

  const worktree = program.command("worktree").description("Manage git worktrees");

  worktree
    .command("create")
    .description("Create an isolated worktree for a task")
    .requiredOption("-t, --task <taskId>", "Task identifier")
    .option("-b, --base <branch>", "Base branch", "main")
    .action(async (options: { task: string; base: string }) => {
      const repoRoot = await findRepoRoot(process.cwd());
      const manager = new WorktreeManager(repoRoot);
      const queue = new TaskQueue(repoRoot);

      const created = await manager.create({
        taskId: options.task,
        baseBranch: options.base,
      });

      const updated = await queue.setWorktree(options.task, created.name);
      console.log(JSON.stringify({ worktree: created, task: updated }, null, 2));
    });

  worktree
    .command("list")
    .description("List Aether-managed worktrees")
    .action(async () => {
      const repoRoot = await findRepoRoot(process.cwd());
      const manager = new WorktreeManager(repoRoot);
      const entries = await manager.list();
      console.log(JSON.stringify(entries, null, 2));
    });

  worktree
    .command("destroy")
    .description("Remove worktree and branch for a task")
    .requiredOption("-t, --task <taskId>", "Task identifier")
    .action(async (options: { task: string }) => {
      const repoRoot = await findRepoRoot(process.cwd());
      const manager = new WorktreeManager(repoRoot);
      const queue = new TaskQueue(repoRoot);

      await manager.destroy(options.task);
      const updated = await queue.setWorktree(options.task, null);
      console.log(JSON.stringify(updated, null, 2));
    });

  return program;
}