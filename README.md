# Project Janus

Dual-AI development platform (**Aether**) — Claude orchestrates, Grok executes, a deterministic Validation Kernel gates all filesystem mutations.

## Status

Phase 0 (Foundation) — task queue, worktree manager, validation kernel, and patch handoff landed.

## Requirements

- Node.js >= 20
- pnpm >= 9
- Git

## Setup

```powershell
pnpm install
pnpm build
pnpm test
```

## CLI

```powershell
pnpm aether task create -f examples/task-sample.json
pnpm aether task list
pnpm aether worktree create -t <task-id>
pnpm aether patch submit -f examples/patch-mixin-valid.json
pnpm aether patch submit -f examples/patch-mixin-valid.json --apply
```

Task state is stored in `.aether/tasks.json`. Worktrees live under `.worktrees/`. Validation receipts live in `.aether/receipts/`.

Copy `examples/aether-config.example.json` to `.aether/config.json` when JDT.LS Java validation is required.

## Packages

| Package | Purpose |
|---------|---------|
| `@aether/shared` | Task schema, paths, validation profiles |
| `@aether/task-queue` | JSON-backed structured task queue |
| `@aether/worktree-manager` | Git worktree lifecycle per task |
| `@aether/validation-kernel` | LSP, AST, rules, build layers + patch gate |
| `@aether/cli` | Unified `aether` command |

## Key documents

- [AETHER_ARCHITECTURE.md](./AETHER_ARCHITECTURE.md) — system architecture (locked v1.0)
- [SOUL.md](./SOUL.md) — engineering standards and operational doctrine
- [references/](./references/) — verified APIs, patterns, and research notes

## Repository

https://github.com/MrWizard94-Compile/Project-Janus