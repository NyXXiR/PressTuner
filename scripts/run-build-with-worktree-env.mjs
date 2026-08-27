import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { parse } from "dotenv";

const workspaceRoot = process.cwd();
const commonGitDir = execFileSync(
  "git",
  ["rev-parse", "--git-common-dir"],
  { cwd: workspaceRoot, encoding: "utf8" },
).trim();
const canonicalRoot = dirname(resolve(workspaceRoot, commonGitDir));
const envFiles = [".env", ".env.production", ".env.local", ".env.production.local"];
const injected = {};

for (const name of envFiles) {
  const localPath = resolve(workspaceRoot, name);
  const canonicalPath = resolve(canonicalRoot, name);
  const source = existsSync(localPath)
    ? localPath
    : existsSync(canonicalPath) ? canonicalPath : null;
  if (!source) continue;
  Object.assign(injected, parse(readFileSync(source)));
}

if (!process.env.OPENAI_API_KEY && !injected.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY was not found in the worktree or canonical PressTuner environment files.");
  process.exit(1);
}

const result = spawnSync("npm", ["run", "build:next"], {
  cwd: workspaceRoot,
  env: { ...injected, ...process.env },
  stdio: "inherit",
});

process.exit(result.status ?? 1);
