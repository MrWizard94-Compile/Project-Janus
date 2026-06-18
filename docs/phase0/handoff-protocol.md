# Phase 0 Handoff Protocol

Agents never write to the filesystem directly. All mutations flow through the Validation Kernel.

## Flow

1. **Claude** creates a task (`aether task create`).
2. **Claude** provisions a worktree (`aether worktree create -t <task-id>`).
3. **Grok** moves task to `in_progress` and prepares a patch proposal JSON.
4. **Grok** runs `aether worktree prepare -t <task-id>` when the worktree needs dependencies built.
5. **Grok** runs `aether patch submit -f patch.json` (dry-run validate). On pass the task stays `in_progress` with result `validation_passed_pending_apply`.
6. On failure, kernel returns structured errors per layer; Grok revises and resubmits.
7. On success, **Grok** runs `aether patch submit -f patch.json --apply` or `aether patch apply -f patch.json` using the stored receipt. Apply transitions the task to `accepted`.
8. **Claude** reviews the resulting diff in the worktree branch and accepts or rejects.

## Patch proposal format

```json
{
  "task_id": "task-<uuid>",
  "allow_overwrite": false,
  "files": [
    { "path": "relative/path/FromWorktreeRoot.java", "content": "full file content" }
  ]
}
```

## Validation layers

| Layer | Purpose |
|-------|---------|
| `lsp` | JDT.LS diagnostics (requires `.aether/config.json`) |
| `ast` | Mixin structural analysis |
| `rules` | Domain rule pack (`neoforge-mixin-v1`, `typescript-v1`) |
| `build` | Profile build command in worktree |

## Receipts

Passing validations write `.aether/receipts/<task-id>.json` with a SHA-256 hash of the canonical patch. Apply refuses mismatched patches.