import { z } from "zod";
import { CreateTaskInputSchema } from "@aether/shared";

const CreateTaskInputWithoutParentSchema = CreateTaskInputSchema.omit({ parent_id: true });

export const ParentTaskInputSchema = CreateTaskInputSchema.extend({
  assignee: z.literal("claude"),
});

export type ParentTaskInput = z.infer<typeof ParentTaskInputSchema>;

export const PatchModeSchema = z.enum(["identity", "manual"]);

export type PatchMode = z.infer<typeof PatchModeSchema>;

export const ChildDelegationSchema = z.object({
  assignee: z.literal("grok"),
  task: CreateTaskInputWithoutParentSchema,
  patch_mode: PatchModeSchema.default("identity"),
});

export type ChildDelegation = z.infer<typeof ChildDelegationSchema>;

export const ProvisionOptionsSchema = z.object({
  auto_worktree: z.boolean().default(true),
  auto_prepare: z.boolean().default(false),
});

export type ProvisionOptions = z.infer<typeof ProvisionOptionsSchema>;

export const DelegationPlanSchema = z.object({
  parent: ParentTaskInputSchema,
  children: z.array(ChildDelegationSchema).min(1),
  provision: ProvisionOptionsSchema.default({
    auto_worktree: true,
    auto_prepare: false,
  }),
});

export type DelegationPlan = z.infer<typeof DelegationPlanSchema>;