import { z } from "zod";

export const WorkloadManifestSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  repository: z.string().url().nullable(),
  branch: z.string().min(1).default("main"),
  validation_profile: z.string().min(1).default("neoforge-mixin-v1"),
  clone_path: z.string().min(1).default("repo"),
});

export type WorkloadManifest = z.infer<typeof WorkloadManifestSchema>;