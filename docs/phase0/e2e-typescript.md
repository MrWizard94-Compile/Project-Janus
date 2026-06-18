# TypeScript E2E Proof

Self-contained proof that the Aether Phase 0 loop works without an external mod repository.

## What it exercises

1. Task creation (`typescript-v1` profile)
2. Worktree provisioning
3. Dependency prepare (`pnpm install --frozen-lockfile`)
4. Patch validation (rules + `pnpm typecheck`)
5. Patch apply on pass
6. Task acceptance + cleanup

## Run

```powershell
pnpm build
pnpm e2e:typescript
```

The runner creates a real task and worktree, validates/applies `examples/patch-typescript-e2e.json`, then destroys the worktree.