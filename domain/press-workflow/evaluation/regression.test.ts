import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { datasetSchema, hash } from "./contracts";
import { promoteRegression, regressionGate, improvementPlan } from "./regression";

const dataset = datasetSchema.parse(JSON.parse(readFileSync("evals/press-workflow/dual/v1/dataset.json", "utf8")));
const fixture = JSON.parse(readFileSync(new URL("./analysis-fixture.json", import.meta.url), "utf8"));

test("only explicit human failures become input-level regression requirements", () => {
  const manifest = promoteRegression(dataset, fixture.batch, fixture.review);
  assert.equal(manifest.requirements.length, 2);
  assert.ok(manifest.requirements.every(r => r.expected === "PASS" && r.sources.length > 0));
  assert.throws(() => promoteRegression(dataset, fixture.batch, undefined), /HUMAN/);
  const plan = improvementPlan(dataset, fixture.batch, fixture.review);
  assert.ok(plan.instructions.some(i => i.criterion === "PROMOTIONAL_CLAIMS"));
  assert.equal(plan.sourceArtifactHash, hash(fixture.batch));
  assert.equal(plan.effect, "NOT_MEASURED");
});

test("regression gate distinguishes missing coverage from observed failures and is not deployment approval", () => {
  const manifest = promoteRegression(dataset, fixture.batch, fixture.review);
  const b = structuredClone(fixture.batch);
  assert.equal(regressionGate(dataset, manifest, b).exitCode, 2);
  const candidate = b.evaluations.find((e: { draft: { variant: string } }) => e.draft.variant === "CANDIDATE");
  candidate.domain = structuredClone(b.evaluations[0].domain);
  assert.equal(regressionGate(dataset, manifest, b).exitCode, 0);
  candidate.domain.checks[0].judgment = "FAIL";
  candidate.domain.verdict = "BLOCK";
  assert.equal(regressionGate(dataset, manifest, b).exitCode, 1);
  assert.equal(regressionGate(dataset, manifest, b).deploymentAuthorized, false);
  candidate.evaluator.judgeModel = "silently-changed";
  assert.throws(() => regressionGate(dataset, manifest, b));
});
