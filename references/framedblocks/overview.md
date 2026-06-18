# FramedBlocks E2E Workload

First end-to-end proof task for Aether Phase 0 (architecture §7).

## Upstream

- Repository: https://github.com/XFactHD/FramedBlocks
- CurseForge: https://www.curseforge.com/minecraft/mc-mods/framedblocks
- Workload manifest: `workloads/framedblocks/manifest.json`
- Cloned checkout: `workloads/framedblocks/repo/`

## Clone status

| Field | Value |
|-------|-------|
| Status | **Success (with branch caveat)** — checkout present and complete on disk |
| Repo path | `workloads/framedblocks/repo/` |
| Active branch | `26.1` (tracks `origin/26.1`) |
| Manifest branch | `main` (does **not** exist upstream; only `26.1` remote branch) |

`pnpm aether workload clone framedblocks` fails on re-run because the workload manager pulls `origin/main`. Update `workloads/framedblocks/manifest.json` to `"branch": "26.1"` before refresh, or clone manually:

```powershell
git clone --branch 26.1 --single-branch https://github.com/XFactHD/FramedBlocks.git workloads/framedblocks/repo
```

## Versions (from `gradle.properties` / `build.gradle`)

| Component | Version |
|-----------|---------|
| Minecraft | `26.1.2` |
| NeoForge | `26.1.2.53-beta` |
| Mod version | `11.3.2` |
| Java toolchain | 25 |
| Gradle wrapper | 9.2.1 |
| NeoForge moddev plugin | `net.neoforged.moddev` 2.0.140 |
| Mixin compatibility | JAVA_25 (`framedblocks.mixin.json`) |
| MixinExtras min | 0.5.0 |

## Branch structure

Upstream uses **MC-version branches**, not `main`:

- `origin/26.1` — current default / only remote branch (MC 26.1.x line)

## Mixin inventory

**9 mixin class files** (11 Java files under `mixin/` including `package-info.java`).

Config: `src/main/resources/framedblocks.mixin.json`  
Registered in: `src/main/resources/META-INF/neoforge.mods.toml`

### Common / server mixins (6)

| File | Target | Role |
|------|--------|------|
| `mixin/InvokerBlock.java` | `Block` | `@Invoker` for protected `registerDefaultState` |
| `mixin/InvokerBlockItem.java` | `BlockItem` | `@Invoker` for placement helpers |
| `mixin/MixinBlockStateBase.java` | `BlockBehaviour.BlockStateBase` | `StateCache` duck interface |
| `mixin/MixinMapItemSavedData.java` | `MapItemSavedData` | Framed map decoration injection (MixinExtras) |
| `mixin/MixinStairBlock.java` | `StairBlock` | `@WrapOperation` waterlog defaults for framed stairs |
| `mixin/MixinStateDefinitionBuilder.java` | `StateDefinition.Builder` | Property add/remove accessor |

### Client mixins (3)

| File | Target | Role |
|------|--------|------|
| `mixin/client/AccessorModelManager.java` | `ModelManager` | Model cache accessor |
| `mixin/client/AccessorMultiPlayerGameMode.java` | `MultiPlayerGameMode` | Placement mode accessor |
| `mixin/client/MixinLevelRenderer.java` | `LevelRenderer` | Cutout-leaves cache invalidation hook |

### Sample paths (top 9)

```
workloads/framedblocks/repo/src/main/java/io/github/xfacthd/framedblocks/mixin/InvokerBlock.java
workloads/framedblocks/repo/src/main/java/io/github/xfacthd/framedblocks/mixin/InvokerBlockItem.java
workloads/framedblocks/repo/src/main/java/io/github/xfacthd/framedblocks/mixin/MixinBlockStateBase.java
workloads/framedblocks/repo/src/main/java/io/github/xfacthd/framedblocks/mixin/MixinMapItemSavedData.java
workloads/framedblocks/repo/src/main/java/io/github/xfacthd/framedblocks/mixin/MixinStairBlock.java
workloads/framedblocks/repo/src/main/java/io/github/xfacthd/framedblocks/mixin/MixinStateDefinitionBuilder.java
workloads/framedblocks/repo/src/main/java/io/github/xfacthd/framedblocks/mixin/client/AccessorModelManager.java
workloads/framedblocks/repo/src/main/java/io/github/xfacthd/framedblocks/mixin/client/AccessorMultiPlayerGameMode.java
workloads/framedblocks/repo/src/main/java/io/github/xfacthd/framedblocks/mixin/client/MixinLevelRenderer.java
```

## Gradle / NeoForge commands

From `workloads/framedblocks/repo/`:

```powershell
.\gradlew.bat build              # compile + jar
.\gradlew.bat runClient          # dev client (test sourceSet)
.\gradlew.bat runServer          # dev server (--nogui)
.\gradlew.bat runData            # datagen → src/generated/resources/
.\gradlew.bat runGameTestServer  # GameTest server
```

Key build files:

- `build.gradle` — NeoForge moddev plugin, runs, dependencies
- `gradle.properties` — MC/NeoForge/mod versions
- `settings.gradle` — NeoForged plugin repository
- `gradle/wrapper/gradle-wrapper.properties` — Gradle 9.2.1

## Setup

```powershell
pnpm build
pnpm aether workload clone framedblocks   # after fixing manifest branch to 26.1
pnpm aether setup jdtls
```

## Purpose

Exercise the full NeoForge loop:

1. Claude decomposes mass mixin work into scoped tasks.
2. Grok executes each task through the validation gate.
3. Accepted tasks land in isolated worktrees and integrate.

## Recommended first mixin task scope (≤10 files)

**Task: common mixin layer** — all 6 server/common mixins plus config touchpoints (8 files total):

1. `mixin/InvokerBlock.java`
2. `mixin/InvokerBlockItem.java`
3. `mixin/MixinBlockStateBase.java`
4. `mixin/MixinStateDefinitionBuilder.java`
5. `mixin/MixinStairBlock.java`
6. `mixin/MixinMapItemSavedData.java`
7. `src/main/resources/framedblocks.mixin.json` (verify entries)
8. `src/main/resources/META-INF/neoforge.mods.toml` (mixin registration)

**Follow-up task: client mixin layer** — remaining 3 client mixins (`AccessorModelManager`, `AccessorMultiPlayerGameMode`, `MixinLevelRenderer`).

Rationale: common mixins underpin block-state caching, invokers, and map/stair behaviour used across the mod API; client mixins depend on separate run config (`runClient`) and are a natural second slice.

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