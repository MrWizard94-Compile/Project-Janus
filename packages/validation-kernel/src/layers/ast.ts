import type { PatchProposal, ValidationError } from "@aether/shared";
import { analyzeJavaSource } from "../java/parse.js";
import type { LayerResult } from "../types.js";

export function runAstLayer(proposal: PatchProposal): LayerResult {
  const started = Date.now();
  const errors: ValidationError[] = [];

  for (const file of proposal.files) {
    if (!file.path.endsWith(".java")) {
      continue;
    }

    const analysis = analyzeJavaSource(file.path, file.content);

    if (!analysis.packageName) {
      errors.push({
        layer: "ast",
        file: file.path,
        message: "Java source is missing a package declaration",
        suggestion: "Add package declaration matching src/main/java layout",
      });
    }

    const mixinCount = analysis.annotations.filter((entry) => entry.kind === "Mixin").length;
    if (mixinCount === 0) {
      errors.push({
        layer: "ast",
        file: file.path,
        message: "NeoForge mixin file does not declare @Mixin",
        suggestion: "Add @Mixin(TargetClass.class) to the mixin class",
      });
    }

    if (mixinCount > 1) {
      errors.push({
        layer: "ast",
        file: file.path,
        message: "Multiple @Mixin annotations in a single file",
        suggestion: "Use one mixin class per target type",
      });
    }
  }

  return {
    layer: "ast",
    ran: true,
    passed: errors.length === 0,
    errors,
    duration_ms: Date.now() - started,
  };
}