import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveWorkloadRepoPath,
  resolveWorkloadWorktreePath,
} from "./paths.js";

describe("workload paths", () => {
  it("resolves workload repo and worktree directories", () => {
    const janusRoot = "C:/janus";
    const worktreeName = "wt-task-abc-01";

    expect(resolveWorkloadRepoPath(janusRoot, "framedblocks")).toBe(
      join(janusRoot, "workloads", "framedblocks", "repo"),
    );
    expect(resolveWorkloadWorktreePath(janusRoot, "framedblocks", worktreeName)).toBe(
      join(janusRoot, "workloads", "framedblocks", "repo", ".worktrees", worktreeName),
    );
  });
});