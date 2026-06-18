import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  hashPatch,
  PatchProposal,
  resolveReceiptPath,
  ValidationReceipt,
  ValidationReceiptSchema,
} from "@aether/shared";

export async function writeReceipt(
  repoRoot: string,
  proposal: PatchProposal,
  passed: boolean,
  workspaceRoot: string,
  profileId: string,
): Promise<ValidationReceipt> {
  const receipt: ValidationReceipt = ValidationReceiptSchema.parse({
    task_id: proposal.task_id,
    patch_hash: hashPatch(proposal),
    passed,
    validated_at: new Date().toISOString(),
    workspace_root: workspaceRoot,
    profile_id: profileId,
  });

  const receiptPath = resolveReceiptPath(repoRoot, proposal.task_id);
  await mkdir(dirname(receiptPath), { recursive: true });

  const tempPath = `${receiptPath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  await rename(tempPath, receiptPath);

  return receipt;
}

export async function readReceipt(
  repoRoot: string,
  taskId: string,
): Promise<ValidationReceipt | null> {
  const receiptPath = resolveReceiptPath(repoRoot, taskId);

  try {
    const raw = await readFile(receiptPath, "utf8");
    return ValidationReceiptSchema.parse(JSON.parse(raw) as unknown);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export function receiptMatchesProposal(
  receipt: ValidationReceipt,
  proposal: PatchProposal,
): boolean {
  return (
    receipt.task_id === proposal.task_id &&
    receipt.patch_hash === hashPatch(proposal) &&
    receipt.passed
  );
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}