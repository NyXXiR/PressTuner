import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./quality-system";

test("saved human failure -> improvement recipe -> regression command with incomplete coverage is reproducible", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../domain/press-workflow/evaluation/analysis-fixture.json", import.meta.url), "utf8"));
  const dir = await mkdtemp(join(tmpdir(), "press-quality-cycle-"));
  const input = join(dir, "evaluation.json"), review = join(dir, "review.json"), manifest = join(dir, "regression.json");
  await writeFile(input, JSON.stringify(fixture.batch)); await writeFile(review, JSON.stringify(fixture.review));
  const args = ["--input", input, "--review", review];
  assert.equal(await main(["plan", ...args, "--out", join(dir, "plan.json")]), 0);
  assert.equal(await main(["freeze", ...args, "--out", join(dir, "recipe.json")]), 0);
  assert.equal(await main(["promote", ...args, "--out", manifest]), 0);
  assert.equal(await main(["regression", "--input", input, "--manifest", manifest, "--out", join(dir, "gate.json")]), 2);
  const plan = JSON.parse(await readFile(join(dir, "plan.json"), "utf8"));
  assert.equal(plan.effect, "NOT_MEASURED");
  const gate = JSON.parse(await readFile(join(dir, "gate.json"), "utf8"));
  assert.equal(gate.state, "INCOMPLETE");
  await assert.rejects(main(["promote", ...args, "--out", manifest]), /EEXIST/);
});
