# Project Janus

Dual-AI development platform (**Aether**) — Claude orchestrates, Grok executes, a deterministic Validation Kernel gates all filesystem mutations.

## Status

Phase 1 (Orchestration Core) — Claude→Grok delegation plans, `aether orchestrate` CLI, executor brief contract, and FramedBlocks two-child orchestration E2E proof.

## Requirements

- Node.js >= 20
- pnpm >= 9
- Git

## Setup

```powershell
pnpm install
pnpm build
pnpm test
pnpm e2e:typescript
pnpm e2e:framedblocks           # single-child smoke (child 03)
pnpm e2e:framedblocks-batch01   # full batch-01: all five mixin children
pnpm e2e:orchestration          # Phase 1: plan → run → status (children 03 + 05)
```

FramedBlocks E2E requires `aether workload clone framedblocks` and `aether setup jdtls`.

## CLI

```powershell
pnpm aether task create -f examples/task-sample.json
pnpm aether task list
pnpm aether worktree create -t <task-id>
pnpm aether patch submit -f examples/patch-mixin-valid.json
pnpm aether setup jdtls
pnpm aether workload init framedblocks -d "FramedBlocks mass mixin E2E"
pnpm aether patch submit -f examples/patch-mixin-valid.json --apply
pnpm aether orchestrate plan -f examples/orchestration/framedblocks-batch01-plan.json
pnpm aether orchestrate run -t <parent-id>
pnpm aether orchestrate status -t <parent-id>
```

Task state is stored in `.aether/tasks.json`. Worktrees live under `.worktrees/`. Validation receipts live in `.aether/receipts/`. JDT.LS installs to `.tools/jdtls/`.

### MCP server (task-scoped)

Set `AETHER_TASK_ID` and run `packages/mcp-server/dist/bin.js` via stdio. See `examples/mcp-server-config.json`.

## Packages

| Package | Purpose |
|---------|---------|
| `@aether/shared` | Task schema, paths, validation profiles |
| `@aether/task-queue` | JSON-backed structured task queue |
| `@aether/worktree-manager` | Git worktree lifecycle per task |
| `@aether/validation-kernel` | LSP, AST, rules, build layers + patch gate |
| `@aether/context` | Context ref resolver for scoped agent input |
| `@aether/workload-manager` | Workload manifests, clone, JDT.LS bootstrap |
| `@aether/mcp-server` | Task-scoped MCP resources over stdio |
| `@aether/orchestrator` | Delegation plans, rollups, identity child execution |
| `@aether/cli` | Unified `aether` command |

## Key documents

- [docs/phase1/orchestration.md](./docs/phase1/orchestration.md) — Phase 1 delegation flow and plan format
- [AETHER_ARCHITECTURE.md](./AETHER_ARCHITECTURE.md) — system architecture (locked v1.0)
- [SOUL.md](./SOUL.md) — engineering standards and operational doctrine
- [references/](./references/) — verified APIs, patterns, and research notes

## Repository

https://github.com/MrWizard94-Compile/Project-Janus