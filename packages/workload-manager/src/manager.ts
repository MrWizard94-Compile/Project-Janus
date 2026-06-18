import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  resolveWorkloadDir,
  resolveWorkloadRepoPath,
  resolveWorkloadsDir,
  resolveWorktreePath,
} from "@aether/shared";
import {
  assertGitSuccess,
  runGit,
  WorktreeManager,
  type CreateWorktreeOptions,
  type WorktreeEntry,
} from "@aether/worktree-manager";
import { WorkloadManifest, WorkloadManifestSchema } from "./manifest.js";

export interface InitWorkloadOptions {
  id: string;
  description: string;
  repository?: string | null;
  branch?: string;
  validation_profile?: string;
}

export class WorkloadManager {
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  async init(options: InitWorkloadOptions): Promise<WorkloadManifest> {
    const workloadDir = resolveWorkloadDir(this.repoRoot, options.id);
    await mkdir(workloadDir, { recursive: true });

    const manifest = WorkloadManifestSchema.parse({
      id: options.id,
      description: options.description,
      repository: options.repository ?? null,
      branch: options.branch ?? "main",
      validation_profile: options.validation_profile ?? "neoforge-mixin-v1",
      clone_path: "repo",
    });

    await writeFile(
      join(workloadDir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    return manifest;
  }

  async list(): Promise<WorkloadManifest[]> {
    const workloadsDir = resolveWorkloadsDir(this.repoRoot);
    await mkdir(workloadsDir, { recursive: true });

    const { readdir, stat } = await import("node:fs/promises");
    const entries = await readdir(workloadsDir, { withFileTypes: true });
    const manifests: WorkloadManifest[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const manifestPath = join(workloadsDir, entry.name, "manifest.json");
      try {
        const raw = await readFile(manifestPath, "utf8");
        manifests.push(WorkloadManifestSchema.parse(JSON.parse(raw) as unknown));
      } catch {
        continue;
      }
    }

    return manifests.sort((a, b) => a.id.localeCompare(b.id));
  }

  async get(workloadId: string): Promise<WorkloadManifest> {
    const manifestPath = join(resolveWorkloadDir(this.repoRoot, workloadId), "manifest.json");
    const raw = await readFile(manifestPath, "utf8");
    return WorkloadManifestSchema.parse(JSON.parse(raw) as unknown);
  }

  async setRepository(
    workloadId: string,
    repository: string,
    branch: string,
  ): Promise<WorkloadManifest> {
    const manifest = await this.get(workloadId);
    const updated = WorkloadManifestSchema.parse({
      ...manifest,
      repository,
      branch,
    });

    await writeFile(
      join(resolveWorkloadDir(this.repoRoot, workloadId), "manifest.json"),
      `${JSON.stringify(updated, null, 2)}\n`,
      "utf8",
    );

    return updated;
  }

  async clone(workloadId: string): Promise<{ manifest: WorkloadManifest; repo_path: string }> {
    const manifest = await this.get(workloadId);
    if (!manifest.repository) {
      throw new Error(
        `Workload ${workloadId} has no repository URL. Run: aether workload init ${workloadId} --url <repo>`,
      );
    }

    const workloadDir = resolveWorkloadDir(this.repoRoot, workloadId);
    const repoPath = join(workloadDir, manifest.clone_path);
    await mkdir(workloadDir, { recursive: true });

    const exists = await runGit(repoPath, ["rev-parse", "--is-inside-work-tree"]);
    if (exists.exitCode === 0) {
      const pull = await runGit(repoPath, ["pull", "--ff-only", "origin", manifest.branch]);
      assertGitSuccess(pull, `pull ${manifest.branch}`);
      return { manifest, repo_path: repoPath };
    }

    const clone = await runGit(workloadDir, [
      "clone",
      "--branch",
      manifest.branch,
      "--single-branch",
      manifest.repository,
      manifest.clone_path,
    ]);
    assertGitSuccess(clone, `clone ${manifest.repository}`);

    return { manifest, repo_path: repoPath };
  }

  async resolveRepoPath(workloadId: string): Promise<string> {
    const manifest = await this.get(workloadId);
    return resolveWorkloadRepoPath(this.repoRoot, workloadId, manifest.clone_path);
  }

  async assertRepoReady(workloadId: string): Promise<string> {
    const repoPath = await this.resolveRepoPath(workloadId);
    const insideWorkTree = await runGit(repoPath, ["rev-parse", "--is-inside-work-tree"]);

    if (insideWorkTree.exitCode !== 0) {
      throw new Error(
        `Workload ${workloadId} repository is not cloned at ${repoPath}. Run: aether workload clone ${workloadId}`,
      );
    }

    return repoPath;
  }

  private async worktreeManager(workloadId: string): Promise<WorktreeManager> {
    const repoPath = await this.assertRepoReady(workloadId);
    return new WorktreeManager(repoPath);
  }

  async createWorktree(
    workloadId: string,
    options: CreateWorktreeOptions,
  ): Promise<WorktreeEntry> {
    const manifest = await this.get(workloadId);
    const manager = await this.worktreeManager(workloadId);

    return manager.create({
      ...options,
      baseBranch: options.baseBranch ?? manifest.branch,
    });
  }

  async listWorktrees(workloadId: string): Promise<WorktreeEntry[]> {
    const manager = await this.worktreeManager(workloadId);
    return manager.list();
  }

  async findWorktreeByTaskId(
    workloadId: string,
    taskId: string,
  ): Promise<WorktreeEntry | null> {
    const manager = await this.worktreeManager(workloadId);
    return manager.findByTaskId(taskId);
  }

  async destroyWorktree(workloadId: string, taskId: string): Promise<void> {
    const manager = await this.worktreeManager(workloadId);
    await manager.destroy(taskId);
  }

  async resolveWorktreePath(
    workloadId: string,
    taskId: string,
    worktreeName: string,
  ): Promise<string> {
    const entry = await this.findWorktreeByTaskId(workloadId, taskId);
    if (entry) {
      return entry.path;
    }

    const repoPath = await this.assertRepoReady(workloadId);
    return resolveWorktreePath(repoPath, worktreeName);
  }
}