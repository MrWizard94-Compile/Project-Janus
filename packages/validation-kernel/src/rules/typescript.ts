import type { PatchProposal, TaskSpec, ValidationError } from "@aether/shared";

export function runTypeScriptRules(
  proposal: PatchProposal,
  spec: TaskSpec,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const file of proposal.files) {
    if (
      spec.files_in_scope.length > 0 &&
      !spec.files_in_scope.includes(file.path)
    ) {
      errors.push({
        layer: "rules",
        rule: "S001",
        file: file.path,
        message: "File is outside task files_in_scope",
      });
    }

    if (file.content.includes("TODO") || file.content.includes("FIXME")) {
      errors.push({
        layer: "rules",
        rule: "TS001",
        file: file.path,
        message: "Placeholder markers TODO/FIXME are forbidden",
        suggestion: "Complete the implementation before submitting",
      });
    }

    if (/\bany\b/.test(file.content) && file.path.endsWith(".ts")) {
      errors.push({
        layer: "rules",
        rule: "TS002",
        file: file.path,
        message: "Explicit any type is forbidden",
        suggestion: "Use precise types or unknown with narrowing",
      });
    }
  }

  return errors;
}