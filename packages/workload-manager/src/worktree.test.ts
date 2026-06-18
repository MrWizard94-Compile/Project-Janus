import { mkdir, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  formatWorktreeName,
  resolveWorkloadRepoPath,
  resolveWorkloadWorktreePath,
  type Task,
} from "@aether/shared";
import { assertGitSuccess, runGit } from "@aether/worktree-manager";
import { WorkloadManager } from "./manager.js";
import { resolveTaskWorkspace } from "./worktree.js";

describe("Workload worktrees", () => {
  let janusRoot = "";

  beforeEach(async () => {
    janusRoot = await mkdtemp(join(tmpdir(), "aether-workload-worktree-"));
  });

  afterEach(async () => {
    await rm(janusRoot, { recursive: true, force: true });
  });

  async function seedWorkload(workloadId: string): Promise<string> {
    const manager = new WorkloadManager(janusRoot);
    await manager.init({
      id: workloadId,
      description: "Test workload",
      branch: "main",
    });

    const repoPath = resolveWorkloadRepoPath(janusRoot, workloadId);
    await mkdir(repoPath, { recursive: true });

    const init = await runGit(repoPath, ["init", "-b", "main"]);
    assertGitSuccess(init, "git init");
    await writeFile(join(repoPath, "README.md"), "# workload\n", "utf8");
    const commit = await runGit(repoPath, ["add", "."]);
    assertGitSuccess(commit, "git add");
    const commitResult = await runGit(repoPath, [
      "commit",
      "-m",
      "init",
      "--author",
      "Aether <aether@example.com>",
    ]);
    assertGitSuccess(commitResult, "git commit");

    return repoPath;
  }

  it("resolves workload repo and worktree paths from manifest", async () => {
    await seedWorkload("framedblocks");

    const manager = new WorkloadManager(janusRoot);
    const repoPath = await manager.resolveRepoPath("framedblocks");
    const worktreeName = formatWorktreeName("task-abc", 1);

    expect(repoPath).toBe(resolveWorkloadRepoPath(janusRoot, "framedblocks"));
    expect(resolveWorkloadWorktreePath(janusRoot, "framedblocks", worktreeName)).toBe(
      join(repoPath, ".worktrees", worktreeName),
    );
  });

  it("creates git worktrees inside the workload repository", async () => {
    await seedWorkload("framedblocks");

    const manager = new WorkloadManager(janusRoot);
    const created = await manager.createWorktree("framedblocks", {
      taskId: "task-abc",
    });

    expect(created.path).toContain(join("workloads", "framedblocks", "repo", ".worktrees"));
    expect(created.branch).toBe("aether/task-abc");

    const listed = await manager.listWorktrees("framedblocks");
    expect(listed).toHaveLength(1);
    expect(listed[0]?.task_id).toBe("task-abc");
  });

  it("resolves task workspace for workload-backed tasks", async () => {
    await seedWorkload("framedblocks");

    const manager = new WorkloadManager(janusRoot);
    const created = await manager.createWorktree("framedblocks", {
      taskId: "task-abc",
    });

    const task: Task = {
      id: "task-abc",
      parent_id: null,
      worktree: created.name,
      workload: "framedblocks",
      status: "pending",
      assignee: null,
      context_refs: [],
      spec: {
        objective: "Test",
        constraints: [],
        files_in_scope: [],
        acceptance_criteria: [],
      },
      validation_profile: "neoforge-mixin-v1",
      result: null,
      validation_attempts: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const workspace = await resolveTaskWorkspace(janusRoot, task);
    expect(normalize(workspace)).toBe(normalize(created.path));
  });

  it("destroys workload worktrees and branches", async () => {
    await seedWorkload("framedblocks");

    const manager = new WorkloadManager(janusRoot);
    await manager.createWorktree("framedblocks", { taskId: "task-abc" });

    await manager.destroyWorktree("framedblocks", "task-abc");

    const listed = await manager.listWorktrees("framedblocks");
    expect(listed).toHaveLength(0);
  });
});