import { createHash } from "node:crypto";
import { z } from "zod";

export const PatchFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

export type PatchFile = z.infer<typeof PatchFileSchema>;

export const PatchProposalSchema = z.object({
  task_id: z.string().min(1),
  files: z.array(PatchFileSchema).min(1),
  allow_overwrite: z.boolean().optional(),
});

export type PatchProposal = z.infer<typeof PatchProposalSchema>;

export const ValidationReceiptSchema = z.object({
  task_id: z.string().min(1),
  patch_hash: z.string().min(1),
  passed: z.boolean(),
  validated_at: z.string().datetime(),
  workspace_root: z.string().min(1),
  profile_id: z.string().min(1),
});

export type ValidationReceipt = z.infer<typeof ValidationReceiptSchema>;

export function hashPatch(proposal: PatchProposal): string {
  const canonical = JSON.stringify({
    task_id: proposal.task_id,
    allow_overwrite: proposal.allow_overwrite ?? false,
    files: [...proposal.files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((file) => ({ path: file.path, content: file.content })),
  });

  return createHash("sha256").update(canonical).digest("hex");
}