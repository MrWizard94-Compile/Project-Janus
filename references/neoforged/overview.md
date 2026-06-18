# NeoForge Reference

Verified entry points for Phase 0 NeoForge / mixin workloads.

## Official documentation

- NeoForge docs hub: https://docs.neoforged.net/
- Getting started / mod files: https://docs.neoforged.net/docs/gettingstarted/modfiles/
- NeoForge 1.21 primer: https://docs.neoforged.net/primer/docs/1.21/neo/
- NeoForge 21.0 release notes: https://neoforged.net/news/21.0release/

## Mixin references

- SpongePowered Mixin wiki (Forge section — patterns still apply): https://github.com/SpongePowered/Mixin/wiki/Mixins-on-Minecraft-Forge
- Mixin repo: https://github.com/SpongePowered/Mixin

## Phase 0 validation targets

- `./gradlew compileJava` as sandbox compile gate
- Domain rules pack: `neoforge-mixin-v1` (see `packages/shared/src/profiles.ts`)
- Reject `@Overwrite` unless task spec explicitly allows it

## Notes

- Development-environment-only mixin success is a known failure mode; always validate with production classpath + compile in worktree.
- Keep mod metadata (`neoforge.mods.toml`) consistent with package roots under validation.