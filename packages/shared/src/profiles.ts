export interface ValidationProfile {
  id: string;
  description: string;
  layers: readonly ("lsp" | "ast" | "rules" | "build")[];
  build_command: string | null;
}

export const VALIDATION_PROFILES: Record<string, ValidationProfile> = {
  "neoforge-mixin-v1": {
    id: "neoforge-mixin-v1",
    description: "NeoForge mixin validation: LSP, AST rules, domain rules, Gradle compile",
    layers: ["lsp", "ast", "rules", "build"],
    build_command: "./gradlew compileJava",
  },
  "typescript-v1": {
    id: "typescript-v1",
    description: "TypeScript package validation: rules and typecheck build",
    layers: ["rules", "build"],
    build_command: "pnpm typecheck",
  },
};

export function getValidationProfile(id: string): ValidationProfile {
  const profile = VALIDATION_PROFILES[id];
  if (!profile) {
    const known = Object.keys(VALIDATION_PROFILES).join(", ");
    throw new Error(`Unknown validation profile "${id}". Known profiles: ${known}`);
  }
  return profile;
}