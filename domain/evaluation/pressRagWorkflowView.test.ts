import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { presentPressRagDemo } from "./pressRagDemoPresenter";
import {
  PRESS_RAG_WORKFLOW_SCHEMA_VERSION,
  projectPressRagWorkflowView,
  type PressRagWorkflowView,
} from "./pressRagWorkflowView";

const ROOT = new URL("../../evals/press-rag/controlled-live/", import.meta.url);
const NODE_IDS = [
  "request-intake",
  "retrieval-execution",
  "evidence-decision",
  "response-behavior",
  "verification",
  "fallback",
  "terminal-evaluation",
] as const;
const EDGE_IDS = NODE_IDS.slice(0, -1).map(
  (source, index) => `${source}--${NODE_IDS[index + 1]}`,
);

async function fixture(name: string) {
  return JSON.parse(await readFile(new URL(name, ROOT), "utf8")) as unknown;
}

async function viewModel() {
  return presentPressRagDemo({
    dataset: await fixture("dataset-v4.approved.json"),
    baseline: await fixture("results/baseline-v1.json"),
    candidate: await fixture("results/candidate-v3-optimized.json"),
  });
}

function node(view: PressRagWorkflowView, id: (typeof NODE_IDS)[number]) {
  const result = view.nodes.find((entry) => entry.id === id);
  assert.ok(result, `missing workflow node ${id}`);
  return result;
}

function assertDeepFrozen(value: unknown, seen = new WeakSet<object>()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.ok(Object.isFrozen(value));
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

test("exports a stable, deterministic, JSON-safe and deeply immutable workflow contract", async () => {
  const model = await viewModel();
  const scenario = model.scenarios[0]!;
  const outcome = scenario.runs[0]!.candidate;
  const first = projectPressRagWorkflowView(outcome, scenario.expectation, scenario.prompt);
  const second = projectPressRagWorkflowView(outcome, scenario.expectation, scenario.prompt);

  assert.equal(PRESS_RAG_WORKFLOW_SCHEMA_VERSION, "press-rag-workflow-view/v2");
  assert.equal(first.schemaVersion, PRESS_RAG_WORKFLOW_SCHEMA_VERSION);
  assert.equal(first.recordedRunIndex, 1);
  assert.equal(first.initiallySelectedNodeId, "request-intake");
  assert.deepEqual(first.nodes.map(({ id }) => id), NODE_IDS);
  assert.deepEqual(first.edges.map(({ id }) => id), EDGE_IDS);
  assert.deepEqual(first, second);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(first)));
  assertDeepFrozen(first);
  assert.equal(node(first, "request-intake").latencyMs, null);
  assert.equal(node(first, "evidence-decision").latencyMs, null);
  assert.equal(node(first, "response-behavior").latencyMs, null);
  assert.equal(node(first, "verification").latencyMs, null);
  assert.equal(node(first, "fallback").latencyMs, null);
  assert.deepEqual(node(first, "request-intake").inspection.input, [
    { label: "승인된 질문", value: scenario.prompt },
  ]);
  for (const workflowNode of first.nodes) {
    assert.ok(workflowNode.inspection.input.length > 0, `${workflowNode.id} input is empty`);
    assert.ok(workflowNode.inspection.evidence.length > 0, `${workflowNode.id} evidence is empty`);
    assert.ok(workflowNode.inspection.output.length > 0, `${workflowNode.id} output is empty`);
  }

  const serialized = JSON.stringify(first);
  for (const key of [
    "executionId",
    "configurationHash",
    "documentIdMap",
    "productResult",
    "traceId",
    "runtimePolicySnapshot",
    "caseRunId",
    "chunkId",
    "teamId",
    "startedById",
    "reviewerId",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(`"${key}"\\s*:`));
  }
});

test("maps retrieval, verification, and terminal records into input evidence and output panels", async () => {
  const model = await viewModel();
  const scenario = model.scenarios.find(({ caseId }) => caseId === "CL-034")!;
  const outcome = scenario.runs[0]!.candidate;
  const view = projectPressRagWorkflowView(outcome, scenario.expectation, scenario.prompt);

  assert.deepEqual(node(view, "retrieval-execution").inspection.input[0], {
    label: "검색 질문",
    value: scenario.prompt,
  });
  assert.ok(node(view, "retrieval-execution").inspection.evidence.some(({ label }) => label === "검색 1"));
  assert.ok(node(view, "retrieval-execution").inspection.output.some(({ label }) => label === "검색 결과"));
  assert.ok(node(view, "verification").inspection.evidence.some(({ label }) => label === "주장 1"));
  assert.ok(node(view, "verification").inspection.output.some(({ label }) => label === "검증 결과"));
  assert.ok(node(view, "terminal-evaluation").inspection.evidence.some(({ label }) => label === "checks.retrieval"));
  assert.ok(node(view, "terminal-evaluation").inspection.output.some(({ label }) => label === "최종 판정"));
});

test("retrieval-only runs preserve retrieval mismatch and do not invent downstream evidence", async () => {
  const model = await viewModel();
  const scenario = model.scenarios.find(({ caseId }) => caseId === "CL-001")!;
  const run = scenario.runs[0]!;
  const baseline = projectPressRagWorkflowView(run.baseline, scenario.expectation);
  const candidate = projectPressRagWorkflowView(run.candidate, scenario.expectation);

  assert.equal(node(baseline, "retrieval-execution").status, "MISMATCH");
  assert.equal(node(candidate, "retrieval-execution").status, "MATCH");
  for (const view of [baseline, candidate]) {
    assert.equal(node(view, "evidence-decision").status, "NOT_EVALUABLE");
    assert.equal(node(view, "verification").status, "NOT_EVALUABLE");
  }
  assert.equal(node(baseline, "terminal-evaluation").status, "MISMATCH");
});

