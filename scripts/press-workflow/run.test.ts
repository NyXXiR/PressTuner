import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseArguments } from "./run";

test("CLI rejects misspelled modes/options and requires explicit live spending", () => {
  assert.equal(parseArguments([]).mode, "mock");
  assert.throws(() => parseArguments(["--mode", "live"]), /allow-model-spend/);
  assert.throws(() => parseArguments(["--mode", "liv"]), /mock or live/);
  assert.throws(() => parseArguments(["--model", "x"]), /Unknown option/);
  assert.throws(() => parseArguments(["--out"]), /Missing value/);
});

test("CLI compares actual prompts without credentials/server and refuses to overwrite evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "press-workflow-test-"));
  try {
    const out = join(directory, "comparison.json");
    const command = ["--import", "tsx", "scripts/press-workflow/run.ts", "--out", out];
    const env = { ...process.env };
    delete env.OPENAI_API_KEY;
    delete env.DATABASE_URL;
    delete env.TEST_DATABASE_URL;
    const cwd = fileURLToPath(new URL("../../", import.meta.url));
    const first = spawnSync(process.execPath, command, { cwd, env, encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const before = await readFile(out, "utf8");
    const artifact = JSON.parse(before);
    assert.equal(artifact.baseline.evidenceClass, "synthetic");
    assert.equal(artifact.candidate.qualityStatus, "NOT_EVALUATED");
    assert.equal(artifact.baseline.configuration.snapshot.effective.tone, "formal");
    assert.equal(artifact.candidate.configuration.snapshot.effective.tone, "friendly");
    assert.notEqual(artifact.baseline.requestHash, artifact.candidate.requestHash);
    assert.deepEqual(artifact.baseline.output, artifact.candidate.output);
    const second = spawnSync(process.execPath, command, { cwd, env, encoding: "utf8" });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /EEXIST/);
    assert.equal(await readFile(out, "utf8"), before);
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});
