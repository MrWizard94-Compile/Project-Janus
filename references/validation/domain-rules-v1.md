# Domain Rules Pack: neoforge-mixin-v1

Initial deterministic rules for the Validation Kernel (Phase 0 / PR-5).

## Mixin rules

| ID | Rule | Severity |
|----|------|----------|
| M001 | `@Mixin` target class exists and is resolvable on compile classpath | error |
| M002 | `@Inject` / `@Redirect` / `@Overwrite` method signatures match target | error |
| M003 | `@Overwrite` forbidden unless task spec contains `allow_overwrite: true` | error |
| M004 | Accessor/Invoker annotations follow SpongePowered conventions | error |
| M005 | Package declarations match mod source set layout | error |
| M006 | No raw-type erasure violations in mixin callback signatures | error |

## Type-safety rules

| ID | Rule | Severity |
|----|------|----------|
| T001 | `@Nullable` / `@Nonnull` usage consistent where javax/jetbrains annotations present | error |

## Build rules

| ID | Rule | Severity |
|----|------|----------|
| B001 | `./gradlew compileJava` exits 0 in task worktree | error |

## Error feedback shape

```json
{
  "layer": "rules",
  "rule": "M002",
  "file": "src/main/java/example/MixinBlock.java",
  "line": 42,
  "message": "@Inject method signature does not match target render()",
  "suggestion": "Change return type from void to boolean"
}
```