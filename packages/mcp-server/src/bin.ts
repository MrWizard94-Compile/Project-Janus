#!/usr/bin/env node

import {
  findRepoRootFromCwd,
  resolveBoundTaskId,
  startAetherMcpServer,
} from "./server.js";

async function main(): Promise<void> {
  const taskId = resolveBoundTaskId();
  const repoRoot = process.env["AETHER_REPO_ROOT"] ?? (await findRepoRootFromCwd(process.cwd()));

  await startAetherMcpServer({
    repoRoot,
    taskId,
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`aether-mcp: ${message}`);
  process.exitCode = 1;
});