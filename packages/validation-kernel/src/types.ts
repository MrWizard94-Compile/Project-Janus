import type { ValidationError } from "@aether/shared";

export interface LayerResult {
  layer: "lsp" | "ast" | "rules" | "build";
  ran: boolean;
  passed: boolean;
  errors: ValidationError[];
  duration_ms: number;
}

export interface ValidationResult {
  passed: boolean;
  profile_id: string;
  workspace_root: string;
  layers: LayerResult[];
  errors: ValidationError[];
}