import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HandoffService } from "@aether/validation-kernel";
import { assertGitSuccess, runGit } from "@aether/worktree-manager";
import { WorkloadManager } from "@aether/workload-manager";
import { OrchestratorService } from "./service.js";
import { DelegationPlanSchema } from "./plan.js";

describe("OrchestratorService", () => {
  let janusRoot = "";
  let service: OrchestratorService;

  beforeEach(async () => {
    janusRoot = await mkdtemp(join(tmpdir(), "aether-orchestrator-"));
    service = new OrchestratorService(janusRoot);
  });

  afterEach(async () => {
    await rm(janusRoot, { recursive: true, force: true });
  });

  async function seedJanusRepo(): Promise<void> {
    const init = await runGit(janusRoot, ["init", "-b", "main"]);
    assertGitSuccess(init, "git init");
    await writeFile(join(janusRoot, "README.md"), "# janus\n", "utf8");
    const add = await runGit(janusRoot, ["add", "."]);
    assertGitSuccess(add, "git add");
    const commit = await runGit(janusRoot, [
      "commit",
      "-m",
      "init",
      "--author",
      "Aether <aether@example.com>",
    ]);
    assertGitSuccess(commit, "git commit");
  }

  async function seedWorkload(workloadId: string): Promise<void> {
    const manager = new WorkloadManager(janusRoot);
    await manager.init({
      id: workloadId,
      description: "Test workload",
      branch: "main",
    });

    const repoPath = join(janusRoot, "workloads", workloadId, "repo");
    await mkdir(repoPath, { recursive: true });

    const init = await runGit(repoPath, ["init", "-b", "main"]);
    assertGitSuccess(init, "git init");
    await writeFile(join(repoPath, "README.md"), "# workload\n", "utf8");
    const add = await runGit(repoPath, ["add", "."]);
    assertGitSuccess(add, "git add");
    const commit = await runGit(repoPath, [
      "commit",
      "-m",
      "init",
      "--author",
      "Aether <aether@example.com>",
    ]);
    assertGitSuccess(commit, "git commit");
  }

  const samplePlan = {
    parent: {
      assignee: "claude" as const,
      spec: {
        objective: "Coordinate child tasks",
        constraints: ["Delegate safely"],
        files_in_scope: [],
        acceptance_criteria: ["All children accepted"],
      },
      validation_profile: "typescript-v1",
      context_refs: ["parent-context"],
    },
    children: [
      {
        assignee: "grok" as const,
        patch_mode: "identity" as const,
        task: {
          spec: {
            objective: "Touch README",
            constraints: [],
            files_in_scope: ["README.md"],
            acceptance_criteria: ["File unchanged"],
          },
          validation_profile: "typescript-v1",
          context_refs: ["child-context"],
        },
      },
      {
        assignee: "grok" as const,
        patch_mode: "manual" as const,
        task: {
          spec: {
            objective: "Manual patch child",
            constraints: [],
            files_in_scope: ["README.md"],
            acceptance_criteria: ["Manual review"],
          },
          validation_profile: "typescript-v1",
        },
      },
    ],
    provision: {
      auto_worktree: true,
      auto_prepare: false,
    },
  };

  it("parses delegation plan schema defaults", () => {
    const parsed = DelegationPlanSchema.parse({
      parent: samplePlan.parent,
      children: [samplePlan.children[0]],
    });

    expect(parsed.provision.auto_worktree).toBe(true);
    expect(parsed.provision.auto_prepare).toBe(false);
    expect(parsed.children[0]?.patch_mode).toBe("identity");
  });

  it("creates parent and child tasks from a plan", async () => {
    const { parent, children } = await service.createPlan(samplePlan);

    expect(parent.assignee).toBe("claude");
    expect(parent.context_refs).toContain("aether:provision:auto_worktree:true");
    expect(parent.context_refs).toContain("parent-context");

    expect(children).toHaveLength(2);
    expect(children.every((child) => child.parent_id === parent.id)).toBe(true);
    expect(children[0]?.assignee).toBe("grok");
    expect(children[0]?.context_refs).toContain("aether:patch_mode:identity");
    expect(children[1]?.context_refs).toContain("aether:patch_mode:manual");
  });

  it("lists children for a parent task", async () => {
    const { parent } = await service.createPlan(samplePlan);
    const children = await service.listChildren(parent.id);

    expect(children).toHaveLength(2);
    expect(children.map((child) => child.id).sort()).toEqual(
      (await service.listChildren(parent.id)).map((child) => child.id).sort(),
    );
  });

  it("rolls up child status counts", async () => {
    const { parent, children } = await service.createPlan(samplePlan);

    let rollup = await service.rollupStatus(parent.id);
    expect(rollup.total).toBe(2);
    expect(rollup.by_status.pending).toBe(2);
    expect(rollup.complete).toBe(false);

    const queue = new (await import("@aether/task-queue")).TaskQueue(janusRoot);
    await queue.transition(children[0]!.id, "in_progress");
    await queue.transition(children[0]!.id, "validating");
    await queue.recordValidation(children[0]!.id, true, [], true);

    rollup = await service.rollupStatus(parent.id);
    expect(rollup.by_status.accepted).toBe(1);
    expect(rollup.by_status.pending).toBe(1);
    expect(rollup.complete).toBe(false);
  });

  it("provisions janus worktrees for child tasks", async () => {
    await seedJanusRepo();
    const { parent } = await service.createPlan(samplePlan);
    const provisioned = await service.provisionChildren(parent.id);

    expect(provisioned).toHaveLength(2);
    for (const entry of provisioned) {
      expect(entry.worktree).toMatch(/^wt-/);
      expect(entry.workspace_root).toContain(entry.worktree);
    }
  });

  it("provisions workload-backed child worktrees", async () => {
    await seedWorkload("framedblocks");

    const plan = {
      ...samplePlan,
      children: [
        {
          assignee: "grok" as const,
          patch_mode: "identity" as const,
          task: {
            workload: "framedblocks",
            spec: {
              objective: "Workload child",
              constraints: [],
              files_in_scope: ["README.md"],
              acceptance_criteria: ["Ready"],
            },
            validation_profile: "neoforge-mixin-v1",
          },
        },
      ],
    };

    const { parent } = await service.createPlan(plan);
    const [provisioned] = await service.provisionChildren(parent.id);

    expect(normalize(provisioned!.workspace_root)).toContain(
      normalize(join("workloads", "framedblocks", "repo", ".worktrees")),
    );
    expect(normalize(provisioned!.workspace_root)).toContain(
      normalize(provisioned!.worktree),
    );
  });

  it("builds executor brief without internal context refs", async () => {
    await seedJanusRepo();
    const { parent } = await service.createPlan({
      ...samplePlan,
      children: [samplePlan.children[0]!],
    });
    await service.provisionChildren(parent.id);

    const child = (await service.listChildren(parent.id))[0]!;
    const brief = await service.buildExecutorBrief(child.id);

    expect(brief).toMatchObject({
      task_id: child.id,
      assignee: "grok",
      files_in_scope: ["README.md"],
      objective: "Touch README",
      validation_profile: "typescript-v1",
      context_refs: ["child-context"],
    });
    expect(brief.workspace_root).toContain(child.worktree ?? "");
  });

  it("builds identity patch from workspace files", async () => {
    await seedJanusRepo();
    const { parent } = await service.createPlan({
      ...samplePlan,
      children: [samplePlan.children[0]!],
    });
    await service.provisionChildren(parent.id);

    const child = (await service.listChildren(parent.id))[0]!;
    const proposal = await service.buildIdentityPatch(child.id);

    expect(proposal.task_id).toBe(child.id);
    expect(proposal.files[0]?.path).toBe("README.md");
    expect(proposal.files[0]?.content.replace(/\r\n/g, "\n")).toBe("# janus\n");
  });

  it("errors when identity patch file is missing", async () => {
    await seedJanusRepo();
    const { parent } = await service.createPlan({
      ...samplePlan,
      children: [
        {
          assignee: "grok" as const,
          patch_mode: "identity" as const,
          task: {
            spec: {
              objective: "Missing file",
              constraints: [],
              files_in_scope: ["missing.txt"],
              acceptance_criteria: [],
            },
            validation_profile: "typescript-v1",
          },
        },
      ],
    });
    await service.provisionChildren(parent.id);
    const child = (await service.listChildren(parent.id))[0]!;

    await expect(service.buildIdentityPatch(child.id)).rejects.toThrow(
      /File missing from workspace/,
    );
  });

  it("executes identity tasks through handoff submit", async () => {
    await seedJanusRepo();
    const { parent } = await service.createPlan({
      ...samplePlan,
      children: [samplePlan.children[0]!],
    });
    await service.provisionChildren(parent.id);
    const child = (await service.listChildren(parent.id))[0]!;

    const submitSpy = vi.spyOn(HandoffService.prototype, "submit").mockResolvedValue({
      task: { ...child, status: "accepted", result: "validation_passed" },
      validation: { passed: true, errors: [] },
      applied: true,
    });

    const result = await service.executeIdentityTask(child.id);

    expect(submitSpy).toHaveBeenCalledOnce();
    expect(result.applied).toBe(true);
    expect(result.validation.passed).toBe(true);

    submitSpy.mockRestore();
  });

  it("runs only identity children sequentially by default", async () => {
    await seedJanusRepo();
    const { parent } = await service.createPlan(samplePlan);
    await service.provisionChildren(parent.id);

    const executeSpy = vi
      .spyOn(OrchestratorService.prototype, "executeIdentityTask")
      .mockImplementation(async (taskId) => ({
        task: {
          id: taskId,
          parent_id: parent.id,
          worktree: "wt-test",
          workload: null,
          status: "accepted",
          assignee: "grok",
          context_refs: [],
          spec: samplePlan.children[0]!.task.spec,
          validation_profile: "typescript-v1",
          result: "validation_passed",
          validation_attempts: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        validation: { passed: true, errors: [] },
        applied: true,
      }));

    const results = await service.runChildren(parent.id);

    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);

    executeSpy.mockRestore();
  });
});