import type { PatchProposal, TaskSpec, ValidationProfile, ValidationError } from "@aether/shared";
import { runNeoForgeMixinRules } from "../rules/neoforge-mixin.js";
import { runTypeScriptRules } from "../rules/typescript.js";
import type { LayerResult } from "../types.js";

export function runRulesLayer(
  profile: ValidationProfile,
  proposal: PatchProposal,
  spec: TaskSpec,
): LayerResult {
  const started = Date.now();
  let errors: ValidationError[] = [];

  if (profile.id === "neoforge-mixin-v1") {
    errors = runNeoForgeMixinRules({ proposal, spec });
  } else if (profile.id === "typescript-v1") {
    errors = runTypeScriptRules(proposal, spec);
  }

  return {
    layer: "rules",
    ran: true,
    passed: errors.length === 0,
    errors,
    duration_ms: Date.now() - started,
  };
}