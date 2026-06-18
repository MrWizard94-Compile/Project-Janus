# Phase 1 Orchestration

Claude delegates structured work to Grok. Grok never writes to disk directly — every mutation passes through the Validation Kernel.

## Claude → Grok flow

```text
Claude                          Aether                           Grok
  |                               |                               |
  |-- orchestrate plan -f plan -->|                               |
  |<-- parent + child task ids ---|                               |
  |                               |                               |
  |-- orchestrate run -t parent -->|                               |
  |                               |-- provision worktree -------->|
  |                               |-- build identity patch ------->|
  |                               |-- patch submit --apply ------->|
  |                               |<-- validation receipt --------|
  |<-- rollup + per-child results-|                               |
  |                               |                               |
  |-- orchestrate status -t parent|                               |
  |<-- complete=true, accepted ---|                               |
```

1. **Claude** authors a delegation plan JSON (parent objective + child specs).
2. **`aether orchestrate plan`** creates the parent task (`assignee: claude`) and child tasks (`assignee: grok`) in `.aether/tasks.json`.
3. **`aether orchestrate run`** provisions workload worktrees, builds identity patches from workspace files, validates, and applies for each `patch_mode: identity` child.
4. **`aether orchestrate status`** rolls up child statuses; `complete: true` when every child is `accepted`.

Optional Grok-facing commands (single-task executor surface):

- `aether execute brief -t <child-id>` — minimal executor brief
- `aether execute identity-patch -t <child-id>` — patch JSON without submit
- `aether execute run -t <child-id>` — one identity child through the gate

## Delegation plan format

Plans live under `examples/orchestration/`. Schema: `@aether/orchestrator` `DelegationPlanSchema`.

```json
{
  "parent": {
    "assignee": "claude",
    "workload": "framedblocks",
    "context_refs": ["arch:framedblocks-mixin-pattern", "doc:handoff-protocol"],
    "validation_profile": "neoforge-mixin-v1",
    "spec": {
      "objective": "Delegate mixin baseline verification to Grok",
      "constraints": ["Two-child smoke subset"],
      "files_in_scope": ["src/main/java/.../MixinFoo.java"],
      "acceptance_criteria": ["All children accepted"]
    }
  },
  "children": [
    {
      "assignee": "grok",
      "patch_mode": "identity",
      "task": {
        "workload": "framedblocks",
        "validation_profile": "neoforge-mixin-v1",
        "context_refs": ["arch:framedblocks-mixin-pattern"],
        "spec": {
          "objective": "Baseline one mixin file",
          "constraints": ["No behavior change", "Single file patch only"],
          "files_in_scope": ["src/main/java/.../MixinFoo.java"],
          "acceptance_criteria": ["Passes neoforge-mixin-v1", "Task accepted"]
        }
      }
    }
  ],
  "provision": {
    "auto_worktree": true,
    "auto_prepare": true
  }
}
```

| Field | Purpose |
|-------|---------|
| `parent` | Claude-owned coordination task |
| `children[].assignee` | Must be `grok` |
| `children[].patch_mode` | `identity` (read workspace file as-is) or `manual` (Grok supplies patch) |
| `children[].task` | Full child task input (`workload`, `validation_profile`, `spec`, `context_refs`) |
| `provision.auto_worktree` | Create workload worktree when missing (default `true`) |
| `provision.auto_prepare` | Run `worktree prepare` after create (set `true` for Gradle workloads) |

Child specs may be embedded inline (as above) or copied from existing examples under `examples/framedblocks/`.

Internal orchestration markers are stored on task `context_refs` (`aether:patch_mode:*`, `aether:provision:*`) and stripped from executor briefs.

## CLI commands

```powershell
# Create parent + children from plan
pnpm aether orchestrate plan -f examples/orchestration/framedblocks-batch01-plan.json

# Provision worktrees only (optional — run also provisions)
pnpm aether orchestrate provision -t <parent-id>

# Execute identity children end-to-end
pnpm aether orchestrate run -t <parent-id>

# Rollup status (exit 1 if incomplete)
pnpm aether orchestrate status -t <parent-id>
```

## Executor brief contract

`aether execute brief -t <child-id>` returns JSON Grok uses to scope work:

```json
{
  "task_id": "task-<uuid>",
  "assignee": "grok",
  "workspace_root": "workloads/framedblocks/repo/.worktrees/wt-...",
  "files_in_scope": ["src/main/java/.../MixinFoo.java"],
  "objective": "Baseline one mixin file",
  "constraints": ["No behavior change"],
  "validation_profile": "neoforge-mixin-v1",
  "context_refs": ["arch:framedblocks-mixin-pattern", "doc:handoff-protocol"]
}
```

Contract rules:

- **`files_in_scope`** — only these paths may appear in a patch proposal (relative to workload worktree root).
- **`validation_profile`** — determines kernel layers (`neoforge-mixin-v1`, `typescript-v1`, …).
- **`patch_mode: identity`** — Grok submits the current workspace file unchanged; used for baseline/smoke proofs.
- **`patch_mode: manual`** — Grok authors patch JSON and runs `aether patch submit`; excluded from `orchestrate run`.
- **`last_validation_errors`** — present after a failed attempt; Grok revises and resubmits.

Grok handoff steps for manual children: `aether worktree prepare` → `aether patch submit -f patch.json` → on pass → `aether patch submit -f patch.json --apply`.

## E2E smoke

Prerequisites: `workloads/framedblocks/repo` cloned, JDT.LS optional.

```powershell
pnpm build
pnpm e2e:orchestration
```

The script runs plan → run → status for the two-child FramedBlocks smoke plan (children 03 and 05), then destroys child worktrees.

## References

- Phase 0 handoff: `docs/phase0/handoff-protocol.md`
- FramedBlocks batch: `docs/phase0/framedblocks-e2e.md`
- Smoke plan: `examples/orchestration/framedblocks-batch01-plan.json`