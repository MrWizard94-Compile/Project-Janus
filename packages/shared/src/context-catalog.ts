export interface ContextEntry {
  ref: string;
  title: string;
  files: readonly string[];
}

export const CONTEXT_CATALOG: Record<string, ContextEntry> = {
  "arch:framedblocks-mixin-pattern": {
    ref: "arch:framedblocks-mixin-pattern",
    title: "FramedBlocks mixin migration pattern",
    files: [
      "references/framedblocks/overview.md",
      "references/validation/domain-rules-v1.md",
      "references/neoforged/overview.md",
    ],
  },
  "doc:handoff-protocol": {
    ref: "doc:handoff-protocol",
    title: "Phase 0 handoff protocol",
    files: ["docs/phase0/handoff-protocol.md"],
  },
  "ref:neoforged": {
    ref: "ref:neoforged",
    title: "NeoForge reference",
    files: ["references/neoforged/overview.md"],
  },
  "ref:jdt-lsp": {
    ref: "ref:jdt-lsp",
    title: "JDT.LS reference",
    files: ["references/jdt-lsp/overview.md"],
  },
  "ref:validation-rules": {
    ref: "ref:validation-rules",
    title: "Domain validation rules v1",
    files: ["references/validation/domain-rules-v1.md"],
  },
};

export function resolveContextRefs(refs: readonly string[]): ContextEntry[] {
  const resolved: ContextEntry[] = [];

  for (const ref of refs) {
    const entry = CONTEXT_CATALOG[ref];
    if (!entry) {
      throw new Error(`Unknown context ref "${ref}"`);
    }
    resolved.push(entry);
  }

  return resolved;
}