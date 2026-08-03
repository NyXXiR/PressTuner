import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { config as loadDotEnv } from "dotenv";

import { resolveTestDatabaseUrl } from "./run-tests.mjs";

loadDotEnv({ path: resolve(process.cwd(), ".env"), override: false });
const testDatabaseUrl = resolveTestDatabaseUrl(process.env);
const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

console.log(`Synchronizing Prisma schema to isolated database: ${databaseName}`);
const result = spawnSync(
  npx,
  ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"],
  {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testDatabaseUrl, NODE_ENV: "test" },
  },
);

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
