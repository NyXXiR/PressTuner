import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config as loadDotEnv } from "dotenv";

const TEST_FILE_SUFFIX = ".test.ts";

export function resolveTestDatabaseUrl(env) {
  const explicit = env.TEST_DATABASE_URL?.trim();
  const source = explicit || env.DATABASE_URL?.trim();
  if (!source) {
    throw new Error("TEST_DATABASE_URL or DATABASE_URL is required to run tests.");
  }

  const url = new URL(source);
  const database = url.pathname.slice(1);
  if (!explicit) {
    url.pathname = `/${database}_test`;
  }

  const testDatabase = url.pathname.slice(1);
  if (!/(^|[_-])test($|[_-])/i.test(testDatabase)) {
    throw new Error(
      `Refusing to run tests against non-test database: ${testDatabase}`,
    );
  }

  return url.toString();
}

export async function discoverTestFiles(roots, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const files = [];

  async function visit(path) {
    const pathStat = await stat(path);
    if (pathStat.isFile()) {
      if (path.endsWith(TEST_FILE_SUFFIX)) files.push(path);
      return;
    }

    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = resolve(path, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(TEST_FILE_SUFFIX)) {
        files.push(entryPath);
      }
    }
  }

  for (const root of roots) {
    await visit(resolve(cwd, root));
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function main() {
  loadDotEnv({ path: resolve(process.cwd(), ".env"), override: false });
  const testDatabaseUrl = resolveTestDatabaseUrl(process.env);
  const requestedPaths = process.argv.slice(2);
  const roots = requestedPaths.length > 0 ? requestedPaths : ["lib", "domain"];
  const files = await discoverTestFiles(roots);
  if (files.length === 0) {
    console.error("No test files found under lib/ or domain/.");
    process.exitCode = 1;
    return;
  }

  const testEnv = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    NODE_ENV: "test",
  };
  const preflight = spawnSync(
    process.execPath,
    [resolve(process.cwd(), "scripts", "check-test-database.mjs")],
    { stdio: "inherit", env: testEnv },
  );
  if (preflight.error) throw preflight.error;
  if (preflight.status !== 0) {
    process.exitCode = preflight.status ?? 1;
    return;
  }

  const supportsConcurrencyFlag =
    process.allowedNodeEnvironmentFlags.has("--test-concurrency");
  const batches = supportsConcurrencyFlag ? [files] : files.map((file) => [file]);
  for (const batch of batches) {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--test",
        ...(supportsConcurrencyFlag ? ["--test-concurrency=1"] : []),
        ...batch,
      ],
      {
        stdio: "inherit",
        env: testEnv,
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
