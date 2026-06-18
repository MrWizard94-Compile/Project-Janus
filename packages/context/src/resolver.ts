import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTEXT_CATALOG, ContextEntry, resolveContextRefs } from "@aether/shared";

export interface ResolvedContextDocument {
  path: string;
  content: string;
}

export interface ResolvedContextBundle {
  refs: string[];
  entries: ContextEntry[];
  documents: ResolvedContextDocument[];
}

export class ContextResolver {
  private readonly repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  listCatalog(): ContextEntry[] {
    return Object.values(CONTEXT_CATALOG);
  }

  async resolve(refs: readonly string[]): Promise<ResolvedContextBundle> {
    const entries = resolveContextRefs(refs);
    const documents: ResolvedContextDocument[] = [];

    for (const entry of entries) {
      for (const relativePath of entry.files) {
        const absolutePath = join(this.repoRoot, relativePath);
        const content = await readFile(absolutePath, "utf8");
        documents.push({
          path: relativePath.replace(/\\/g, "/"),
          content,
        });
      }
    }

    return {
      refs: [...refs],
      entries,
      documents,
    };
  }
}