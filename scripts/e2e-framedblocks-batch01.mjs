import { readFile, writeFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const cli = join(repoRoot, "packages", "cli", "dist", "bin.js");
const workloadRepo = join(repoRoot, "workloads", "framedblocks", "repo");

const LONG_TIMEOUT_MS = 900_000;
const JDTLS_SETTLE_MS = 4_000;
const APPLY_RETRY_ATTEMPTS = 3;
const APPLY_RETRY_DELAY_MS = 5_000;

const CHILDREN = [
  {
    taskFile: "examples/framedblocks/task-batch-01-child-01-mixin-block-state-base.json",
    mixinPath: "src/main/java/io/github/xfacthd/framedblocks/mixin/MixinBlockStateBase.java",
  },
  {
    taskFile: "examples/framedblocks/task-batch-01-child-02-mixin-stair-block.json",
    mixinPath: "src/main/java/io/github/xfacthd/framedblocks/mixin/MixinStairBlock.java",
  },
  {
    taskFile: "examples/framedblocks/task-batch-01-child-03-mixin-state-definition-builder.json",
    mixinPath: "src/main/java/io/github/xfacthd/framedblocks/mixin/MixinStateDefinitionBuilder.java",
  },
  {
    taskFile: "examples/framedblocks/task-batch-01-child-04-mixin-map-item-saved-data.json",
    mixinPath: "src/main/java/io/github/xfacthd/framedblocks/mixin/MixinMapItemSavedData.java",
  },
  {
    taskFile: "examples/framedblocks/task-batch-01-child-05-mixin-level-renderer.json",
    mixinPath: "src/main/java/io/github/xfacthd/framedblocks/mixin/client/MixinLevelRenderer.java",
  },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAether(args, timeoutMs = LONG_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: repoRoot,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`aether timed out: aether ${args.join(" ")}`));
        return;
      }
      // Defer one tick so Windows pipes flush remaining stdout/stderr before read.
      setImmediate(() => {
        resolve({ code: code ?? 1, stdout, stderr });
      });
    });
  });
}

function formatAetherError(step, args, result) {
  const cmd = `aether ${args.join(" ")}`;
  const parts = [
    `${step} failed (exit ${result.code})`,
    `command: ${cmd}`,
  ];

  if (result.stderr.trim()) {
    parts.push(`stderr:\n${result.stderr.trim()}`);
  }
  if (result.stdout.trim()) {
    parts.push(`stdout:\n${result.stdout.trim()}`);
  }
  if (!result.stderr.trim() && !result.stdout.trim()) {
    parts.push("no stdout/stderr captured");
  }

  return new Error(parts.join("\n"));
}

function parseJson(stdout, step) {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const index =
    start === -1
      ? arrayStart
      : arrayStart === -1
        ? start
        : Math.min(start, arrayStart);

  if (index === -1) {
    throw new Error(
      `${step}: no JSON found in aether output` +
        (trimmed ? `:\n${trimmed}` : " (empty stdout/stderr)"),
    );
  }

  return JSON.parse(trimmed.slice(index));
}

function tryParseJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed.includes("{") && !trimmed.includes("[")) {
    return null;
  }
  return parseJson(stdout, "aether");
}

async function runAetherJson(step, args, timeoutMs = LONG_TIMEOUT_MS) {
  const result = await runAether(args, timeoutMs);
  if (result.code !== 0 && !result.stdout.trim().includes("{")) {
    throw formatAetherError(step, args, result);
  }
  return parseJson(result.stdout, step);
}

