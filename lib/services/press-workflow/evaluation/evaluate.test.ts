import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { CRITERIA, datasetSchema, hash, scenarioInputHash, type Draft } from "../../../../domain/press-workflow/evaluation/contracts";
import { evaluateDraft } from "./evaluate";

const dataset = datasetSchema.parse(JSON.parse(readFileSync("evals/press-workflow/dual/v1/dataset.json", "utf8")));
const scenario = dataset.cases[0];
const draft: Draft = { version: "press-eval-draft/v1", caseId: scenario.caseId, groupId: scenario.groupId, partition: scenario.partition,
  variant: "BASELINE", trial: 1, datasetHash: hash(dataset), inputHash: scenarioInputHash(scenario), configurationHash: hash({}),
  model: "fixture", evidenceClass: "SYNTHETIC", createdAt: "2026-10-06T00:00:00.000Z", text: scenario.challenges[0].text,
  outputHash: hash(scenario.challenges[0].text), generationMs: 0, usage: null };
const checks = CRITERIA.map(criterion => ({ criterion, judgment: "PASS" as const, reason: "Test fixture", evidence: [] }));

test("evaluators receive the same immutable output and FACT-only context", async () => {
  let observed = "";
  const result = await evaluateDraft(dataset, draft, { model: "test", ragas: async input => {
    observed = input.response; assert.deepEqual(input.retrieved_contexts, scenario.facts.map(f => f.content)); return { score: 1, usage: null };
  }, judge: async input => { assert.equal(input.draft, observed); return { checks, usage: null }; } });
  assert.equal(result.ragas.score, 1); assert.equal(result.domain.verdict, "PASS");
  assert.equal(result.draft.outputHash, draft.outputHash);
});
test("one evaluator failing does not discard the other result or count as success", async () => {
  const result = await evaluateDraft(dataset, draft, { model: "test", ragas: async () => { throw new Error("sensitive provider payload"); },
    judge: async () => ({ checks: checks.map(c => c.criterion === "REQUIRED_FACTS" ? { ...c, judgment: "FAIL" as const } : c), usage: null }) });
  assert.equal(result.ragas.state, "NOT_EVALUABLE"); assert.equal(result.ragas.score, null);
  assert.equal(result.domain.verdict, "BLOCK"); assert.ok(!JSON.stringify(result).includes("sensitive"));
});
test("invalid scores and fabricated evidence are non-evaluable; mismatched input stops before calls", async () => {
  const ports = { model: "test", ragas: async () => ({ score: NaN, usage: null }), judge: async () => ({ checks: checks.map(c => ({ ...c, evidence: [{ quote: "invented quote", factIds: [] }] })), usage: null }) };
  const result = await evaluateDraft(dataset, draft, ports);
  assert.equal(result.ragas.state, "NOT_EVALUABLE"); assert.equal(result.domain.state, "NOT_EVALUABLE");
  await assert.rejects(evaluateDraft(dataset, { ...draft, inputHash: hash("wrong") }, ports), /IDENTITY/);
});
test("uncertain content cannot be hidden by a passing style score", async () => {
  const result = await evaluateDraft(dataset, draft, { model: "test", ragas: async () => ({ score: 1, usage: null }),
    judge: async () => ({ checks: checks.map(c => c.criterion === "FACTUAL_SUPPORT" ? { ...c, judgment: "UNCERTAIN" as const } : c), usage: null }) });
  assert.equal(result.domain.state, "NOT_EVALUABLE"); assert.equal(result.domain.verdict, null);
});

test("invalid completed judgments retain measured token usage", async () => {
  const usage = { inputTokens: 100, outputTokens: 20 };
  const result = await evaluateDraft(dataset, draft, { model: "test", ragas: async () => ({ score: NaN, usage }),
    judge: async () => ({ checks: [], usage }) });
  assert.equal(result.ragas.state, "NOT_EVALUABLE"); assert.deepEqual(result.ragas.usage, usage);
  assert.equal(result.domain.state, "NOT_EVALUABLE"); assert.deepEqual(result.domain.usage, usage);
});