test("grounded answer failures stop truthfully while the candidate exposes verification, fallback, and tool mismatch", async () => {
  const model = await viewModel();
  const scenario = model.scenarios.find(({ caseId }) => caseId === "CL-034")!;
  const run = scenario.runs[0]!;
  const baseline = projectPressRagWorkflowView(run.baseline, scenario.expectation);
  const candidate = projectPressRagWorkflowView(run.candidate, scenario.expectation);

  assert.equal(node(baseline, "terminal-evaluation").status, "FAILED");
  for (const id of ["evidence-decision", "response-behavior", "verification", "fallback"] as const) {
    assert.equal(node(baseline, id).traversal, "UNKNOWN");
    assert.equal(node(baseline, id).status, "NOT_EVALUABLE");
  }
  assert.equal(node(candidate, "response-behavior").stageKind, "ANSWER_RESPONSE");
  assert.equal(node(candidate, "verification").status, "MATCH");
  assert.equal(node(candidate, "fallback").status, "RECORDED");
  assert.match(node(candidate, "fallback").statusReason, /EXTRACTIVE/);
  assert.equal(node(candidate, "retrieval-execution").status, "MISMATCH");
  assert.match(node(candidate, "retrieval-execution").statusReason, /expectedTools/);
});

test("abstention paths remain explicit and preserve citation mismatches", async () => {
  const model = await viewModel();
  const scenario = model.scenarios.find(({ caseId }) => caseId === "CL-037")!;
  const matching = projectPressRagWorkflowView(scenario.runs[0]!.candidate, scenario.expectation);
  const citationMismatch = projectPressRagWorkflowView(scenario.runs[2]!.baseline, scenario.expectation);

  assert.equal(node(matching, "response-behavior").stageKind, "ABSTENTION_RESPONSE");
  assert.equal(node(matching, "evidence-decision").status, "MATCH");
  assert.equal(node(matching, "response-behavior").status, "MATCH");
  assert.equal(node(citationMismatch, "response-behavior").status, "MISMATCH");
  assert.match(node(citationMismatch, "response-behavior").statusReason, /checks\.citations/);
});

test("conflict comparison requires the recorded compare_sources tool", async () => {
  const model = await viewModel();
  const scenario = model.scenarios.find(({ caseId }) => caseId === "CL-033")!;
  const compared = projectPressRagWorkflowView(scenario.runs[0]!.candidate, scenario.expectation);
  const missingComparison = projectPressRagWorkflowView(scenario.runs[1]!.candidate, scenario.expectation);

  assert.equal(node(compared, "response-behavior").stageKind, "CONFLICT_COMPARISON");
  assert.equal(node(compared, "response-behavior").status, "MATCH");
  assert.equal(node(missingComparison, "response-behavior").status, "MISMATCH");
  assert.match(node(missingComparison, "response-behavior").statusReason, /compare_sources/);
});

test("safety mismatches win even when explicit claim verification passes", async () => {
  const model = await viewModel();
  const scenario = model.scenarios.find(({ caseId }) => caseId === "CL-039")!;
  const failed = projectPressRagWorkflowView(scenario.runs[0]!.baseline, scenario.expectation);
  const matching = projectPressRagWorkflowView(scenario.runs[1]!.baseline, scenario.expectation);
  const candidateMatch = projectPressRagWorkflowView(scenario.runs[0]!.candidate, scenario.expectation);

  assert.equal(node(failed, "terminal-evaluation").status, "FAILED");
  assert.equal(node(matching, "response-behavior").status, "MATCH");
  assert.equal(node(candidateMatch, "response-behavior").status, "MATCH");

  for (const run of scenario.runs.slice(1)) {
    const view = projectPressRagWorkflowView(run.candidate, scenario.expectation);
    assert.equal(node(view, "verification").status, "MATCH");
    assert.equal(node(view, "response-behavior").status, "MISMATCH");
    assert.equal(node(view, "terminal-evaluation").status, "MISMATCH");
    assert.match(node(view, "terminal-evaluation").statusReason, /checks\.(answerability|citations|forbiddenSources)/);
  }
});

test("fallback absence is skipped while missing output remains not evaluable", async () => {
  const model = await viewModel();
  const grounded = model.scenarios.find(({ caseId }) => caseId === "CL-034")!;
  const retrieval = model.scenarios.find(({ caseId }) => caseId === "CL-001")!;
  const failed = projectPressRagWorkflowView(grounded.runs[0]!.baseline, grounded.expectation);
  const noFallback = projectPressRagWorkflowView(retrieval.runs[0]!.candidate, retrieval.expectation);

  assert.equal(node(failed, "fallback").status, "NOT_EVALUABLE");
  assert.equal(node(noFallback, "fallback").status, "SKIPPED");
  assert.equal(node(noFallback, "fallback").traversal, "NOT_TRAVERSED");
});

test("every selectable baseline and candidate recording projects the complete stable path", async () => {
  const model = await viewModel();
  let projected = 0;

  for (const scenario of model.scenarios) {
    for (const run of scenario.runs) {
      for (const outcome of [run.baseline, run.candidate]) {
        const first = projectPressRagWorkflowView(outcome, scenario.expectation);
        const second = projectPressRagWorkflowView(outcome, scenario.expectation);
        assert.deepEqual(first.nodes.map(({ id }) => id), NODE_IDS);
        assert.deepEqual(first.edges.map(({ id }) => id), EDGE_IDS);
        assert.equal(JSON.stringify(first), JSON.stringify(second));
        projected += 1;
      }
    }
  }

  assert.equal(projected, 26);
});
