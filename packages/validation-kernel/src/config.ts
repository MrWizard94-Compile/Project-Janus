import { readFile } from "node:fs/promises";
import {
  AetherConfig,
  AetherConfigSchema,
  DEFAULT_AETHER_CONFIG,
  resolveAetherConfigPath,
} from "@aether/shared";

export async function loadAetherConfig(repoRoot: string): Promise<AetherConfig> {
  const configPath = resolveAetherConfigPath(repoRoot);

  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return AetherConfigSchema.parse({
      ...DEFAULT_AETHER_CONFIG,
      ...(parsed as object),
    });
  } catch (error) {
    if (isNotFoundError(error)) {
      return DEFAULT_AETHER_CONFIG;
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}