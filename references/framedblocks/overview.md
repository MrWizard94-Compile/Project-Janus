# FramedBlocks E2E Workload

First end-to-end proof task for Aether Phase 0 (architecture §7).

## Upstream

- Repository: https://github.com/XFactHD/FramedBlocks
- CurseForge: https://www.curseforge.com/minecraft/mc-mods/framedblocks
- Workload manifest: `workloads/framedblocks/manifest.json`

## Setup

```powershell
pnpm aether workload clone framedblocks
pnpm aether setup jdtls
```

## Purpose

Exercise the full NeoForge loop:

1. Claude decomposes mass mixin work into scoped tasks.
2. Grok executes each task through the validation gate.
3. Accepted tasks land in isolated worktrees and integrate.

## Worktree convention

```
.worktrees/wt-<task-slug>-<seq>/
  branch: aether/<task-id>
```

Worktrees for FramedBlocks tasks should be created from a branch that includes the cloned workload under `workloads/framedblocks/repo/`, or from worktrees rooted inside that checkout once task orchestration supports external workload roots.

## CLI smoke path

```powershell
pnpm aether task create -f examples/task-sample.json
pnpm aether worktree create -t <task-id>
pnpm aether worktree prepare -t <task-id>
pnpm aether task status <task-id> -s in_progress
pnpm aether patch submit -f examples/patch-mixin-valid.json
```