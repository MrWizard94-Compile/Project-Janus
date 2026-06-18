import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const cli = join(repoRoot, "packages", "cli", "dist", "bin.js");
const planFile = "examples/orchestration/framedblocks-batch01-plan.json";

const LONG_TIMEOUT_MS = 900_000;
const JDTLS_SETTLE_MS = 4_000;

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

async function runAetherJson(step, args, timeoutMs = LONG_TIMEOUT_MS) {
  const result = await runAether(args, timeoutMs);
  if (result.code !== 0 && !result.stdout.trim().includes("{")) {
    throw formatAetherError(step, args, result);
  }
  return parseJson(result.stdout, step);
}

async function destroyWorktree(taskId, label) {
  const destroyed = await runAether(["worktree", "destroy", "-t", taskId]);
  if (destroyed.code !== 0) {
    console.warn(
      `orchestration: [${label}] worktree destroy warning (exit ${destroyed.code})` +
        (destroyed.stderr.trim() ? ` — ${destroyed.stderr.trim()}` : "") +
        (destroyed.stdout.trim() ? ` — ${destroyed.stdout.trim()}` : ""),
    );
  }
  await delay(JDTLS_SETTLE_MS);
}

async function main() {
  let parentId = "";
  const childIds = [];

  try {
    console.log("orchestration: planning delegation...");
    const planned = await runAetherJson("orchestrate plan", [
      "orchestrate",
      "plan",
      "-f",
      planFile,
    ]);
    parentId = planned.parent.id;
    for (const child of planned.children) {
      childIds.push(child.id);
    }
    console.log(
      `orchestration: parent ${parentId}, children ${childIds.join(", ")}`,
    );

    console.log("orchestration: running identity children through validation gate...");
    const runResult = await runAetherJson(
      "orchestrate run",
      ["orchestrate", "run", "-t", parentId],
      LONG_TIMEOUT_MS,
    );

    const runFailures = (runResult.results ?? []).filter(
      (entry) => entry.task?.status !== "accepted" || !entry.applied,
    );
    if (!runResult.rollup?.complete || runFailures.length > 0) {
      throw new Error(
        `orchestrate run had failures:\n${JSON.stringify(
          { rollup: runResult.rollup, failures: runFailures },
          null,
          2,
        )}`,
      );
    }

    console.log("orchestration: checking rollup status...");
    const status = await runAetherJson("orchestrate status", [
      "orchestrate",
      "status",
      "-t",
      parentId,
    ]);

    if (!status.complete) {
      throw new Error(
        `orchestration incomplete:\n${JSON.stringify(status, null, 2)}`,
      );
    }

    const notAccepted = status.children.filter((child) => child.status !== "accepted");
    if (notAccepted.length > 0) {
      throw new Error(
        `not all children accepted:\n${JSON.stringify(notAccepted, null, 2)}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          parent_id: parentId,
          complete: status.complete,
          accepted: status.by_status.accepted,
          total: status.total,
          child_ids: childIds,
        },
        null,
        2,
      ),
    );
    console.log("orchestration: PASS — delegated children accepted");
  } finally {
    for (const childId of childIds) {
      console.log(`orchestration: cleaning up ${childId}`);
      await destroyWorktree(childId, childId);
    }
  }
}

main().catch((error) => {
  console.error(
    `orchestration: FAIL — ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});