import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const cli = join(repoRoot, "packages", "cli", "dist", "bin.js");

async function runAether(args, timeoutMs = 600_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: repoRoot,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`aether timed out: aether ${args.join(" ")}`));
        return;
      }
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
    console.log("e2e-framedblocks: creating task (child 03)...");
    const created = await runAether([
      "task",
      "create",
      "-f",
      "examples/framedblocks/task-batch-01-child-03-mixin-state-definition-builder.json",
    ]);
    if (created.code !== 0) {
      throw new Error(created.stderr || created.stdout);
    }
    const task = parseJson(created.stdout);
    taskId = task.id;
    console.log(`e2e-framedblocks: task ${taskId}`);

    console.log("e2e-framedblocks: creating workload worktree...");
    const worktree = await runAether([
      "worktree",
      "create",
      "-t",
      taskId,
      "-w",
      "framedblocks",
    ]);
    if (worktree.code !== 0) {
      throw new Error(worktree.stderr || worktree.stdout);
    }

    console.log("e2e-framedblocks: preparing Gradle worktree (compileJava)...");
    const prepare = await runAether(["worktree", "prepare", "-t", taskId], 900_000);
    if (prepare.code !== 0) {
      throw new Error(prepare.stderr || prepare.stdout);
    }

    const patchTemplate = await readFile(
      join(repoRoot, "examples", "framedblocks", "patch-template.json"),
      "utf8",
    );
    const patchBody = patchTemplate.replaceAll("REPLACE_WITH_CHILD_03_TASK_ID", taskId);
    tempPatchPath = join(
      await mkdtemp(join(tmpdir(), "aether-fb-e2e-")),
      "patch.json",
    );
    await writeFile(tempPatchPath, patchBody, "utf8");

    console.log("e2e-framedblocks: validating identity mixin patch...");
    const validate = await runAether(["patch", "submit", "-f", tempPatchPath], 900_000);
    if (validate.code !== 0) {
      throw new Error(validate.stderr || validate.stdout);
    }
    const validateResult = parseJson(validate.stdout);
    if (!validateResult.validation?.passed) {
      throw new Error(
        `Validation failed:\n${JSON.stringify(validateResult.validation, null, 2)}`,
      );
    }

    console.log("e2e-framedblocks: applying patch...");
    const apply = await runAether(
      ["patch", "submit", "-f", tempPatchPath, "--apply"],
      900_000,
    );
    if (apply.code !== 0) {
      throw new Error(apply.stderr || apply.stdout);
    }
    const applyResult = parseJson(apply.stdout);
    if (!applyResult.applied || applyResult.task.status !== "accepted") {
      throw new Error(`Apply failed:\n${JSON.stringify(applyResult, null, 2)}`);
    }

    console.log("e2e-framedblocks: PASS — FramedBlocks mixin loop completed");
    console.log(
      JSON.stringify({ task_id: taskId, status: applyResult.task.status }, null, 2),
    );
  } finally {
    if (taskId) {
      console.log("e2e-framedblocks: cleaning up worktree...");
      await runAether(["worktree", "destroy", "-t", taskId]);
    }
    if (tempPatchPath) {
      await rm(dirname(tempPatchPath), { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(
    `e2e-framedblocks: FAIL — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});