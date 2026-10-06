import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { datasetSchema, draftSchema, CRITERIA, judgeSchema, validateJudgment, hash } from "./contracts";

test("dataset binds facts, unique groups, partitions and authored expectation provenance", () => {
  const raw = JSON.parse(readFileSync("evals/press-workflow/dual/v1/dataset.json", "utf8"));
  const data = datasetSchema.parse(raw);
  assert.equal(data.cases.length, 30);
  assert.equal(data.cases.filter(c => c.partition === "DEVELOPMENT").length, 20);
  assert.equal(data.cases.filter(c => c.partition === "HOLDOUT").length, 10);
  assert.throws(() => datasetSchema.parse({ ...raw, cases: [...raw.cases, raw.cases[0]] }));
  const broken = structuredClone(raw);
  broken.cases[0].requiredFactIds = ["unknown"];
  assert.throws(() => datasetSchema.parse(broken));
  assert.ok(data.cases.every(c => c.challenges.every(d => d.expectationSource === "AI_AUTHORED")));
});

test("semantic evidence must be exact and bound to accepted facts; no duplicate criteria", () => {
  const checks = CRITERIA.map(criterion => ({ criterion, judgment: "PASS", reason: "observed", evidence: [{ quote: "출시합니다", factIds: ["f1"] }] }));
  assert.doesNotThrow(() => validateJudgment(judgeSchema.parse({ checks }), "내일 출시합니다.", ["f1"]));
  assert.throws(() => validateJudgment(judgeSchema.parse({ checks }), "다른 문장", ["f1"]));
  assert.throws(() => validateJudgment(judgeSchema.parse({ checks }), "출시합니다", ["f2"]));
  assert.throws(() => judgeSchema.parse({ checks: checks.map(() => checks[0]) }));
});

test("draft content hash cannot be silently changed or reused with another dataset", () => {
  const draft = { version: "press-eval-draft/v1", caseId: "C01", groupId: "launch-01", partition: "DEVELOPMENT", variant: "BASELINE", trial: 1,
    datasetHash: hash({ dataset: 1 }), inputHash: hash({ input: 1 }), configurationHash: hash({ config: 1 }),
    model: "mock", evidenceClass: "SYNTHETIC", createdAt: "2026-10-06T00:00:00.000Z", text: "출시합니다.", outputHash: hash("출시합니다."), generationMs: 0, usage: null };
  assert.doesNotThrow(() => draftSchema.parse(draft));
  assert.throws(() => draftSchema.parse({ ...draft, text: "변경" }));
});