async function createTaskFromFile(filePath, parentId = null) {
  const raw = await readFile(join(repoRoot, filePath), "utf8");
  const body = parentId
    ? raw.replaceAll("REPLACE_WITH_PARENT_TASK_ID", parentId)
    : raw;
  const tempDir = await mkdtemp(join(tmpdir(), "aether-fb-batch-"));
  const tempPath = join(tempDir, basename(filePath));

  try {
    await writeFile(tempPath, body, "utf8");
    const created = await runAether(["task", "create", "-f", tempPath]);
    if (created.code !== 0) {
      throw formatAetherError("task create", ["task", "create", "-f", tempPath], created);
    }
    return parseJson(created.stdout, "task create");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function buildPatch(taskId, mixinPath) {
  const absoluteMixin = join(workloadRepo, mixinPath);
  const content = await readFile(absoluteMixin, "utf8");
  const patch = {
    task_id: taskId,
    allow_overwrite: false,
    files: [{ path: mixinPath, content }],
  };

  const tempPath = join(
    await mkdtemp(join(tmpdir(), "aether-fb-patch-")),
    "patch.json",
  );
  await writeFile(tempPath, `${JSON.stringify(patch, null, 2)}\n`, "utf8");
  return tempPath;
}

async function destroyWorktree(taskId, label) {
  const destroyed = await runAether(["worktree", "destroy", "-t", taskId]);
  if (destroyed.code !== 0) {
    console.warn(
      `batch01: [${label}] worktree destroy warning (exit ${destroyed.code})` +
        (destroyed.stderr.trim() ? ` — ${destroyed.stderr.trim()}` : "") +
        (destroyed.stdout.trim() ? ` — ${destroyed.stdout.trim()}` : ""),
    );
  }
  await delay(JDTLS_SETTLE_MS);
}

function isJdtlsBusyError(payload) {
  const text = JSON.stringify(payload);
  return text.includes("EBUSY") || text.includes("resource busy or locked");
}

async function submitApplyWithRetry(patchPath, label) {
  let lastResult = null;

  for (let attempt = 1; attempt <= APPLY_RETRY_ATTEMPTS; attempt += 1) {
    lastResult = await runAether(
      ["patch", "submit", "-f", patchPath, "--apply"],
      LONG_TIMEOUT_MS,
    );

    const parsed = tryParseJson(lastResult.stdout);
    if (parsed) {
      if (parsed.applied && parsed.task?.status === "accepted") {
        return parsed;
      }
      if (!isJdtlsBusyError(parsed) || attempt === APPLY_RETRY_ATTEMPTS) {
        return parsed;
      }
    } else if (lastResult.code === 0) {
      throw new Error(
        `${label}: patch submit --apply returned exit 0 with no JSON` +
          (lastResult.stderr.trim() ? `\nstderr:\n${lastResult.stderr.trim()}` : ""),
      );
    } else if (!isJdtlsBusyError(lastResult) || attempt === APPLY_RETRY_ATTEMPTS) {
      throw formatAetherError(
        `${label}: patch submit --apply`,
        ["patch", "submit", "-f", patchPath, "--apply"],
        lastResult,
      );
    }

    console.warn(
      `batch01: [${label}] apply hit JDT.LS EBUSY, retry ${attempt}/${APPLY_RETRY_ATTEMPTS}...`,
    );
    await delay(APPLY_RETRY_DELAY_MS);
  }

  throw formatAetherError(
    `${label}: patch submit --apply`,
    ["patch", "submit", "-f", patchPath, "--apply"],
    lastResult ?? { code: 1, stdout: "", stderr: "" },
  );
}

async function runChildLoop(child, parentId) {
  const label = basename(child.taskFile);
  const task = await createTaskFromFile(child.taskFile, parentId);
  const taskId = task.id;
  let patchPath = "";

  try {
    console.log(`batch01: [${label}] task ${taskId}`);

    const worktree = await runAether([
      "worktree",
      "create",
      "-t",
      taskId,
      "-w",
      "framedblocks",
    ]);
    if (worktree.code !== 0) {
      throw formatAetherError(
        `${label}: worktree create`,
        ["worktree", "create", "-t", taskId, "-w", "framedblocks"],
        worktree,
      );
    }

    console.log(`batch01: [${label}] preparing Gradle worktree...`);
    const prepare = await runAether(
      ["worktree", "prepare", "-t", taskId],
      LONG_TIMEOUT_MS,
    );
    if (prepare.code !== 0) {
      throw formatAetherError(
        `${label}: worktree prepare`,
        ["worktree", "prepare", "-t", taskId],
        prepare,
      );
    }

    patchPath = await buildPatch(taskId, child.mixinPath);

    console.log(`batch01: [${label}] validating patch...`);
    const validateResult = await runAetherJson(
      `${label}: patch submit`,
      ["patch", "submit", "-f", patchPath],
      LONG_TIMEOUT_MS,
    );
    if (!validateResult.validation?.passed) {
      return {
        label,
        taskId,
        status: "validation_failed",
        errors: validateResult.validation?.errors ?? [],
      };
    }

    console.log(`batch01: [${label}] applying patch...`);
    const applyResult = await submitApplyWithRetry(patchPath, label);
    if (!applyResult.applied || applyResult.task.status !== "accepted") {
      return {
        label,
        taskId,
        status: "apply_failed",
        detail: applyResult,
      };
    }

    return { label, taskId, status: "accepted" };
  } finally {
    console.log(`batch01: [${label}] cleaning up ${taskId}`);
    await destroyWorktree(taskId, label);
    if (patchPath) {
      await rm(dirname(patchPath), { recursive: true, force: true });
    }
  }
}

async function main() {
  console.log("batch01: creating parent task...");
  const parent = await createTaskFromFile("examples/framedblocks/task-batch-01.json");
  const parentId = parent.id;
  console.log(`batch01: parent ${parentId}`);

  const results = [];
  for (const child of CHILDREN) {
    try {
      const result = await runChildLoop(child, parentId);
      results.push(result);
      console.log(`batch01: [${result.label}] ${result.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        label: basename(child.taskFile),
        status: "error",
        message,
      });
      console.error(`batch01: [${basename(child.taskFile)}] error — ${message}`);
    }
  }

  const accepted = results.filter((entry) => entry.status === "accepted").length;
  const summary = {
    parent_id: parentId,
    total: CHILDREN.length,
    accepted,
    failed: CHILDREN.length - accepted,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (accepted !== CHILDREN.length) {
    process.exitCode = 1;
  } else {
    console.log("batch01: PASS — all five mixin children accepted");
  }
}

main().catch((error) => {
  console.error(
    `batch01: FAIL — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});