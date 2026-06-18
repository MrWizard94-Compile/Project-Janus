import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const cli = join(repoRoot, "packages", "cli", "dist", "bin.js");

async function runAether(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: repoRoot,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function parseJson(stdout) {
  const start = stdout.indexOf("{");
  const arrayStart = stdout.indexOf("[");
  const index =
    start === -1
      ? arrayStart
      : arrayStart === -1
        ? start
        : Math.min(start, arrayStart);

  if (index === -1) {
    throw new Error(`No JSON found in output:\n${stdout}`);
  }

  return JSON.parse(stdout.slice(index));
}

async function main() {
  let taskId = "";
  let tempPatchPath = "";

  try {
    console.log("e2e: creating task...");
    const created = await runAether([
      "task",
      "create",
      "-f",
      "examples/task-typescript-e2e.json",
    ]);
    if (created.code !== 0) {
      throw new Error(created.stderr || created.stdout);
    }
    const task = parseJson(created.stdout);
    taskId = task.id;

    console.log(`e2e: task ${taskId}`);

    console.log("e2e: creating worktree...");
    const worktree = await runAether(["worktree", "create", "-t", taskId]);
    if (worktree.code !== 0) {
      throw new Error(worktree.stderr || worktree.stdout);
    }

    console.log("e2e: preparing worktree dependencies...");
    const prepare = await runAether(["worktree", "prepare", "-t", taskId]);
    if (prepare.code !== 0) {
      throw new Error(prepare.stderr || prepare.stdout);
    }

    const patchTemplate = await readFile(
      join(repoRoot, "examples", "patch-typescript-e2e.json"),
      "utf8",
    );
    const patchBody = patchTemplate.replaceAll("REPLACE_WITH_TASK_ID", taskId);
    tempPatchPath = join(
      await mkdtemp(join(tmpdir(), "aether-e2e-")),
      "patch.json",
    );
    await writeFile(tempPatchPath, patchBody, "utf8");

    console.log("e2e: validating patch...");
    const validate = await runAether(["patch", "submit", "-f", tempPatchPath]);
    if (validate.code !== 0) {
      throw new Error(validate.stderr || validate.stdout);
    }
    const validateResult = parseJson(validate.stdout);
    if (!validateResult.validation?.passed) {
      throw new Error(
        `Validation failed:\n${JSON.stringify(validateResult.validation, null, 2)}`,
      );
    }

    console.log("e2e: applying patch...");
    const apply = await runAether([
      "patch",
      "submit",
      "-f",
      tempPatchPath,
      "--apply",
    ]);
    if (apply.code !== 0) {
      throw new Error(apply.stderr || apply.stdout);
    }
    const applyResult = parseJson(apply.stdout);
    if (!applyResult.applied || applyResult.task.status !== "accepted") {
      throw new Error(
        `Apply failed:\n${JSON.stringify(applyResult, null, 2)}`,
      );
    }

    console.log("e2e: PASS — full typescript-v1 loop completed");
    console.log(JSON.stringify({ task_id: taskId, status: applyResult.task.status }, null, 2));
  } finally {
    if (taskId) {
      console.log("e2e: cleaning up worktree...");
      await runAether(["worktree", "destroy", "-t", taskId]);
    }
    if (tempPatchPath) {
      await rm(dirname(tempPatchPath), { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(`e2e: FAIL — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});