import { z } from "zod";

export const TaskStatusSchema = z.enum([
  "pending",
  "in_progress",
  "validating",
  "failed",
  "accepted",
  "abandoned",
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const AssigneeSchema = z.enum(["grok", "claude"]);

export type Assignee = z.infer<typeof AssigneeSchema>;

export const TaskSpecSchema = z.object({
  objective: z.string().min(1),
  constraints: z.array(z.string()),
  files_in_scope: z.array(z.string()),
  acceptance_criteria: z.array(z.string()),
});

export type TaskSpec = z.infer<typeof TaskSpecSchema>;

export const ValidationErrorSchema = z.object({
  layer: z.enum(["lsp", "ast", "rules", "build"]),
  rule: z.string().optional(),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
  message: z.string().min(1),
  suggestion: z.string().optional(),
});

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

export const ValidationAttemptSchema = z.object({
  attempted_at: z.string().datetime(),
  passed: z.boolean(),
  errors: z.array(ValidationErrorSchema),
});

export type ValidationAttempt = z.infer<typeof ValidationAttemptSchema>;

export const TaskSchema = z.object({
  id: z.string().min(1),
  parent_id: z.string().nullable(),
  worktree: z.string().nullable(),
  status: TaskStatusSchema,
  assignee: AssigneeSchema.nullable(),
  context_refs: z.array(z.string()),
  spec: TaskSpecSchema,
  validation_profile: z.string().min(1),
  result: z.string().nullable(),
  validation_attempts: z.array(ValidationAttemptSchema),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskInputSchema = z.object({
  parent_id: z.string().nullable().optional(),
  worktree: z.string().nullable().optional(),
  assignee: AssigneeSchema.nullable().optional(),
  context_refs: z.array(z.string()).default([]),
  spec: TaskSpecSchema,
  validation_profile: z.string().min(1),
});

export type CreateTaskInput = z.input<typeof CreateTaskInputSchema>;

export const VALID_STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ["in_progress", "abandoned"],
  in_progress: ["validating", "abandoned", "pending"],
  validating: ["failed", "accepted", "in_progress"],
  failed: ["in_progress", "abandoned"],
  accepted: [],
  abandoned: [],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return VALID_STATUS_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid task status transition: ${from} -> ${to}`);
  }
}