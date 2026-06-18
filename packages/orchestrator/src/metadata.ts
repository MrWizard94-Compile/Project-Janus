import type { ProvisionOptions, PatchMode } from "./plan.js";
import type { Task } from "@aether/shared";

export const PATCH_MODE_PREFIX = "aether:patch_mode:";
export const PROVISION_AUTO_WORKTREE_PREFIX = "aether:provision:auto_worktree:";
export const PROVISION_AUTO_PREPARE_PREFIX = "aether:provision:auto_prepare:";

export function withPatchModeContext(contextRefs: string[], patchMode: PatchMode): string[] {
  const filtered = contextRefs.filter((ref) => !ref.startsWith(PATCH_MODE_PREFIX));
  return [...filtered, `${PATCH_MODE_PREFIX}${patchMode}`];
}

export function withProvisionContext(
  contextRefs: string[],
  provision: ProvisionOptions,
): string[] {
  const filtered = contextRefs.filter(
    (ref) =>
      !ref.startsWith(PROVISION_AUTO_WORKTREE_PREFIX) &&
      !ref.startsWith(PROVISION_AUTO_PREPARE_PREFIX),
  );

  return [
    ...filtered,
    `${PROVISION_AUTO_WORKTREE_PREFIX}${provision.auto_worktree}`,
    `${PROVISION_AUTO_PREPARE_PREFIX}${provision.auto_prepare}`,
  ];
}

export function parsePatchMode(task: Task): PatchMode {
  const marker = task.context_refs.find((ref) => ref.startsWith(PATCH_MODE_PREFIX));
  if (!marker) {
    return "identity";
  }

  const mode = marker.slice(PATCH_MODE_PREFIX.length);
  if (mode === "identity" || mode === "manual") {
    return mode;
  }

  throw new Error(`Invalid patch mode marker on task ${task.id}: ${marker}`);
}

export function parseProvisionOptions(task: Task): ProvisionOptions {
  const worktreeMarker = task.context_refs.find((ref) =>
    ref.startsWith(PROVISION_AUTO_WORKTREE_PREFIX),
  );
  const prepareMarker = task.context_refs.find((ref) =>
    ref.startsWith(PROVISION_AUTO_PREPARE_PREFIX),
  );

  return {
    auto_worktree: worktreeMarker
      ? worktreeMarker.slice(PROVISION_AUTO_WORKTREE_PREFIX.length) === "true"
      : true,
    auto_prepare: prepareMarker
      ? prepareMarker.slice(PROVISION_AUTO_PREPARE_PREFIX.length) === "true"
      : false,
  };
}

export function publicContextRefs(contextRefs: string[]): string[] {
  return contextRefs.filter((ref) => !ref.startsWith("aether:"));
}