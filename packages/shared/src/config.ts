import { z } from "zod";

export const AetherConfigSchema = z.object({
  jdtls: z
    .object({
      java_path: z.string().min(1).default("java"),
      home: z.string().min(1),
      workspace_data_dir: z.string().min(1).optional(),
    })
    .optional(),
  validation: z
    .object({
      build_timeout_ms: z.number().int().positive().default(300_000),
      lsp_timeout_ms: z.number().int().positive().default(60_000),
      /** Extra delay after JDT.LS initialize before didOpen; helps Gradle import complete. */
      lsp_gradle_import_delay_ms: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type AetherConfig = z.infer<typeof AetherConfigSchema>;

export const DEFAULT_AETHER_CONFIG: AetherConfig = {
  validation: {
    build_timeout_ms: 300_000,
    lsp_timeout_ms: 60_000,
  },
};