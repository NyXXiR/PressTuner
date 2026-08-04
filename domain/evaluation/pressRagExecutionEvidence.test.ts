import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPressRagExecutionEvidence } from "./pressRagExecutionEvidence";
import { presentPressRagDemo } from "./pressRagDemoPresenter";
import { PRESS_RAG_WORKFLOW_STAGE_IDS } from "./pressRagWorkflowView";

const ROOT = new URL("../../evals/press-rag/controlled-live/", import.meta.url);
const fixture = async (name: string) => JSON.parse(await readFile(new URL(name, ROOT), "utf8")) as unknown;
async function artifact() {
  const model = presentPressRagDemo({ dataset: await fixture("dataset-v4.approved.json"), baseline: await fixture("results/baseline-v1.json"), candidate: await fixture("results/candidate-v3-optimized.json") });
  return buildPressRagExecutionEvidence(model);
}

test("exports every selectable baseline/candidate run with the stable seven-stage path", async () => {
  const value = await artifact();
  assert.equal(value.schemaVersion, "press-rag/execution-evidence/v1");
  assert.equal(value.runs.length, 26);
  for (const run of value.runs) assert.deepEqual(run.stages.map(({ stageId }) => stageId), PRESS_RAG_WORKFLOW_STAGE_IDS);
});

test("exports raw retrieval/tool facts and declarative assertions without Press verdicts", async () => {
  const value = await artifact();
  const run = value.runs.find(({ caseId, role }) => caseId === "CL-001" && role === "BASELINE")!;
  const retrieval = run.stages.find(({ stageId }) => stageId === "retrieval-execution")!;
  assert.ok(retrieval.evidence.some(({ key }) => key === "retrievedDocumentIds"));
  assert.ok(retrieval.evidence.some(({ key }) => key === "executedTools"));
  assert.ok(retrieval.assertions.some(({ operator }) => operator === "SET_RELATION"));
  assert.doesNotMatch(JSON.stringify(value), /"status":"(?:MATCH|MISMATCH)"/);
});

test("records failed missing-output downstream stages as UNKNOWN with explicit missing evidence", async () => {
  const value = await artifact();
  const run = value.runs.find(({ caseId, role, executionState }) => caseId === "CL-034" && role === "BASELINE" && executionState === "FAILED")!;
  for (const stageId of ["evidence-decision", "response-behavior", "verification", "fallback"] as const) {
    const stage = run.stages.find((item) => item.stageId === stageId)!;
    assert.equal(stage.executionState, "UNKNOWN");
    assert.ok(stage.evidence.some(({ availability, value }) => availability === "MISSING" && value === null));
  }
});

test("is byte deterministic and omits raw response bodies and runtime identities", async () => {
  const first = JSON.stringify(await artifact(), null, 2) + "\n";
  const second = JSON.stringify(await artifact(), null, 2) + "\n";
  assert.equal(first, second);
  for (const key of ["finalAnswer", "summary", "prompt", "executionId", "caseRunId", "traceId", "teamId", "startedById", "reviewerId", "content", "quote"]) assert.doesNotMatch(first, new RegExp(`"${key}"\\s*:`));
});
