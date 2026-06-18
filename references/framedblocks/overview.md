# FramedBlocks E2E Workload

First end-to-end proof task for Aether Phase 0 (architecture §7).

## Purpose

Exercise the full loop:

1. Claude decomposes mass mixin work into scoped tasks.
2. Grok executes each task through the validation gate.
3. Accepted tasks land in isolated worktrees and integrate.

## Open inputs (required before PR-8)

- Upstream repository URL
- Target Minecraft / NeoForge version
- Branch or tag to fork from
- Definition of "mass mixin" scope (file count, migration type)

## Worktree convention

```
.worktrees/wt-<task-slug>-<seq>/
  branch: aether/<task-id>
```

## CLI smoke path (once workload is cloned)

```powershell
pnpm aether task create -f examples/task-sample.json
pnpm aether worktree create -t <task-id>
pnpm aether task status <task-id> -s in_progress
```