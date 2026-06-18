# FramedBlocks Mass Mixin E2E

Step-by-step runbook for batch 01 of the FramedBlocks workload (`neoforge-mixin-v1`).

## Mixin inventory (branch `26.1`)

All mixin sources live under `workloads/framedblocks/repo/src/main/java/io/github/xfacthd/framedblocks/mixin/`.

| File | Type | @Mixin target | Notes |
|------|------|---------------|-------|
| `mixin/MixinBlockStateBase.java` | class | `BlockBehaviour.BlockStateBase` | StateCache duck; `@Nullable` only (may trip T001) |
| `mixin/MixinStairBlock.java` | class | `StairBlock` | MixinExtras `@WrapOperation`; intentional raw cast (may trip M006) |
| `mixin/MixinStateDefinitionBuilder.java` | class | `StateDefinition.Builder` | Clean baseline; used in `patch-template.json` |
| `mixin/MixinMapItemSavedData.java` | class | `MapItemSavedData` | MixinExtras expression/inject; complex |
| `mixin/client/MixinLevelRenderer.java` | class | `LevelRenderer` | Client mixin |
| `mixin/InvokerBlock.java` | interface | `Block` | `@Invoker` — batch 02 |
| `mixin/InvokerBlockItem.java` | interface | `BlockItem` | `@Invoker` — batch 02 |
| `mixin/client/AccessorMultiPlayerGameMode.java` | interface | `MultiPlayerGameMode` | `@Accessor` — batch 02 |
| `mixin/client/AccessorModelManager.java` | interface | `ModelManager` | `@Accessor` — batch 02 |

Registered in `src/main/resources/framedblocks.mixin.json`. Upstream is already **NeoForge** (`net.neoforged.moddev` in `build.gradle`); batch 01 tasks use **document-as-is** identity patches unless the validation gate surfaces fixable rule violations.

## Prerequisites

```powershell
pnpm build

# Clone workload (manifest branch: 26.1)
pnpm aether workload clone framedblocks

# Windows: if checkout fails on long paths, inside the clone:
cd workloads/framedblocks/repo
git config core.longpaths true
git restore --source=HEAD :/
cd ../../..

# Optional — LSP layer requires JDT.LS (skip for rules/AST-only smoke)
pnpm aether setup jdtls
```

**JDK:** FramedBlocks 26.1 targets Java 25 (`java.toolchain.languageVersion` in `build.gradle`). Build validation needs a compatible JDK on PATH.

## Task definitions (batch 01)

| Role | Path |
|------|------|
| Parent | `examples/framedblocks/task-batch-01.json` |
| Child 01 | `examples/framedblocks/task-batch-01-child-01-mixin-block-state-base.json` |
| Child 02 | `examples/framedblocks/task-batch-01-child-02-mixin-stair-block.json` |
| Child 03 | `examples/framedblocks/task-batch-01-child-03-mixin-state-definition-builder.json` |
| Child 04 | `examples/framedblocks/task-batch-01-child-04-mixin-map-item-saved-data.json` |
| Child 05 | `examples/framedblocks/task-batch-01-child-05-mixin-level-renderer.json` |
| Patch template | `examples/framedblocks/patch-template.json` |

All tasks use `validation_profile: neoforge-mixin-v1` and `context_refs` from `CONTEXT_CATALOG`:

- `arch:framedblocks-mixin-pattern`
- `doc:handoff-protocol`
- `ref:validation-rules`
- `ref:neoforged`

Paths in `files_in_scope` and patch proposals are **relative to the FramedBlocks workload worktree root** (not the Janus repo root). Set `"workload": "framedblocks"` on each task.

## Execute batch 01

### 1. Create parent and children

```powershell
# Parent task
pnpm aether task create -f examples/framedblocks/task-batch-01.json
# Note the returned id, e.g. task-<uuid-parent>

# Edit each child JSON: replace REPLACE_WITH_PARENT_TASK_ID with the parent id, then:
pnpm aether task create -f examples/framedblocks/task-batch-01-child-01-mixin-block-state-base.json
pnpm aether task create -f examples/framedblocks/task-batch-01-child-02-mixin-stair-block.json
pnpm aether task create -f examples/framedblocks/task-batch-01-child-03-mixin-state-definition-builder.json
pnpm aether task create -f examples/framedblocks/task-batch-01-child-04-mixin-map-item-saved-data.json
pnpm aether task create -f examples/framedblocks/task-batch-01-child-05-mixin-level-renderer.json
```

### 2. Per-child execution loop

Repeat for each child task id (`<task-id>`):

```powershell
# Provision workload worktree (base defaults to manifest branch 26.1)
pnpm aether worktree create -t <task-id> -w framedblocks

# Gradle deps — prepare skips when no package.json; first compile may download NeoForge
pnpm aether worktree prepare -t <task-id>

pnpm aether task status <task-id> -s in_progress

# Resolve agent context
pnpm aether context resolve -t <task-id>

# Dry-run validate (copy patch-template.json, set task_id, adjust content per child)
pnpm aether patch submit -f examples/framedblocks/patch-template.json

# On pass, apply
pnpm aether patch submit -f examples/framedblocks/patch-template.json --apply
```

### 3. Recommended first smoke (child 03)

`MixinStateDefinitionBuilder` is the cleanest identity patch. Copy `examples/framedblocks/patch-template.json`, set `task_id` to the child-03 task id, and submit.

### 4. Inspect and clean up

```powershell
pnpm aether task list
pnpm aether task show <task-id>
pnpm aether worktree list -w framedblocks
pnpm aether worktree destroy -t <task-id>
```

## Validation layers

| Layer | Batch 01 expectation |
|-------|----------------------|
| `rules` | Domain pack `neoforge-mixin-v1` (M001–M006, T001, B001) |
| `ast` | Mixin structural analysis on proposed Java |
| `lsp` | JDT.LS diagnostics — **skipped if `pnpm aether setup jdtls` not run** |
| `build` | `gradlew.bat compileJava` inside workload worktree |

## Known rule hotspots (batch 01)

- **MixinStairBlock** — `(Class)` cast may trigger **M006**; upstream uses `@SuppressWarnings("rawtypes")`.
- **MixinBlockStateBase / MixinMapItemSavedData** — `@Nullable` without paired `@Nonnull` may trigger **T001**.
- Child specs allow minimal annotation fixes; do not change mixin behavior.

## Batch 02 (planned)

Remaining four accessor/invoker interfaces from `framedblocks.mixin.json` client/common lists.

## References

- Workload manifest: `workloads/framedblocks/manifest.json`
- Handoff protocol: `docs/phase0/handoff-protocol.md`
- FramedBlocks overview: `references/framedblocks/overview.md`