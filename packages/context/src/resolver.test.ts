import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ContextResolver } from "./resolver.js";

const repoRoot = join(import.meta.dirname, "../../..");

describe("ContextResolver", () => {
  it("resolves known context refs to documents", async () => {
    const resolver = new ContextResolver(repoRoot);
    const bundle = await resolver.resolve(["ref:neoforged"]);

    expect(bundle.documents).toHaveLength(1);
    expect(bundle.documents[0]?.path).toBe("references/neoforged/overview.md");
    expect(bundle.documents[0]?.content).toContain("NeoForge");
  });
});