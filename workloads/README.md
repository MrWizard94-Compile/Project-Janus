# Workloads

External repositories Aether executes against. Each workload has a `manifest.json` and an optional cloned `repo/` checkout.

## Commands

```powershell
pnpm aether workload init framedblocks --description "FramedBlocks mass mixin E2E"
pnpm aether workload set-url framedblocks --url https://github.com/example/FramedBlocks.git --branch main
pnpm aether workload clone framedblocks
pnpm aether workload list
```

After cloning, create tasks against files inside `workloads/<id>/repo/` and validate with the workload's `validation_profile`.