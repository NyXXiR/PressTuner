import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { discoverTestFiles, resolveTestDatabaseUrl } from "./run-tests.mjs";

test("resolveTestDatabaseUrl isolates the configured database and rejects unsafe overrides", () => {
  assert.equal(
    new URL(
      resolveTestDatabaseUrl({
        DATABASE_URL: "postgresql://user:secret@localhost:5432/presstuner?schema=public",
      }),
    ).pathname,
    "/presstuner_test",
  );
  assert.equal(
    new URL(
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL:
          "postgresql://user:secret@localhost:5432/presstuner_test?schema=public",
      }),
    ).pathname,
    "/presstuner_test",
  );
  assert.throws(
    () =>
      resolveTestDatabaseUrl({
        TEST_DATABASE_URL: "postgresql://user:secret@localhost:5432/presstuner",
      }),
    /Refusing to run tests against non-test database/,
  );
});

test("discoverTestFiles recursively finds and sorts TypeScript tests across roots", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "presstuner-test-discovery-"));
  await mkdir(join(cwd, "lib", "nested"), { recursive: true });
  await mkdir(join(cwd, "domain"), { recursive: true });
  await writeFile(join(cwd, "lib", "nested", "z.test.ts"), "");
  await writeFile(join(cwd, "lib", "nested", "ignored.ts"), "");
  await writeFile(join(cwd, "domain", "a.test.ts"), "");

  const files = await discoverTestFiles(["lib", "domain"], { cwd });

  assert.deepEqual(
    files.map((file) => file.slice(cwd.length + 1).replaceAll("\\", "/")),
    ["domain/a.test.ts", "lib/nested/z.test.ts"],
  );

  const focused = await discoverTestFiles(["lib/nested/z.test.ts"], { cwd });
  assert.deepEqual(
    focused.map((file) => file.slice(cwd.length + 1).replaceAll("\\", "/")),
    ["lib/nested/z.test.ts"],
  );
});
