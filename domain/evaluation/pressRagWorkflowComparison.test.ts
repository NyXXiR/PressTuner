import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { presentPressRagDemo } from "./pressRagDemoPresenter";
import { projectPressRagWorkflowComparison } from "./pressRagWorkflowComparison";
import {
  createPressRagStageDraft,
  projectRecordedPressRagSandbox,
  runPressRagSandbox,
} from "./pressRagWorkflowSandbox";

const ROOT = new URL("../../evals/press-rag/controlled-live/", import.meta.url);
const fixture = async (name: string) => JSON.parse(await readFile(new URL(name, ROOT), "utf8")) as unknown;

async function sample() {
  const view = presentPressRagDemo({
    dataset: await fixture("dataset-v4.approved.json"),
    baseline: await fixture("results/baseline-v1.json"),
    candidate: await fixture("results/candidate-v3-optimized.json"),
  });
  const scenario = view.scenarios[0]!;
  const outcome = scenario.runs[0]!.candidate;
  const recorded = projectRecordedPressRagSandbox(outcome, scenario.expectation, scenario.prompt);
  return { scenario, outcome, recorded };
}

test("before calculation the immutable recorded stage remains the sole snapshot", async () => {
  const { recorded } = await sample();
  const comparison = projectPressRagWorkflowComparison(recorded, null, "retrieval-execution");
  assert.equal(comparison.recorded.id, "retrieval-execution");
  assert.equal(comparison.tested, null);
  assert.deepEqual(comparison.changes, []);
});

test("an unchanged calculation has exact parity and no changed inspection rows", async () => {
  const { scenario, outcome, recorded } = await sample();
  const draft = createPressRagStageDraft("retrieval-execution", scenario.prompt, outcome, scenario.expectation);
  const result = runPressRagSandbox({ recordedOutcome: outcome, expectation: scenario.expectation, prompt: scenario.prompt, draft });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const comparison = projectPressRagWorkflowComparison(recorded, result.result, "retrieval-execution");
  assert.equal(comparison.exactParity, true);
  assert.deepEqual(comparison.changes, []);
});

test("a retrieval edit exposes ordered value and outcome deltas without mutating recorded data", async () => {
  const { scenario, outcome, recorded } = await sample();
  const before = JSON.stringify(recorded);
  const draft = createPressRagStageDraft("retrieval-execution", scenario.prompt, outcome, scenario.expectation);
  assert.equal(draft.stageId, "retrieval-execution");
  if (draft.stageId !== "retrieval-execution") return;
  const result = runPressRagSandbox({
    recordedOutcome: outcome,
    expectation: scenario.expectation,
    prompt: scenario.prompt,
    draft: { ...draft, hits: [] },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const comparison = projectPressRagWorkflowComparison(recorded, result.result, "retrieval-execution");
  assert.equal(comparison.exactParity, false);
  assert.ok(comparison.changes.some(({ kind }) => kind === "status"));
  assert.ok(comparison.changes.some(({ kind }) => kind === "inspection"));
  assert.equal(JSON.stringify(recorded), before);
});

test("only source-owned transitions are returned and traversal stays independent from its gate", async () => {
  const { recorded } = await sample();
  const comparison = projectPressRagWorkflowComparison(recorded, recorded, "evidence-decision");
  assert.ok(comparison.transitions.length > 0);
  assert.ok(comparison.transitions.every(({ source }) => source === "evidence-decision"));

  const view = presentPressRagDemo({
    dataset: await fixture("dataset-v4.approved.json"),
    baseline: await fixture("results/baseline-v1.json"),
    candidate: await fixture("results/candidate-v3-optimized.json"),
  });
  const projections = view.scenarios.flatMap((scenario) => scenario.runs.flatMap((run) =>
    ([run.baseline, run.candidate] as const).map((outcome) =>
      projectRecordedPressRagSandbox(outcome, scenario.expectation, scenario.prompt))));
  const pair = projections.flatMap((projection) => projection.workflow.edges.map((edge) => ({
    projection, edge, gate: projection.guardrails.byEdge[edge.id]?.find(({ gate }) => gate),
  }))).find(({ edge, gate }) => edge.state === "TAKEN" && gate?.verdict === "VIOLATION");
  assert.ok(pair);
  const independent = projectPressRagWorkflowComparison(pair.projection, pair.projection, pair.edge.source)
    .transitions.find(({ id }) => id === pair.edge.id);
  assert.equal(independent?.recorded.traversal, "TAKEN");
  assert.equal(independent?.recorded.gateVerdict, "VIOLATION");
});
