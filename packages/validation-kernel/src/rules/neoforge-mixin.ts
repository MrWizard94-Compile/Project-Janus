import type { PatchProposal, TaskSpec, ValidationError } from "@aether/shared";
import { analyzeJavaSource, packageMatchesPath } from "../java/parse.js";

export interface RuleContext {
  proposal: PatchProposal;
  spec: TaskSpec;
}

export function runNeoForgeMixinRules(context: RuleContext): ValidationError[] {
  const errors: ValidationError[] = [];
  const allowOverwrite = context.proposal.allow_overwrite === true;

  for (const file of context.proposal.files) {
    if (!file.path.endsWith(".java")) {
      continue;
    }

    if (
      context.spec.files_in_scope.length > 0 &&
      !context.spec.files_in_scope.includes(file.path)
    ) {
      errors.push({
        layer: "rules",
        rule: "S001",
        file: file.path,
        message: "File is outside task files_in_scope",
        suggestion: "Limit the patch to files declared on the task spec",
      });
    }

    const analysis = analyzeJavaSource(file.path, file.content);

    if (analysis.packageName && !packageMatchesPath(analysis.packageName, file.path)) {
      errors.push({
        layer: "rules",
        rule: "M005",
        file: file.path,
        message: `Package ${analysis.packageName} does not match source path layout`,
        suggestion: "Align package declaration with src/main/java directory structure",
      });
    }

    for (const annotation of analysis.annotations) {
      if (annotation.kind === "Mixin" && !annotation.target) {
        errors.push({
          layer: "rules",
          rule: "M001",
          file: file.path,
          line: annotation.line,
          message: "@Mixin is missing a target class",
          suggestion: 'Add @Mixin(TargetClass.class) or @Mixin(value = TargetClass.class)',
        });
      }

      if (
        (annotation.kind === "Inject" || annotation.kind === "Redirect") &&
        !annotation.methodSignature
      ) {
        errors.push({
          layer: "rules",
          rule: "M002",
          file: file.path,
          line: annotation.line,
          message: `${annotation.kind} annotation is not followed by a method declaration`,
          suggestion: "Declare the callback method immediately below the annotation",
        });
      }

      if (annotation.kind === "Overwrite" && !allowOverwrite) {
        errors.push({
          layer: "rules",
          rule: "M003",
          file: file.path,
          line: annotation.line,
          message: "@Overwrite is forbidden unless allow_overwrite is true on the patch",
          suggestion: "Prefer @Inject or @Redirect, or set allow_overwrite on the proposal",
        });
      }

      if (
        (annotation.kind === "Accessor" || annotation.kind === "Invoker") &&
        !annotation.target
      ) {
        errors.push({
          layer: "rules",
          rule: "M004",
          file: file.path,
          line: annotation.line,
          message: `${annotation.kind} is missing a target`,
          suggestion: `Set ${annotation.kind}(method = "targetName") or value`,
        });
      }
    }

    for (const rawHit of analysis.rawTypeHits) {
      errors.push({
        layer: "rules",
        rule: "M006",
        file: file.path,
        line: rawHit.line,
        message: `Raw or erased generic type detected: ${rawHit.token}`,
        suggestion: "Use fully-parameterized generic types in mixin callbacks",
      });
    }

    const hasNullableOnReturn = analysis.nullableAnnotations.some(
      (entry) => entry.kind === "Nullable" && entry.site === "return",
    );
    const hasNonnull = analysis.nullableAnnotations.some((entry) => entry.kind === "Nonnull");
    if (hasNullableOnReturn && !hasNonnull) {
      errors.push({
        layer: "rules",
        rule: "T001",
        file: file.path,
        message:
          "@Nullable on a method return appears without any matching @Nonnull usage in the same file",
        suggestion: "Pair nullable return annotations with explicit non-null contracts where required",
      });
    }
  }

  return errors;
}