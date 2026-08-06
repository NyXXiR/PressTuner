import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { presentPressRagDemo } from "./pressRagDemoPresenter";
import {
  PRESS_RAG_SANDBOX_STAGE_IDS,
  PRESS_RAG_STAGE_OWNED_FIELDS,
  createPressRagSandboxState,
  createPressRagStageDraft,
  projectRecordedPressRagSandbox,
  reducePressRagSandboxState,
  resolvePressRagSandboxStageId,
  runPressRagSandbox,
  validatePressRagStageDraft,
  type PressRagStageDraft,
} from "./pressRagWorkflowSandbox";

const ROOT = new URL("../../evals/press-rag/controlled-live/", import.meta.url);
const fixture = async (name: string) => JSON.parse(await readFile(new URL(name, ROOT), "utf8")) as unknown;
async function model() {
  return presentPressRagDemo({
    dataset: await fixture("dataset-v4.approved.json"),
    baseline: await fixture("results/baseline-v1.json"),
    candidate: await fixture("results/candidate-v3-optimized.json"),
  });
}

test("state reset and every selection boundary return to immutable recorded mode", () => {
  const initial = createPressRagSandboxState();
  assert.deepEqual(initial, { mode: "recorded", draft: null, result: null });
  assert.ok(Object.isFrozen(initial));
  const testing = reducePressRagSandboxState(initial, { type: "set-mode", mode: "test" });
  for (const type of ["reset", "selection-boundary-changed"] as const) {
    assert.deepEqual(reducePressRagSandboxState(testing, { type }), initial);
  }
});

test("the seven stable stages own only approved fields and edges resolve to their source", async () => {
  assert.deepEqual(PRESS_RAG_SANDBOX_STAGE_IDS, [
    "request-intake", "retrieval-execution", "evidence-decision", "response-behavior", "verification", "fallback", "terminal-evaluation",
  ]);
  assert.deepEqual(PRESS_RAG_STAGE_OWNED_FIELDS["response-behavior"], ["finalAnswer", "summary", "citations"]);
  const scenario = (await model()).scenarios[1]!;
  const recorded = projectRecordedPressRagSandbox(scenario.runs[0]!.candidate, scenario.expectation, scenario.prompt);
  for (const edge of recorded.workflow.edges) {
    assert.equal(resolvePressRagSandboxStageId({ kind: "edge", id: edge.id }, recorded.workflow), edge.source);
    assert.ok(edge.inspection.input && edge.inspection.evidence && edge.inspection.decisions && edge.inspection.output);
    assert.doesNotMatch(JSON.stringify(edge), /"quote"\s*:/);
  }
});

test("an unchanged stage run has exact parity for all 26 outcomes and freezes successful results", async () => {
  const view = await model();
  let count = 0;
  for (const scenario of view.scenarios) for (const run of scenario.runs) for (const outcome of [run.baseline, run.candidate]) {
    const before = JSON.stringify(outcome);
    const draft = createPressRagStageDraft("request-intake", scenario.prompt, outcome);
    const result = runPressRagSandbox({ recordedOutcome: outcome, expectation: scenario.expectation, prompt: scenario.prompt, draft });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.deepEqual(result.result, projectRecordedPressRagSandbox(outcome, scenario.expectation, scenario.prompt));
    assert.equal(JSON.stringify(outcome), before);
    assert.ok(Object.isFrozen(result.result));
    assert.ok(Object.isFrozen(result.result.outcome.checks));
    count += 1;
  }
  assert.equal(count, 26);
});

test("retrieval edits recalculate derived rank/expected/checks and preserve upstream projection", async () => {
  const scenario = (await model()).scenarios[0]!;
  const outcome = scenario.runs[0]!.candidate;
  const recorded = projectRecordedPressRagSandbox(outcome, scenario.expectation, scenario.prompt);
  const draft = createPressRagStageDraft("retrieval-execution", scenario.prompt, outcome);
  assert.equal(draft.stageId, "retrieval-execution");
  if (draft.stageId !== "retrieval-execution") return;
  const result = runPressRagSandbox({ ...{ recordedOutcome: outcome, expectation: scenario.expectation, prompt: scenario.prompt }, draft: { ...draft, hits: draft.hits.slice(1) } });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.result.outcome.checks.retrieval, "MISMATCH");
  assert.deepEqual(result.result.workflow.nodes[0], recorded.workflow.nodes[0]);
  assert.notDeepEqual(result.result.workflow.nodes[1], recorded.workflow.nodes[1]);
  assert.deepEqual(result.result.outcome.retrieval.map(({ rank }) => rank), [1, 2, 3, 4]);
});

test("prompt edits never synthesize hits, citations, or answers", async () => {
  const scenario = (await model()).scenarios[1]!;
  const outcome = scenario.runs[0]!.candidate;
  const result = runPressRagSandbox({ recordedOutcome: outcome, expectation: scenario.expectation, prompt: scenario.prompt, draft: { stageId: "request-intake", prompt: "새로운 안전한 질문" } });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.result.outcome.retrieval, outcome.retrieval);
  assert.deepEqual(result.result.outcome.citations, outcome.citations);
  assert.equal(result.result.outcome.finalAnswer, outcome.finalAnswer);
});

test("representative stage edits cascade through checks and terminal projection", async () => {
  const scenario = (await model()).scenarios[1]!;
  const outcome = scenario.runs[0]!.candidate;
  const verification: PressRagStageDraft = { stageId: "verification", mode: "ANSWER", status: "FAIL", supportedClaims: 0, totalClaims: 1 };
  const failed = runPressRagSandbox({ recordedOutcome: outcome, expectation: scenario.expectation, prompt: scenario.prompt, draft: verification });
  assert.equal(failed.ok, true);
  if (!failed.ok) return;
  assert.equal(failed.result.outcome.checks.verification, "MISMATCH");
  assert.equal(failed.result.workflow.nodes.at(-1)?.status, "MISMATCH");

  const terminal = runPressRagSandbox({ recordedOutcome: outcome, expectation: scenario.expectation, prompt: scenario.prompt, draft: { stageId: "terminal-evaluation", status: "FAILED", errorCode: "TEST_FAILURE", latencyMs: 10, costMicros: 2 } });
  assert.equal(terminal.ok, true);
  if (!terminal.ok) return;
  assert.equal(terminal.result.outcome.status, "FAILED");
  assert.deepEqual(terminal.result.workflow.nodes.slice(0, -1), projectRecordedPressRagSandbox(outcome, scenario.expectation, scenario.prompt).workflow.nodes.slice(0, -1));
});

test("tool, branch, citation, and fallback edits reevaluate recorded operands without synthesis", async () => {
  const view = await model();
  const grounded = view.scenarios[1]!;
  const outcome = grounded.runs[0]!.candidate;

  const retrieval = createPressRagStageDraft("retrieval-execution", grounded.prompt, outcome, grounded.expectation);
  assert.equal(retrieval.stageId, "retrieval-execution");
  if (retrieval.stageId !== "retrieval-execution") return;
  const missingTool = runPressRagSandbox({ recordedOutcome: outcome, expectation: grounded.expectation, prompt: grounded.prompt, draft: { ...retrieval, tools: [] } });
  assert.equal(missingTool.ok, true);
  if (!missingTool.ok) return;
  assert.equal(missingTool.result.outcome.checks.expectedTools, "MISMATCH");

  const abstained = runPressRagSandbox({ recordedOutcome: outcome, expectation: grounded.expectation, prompt: grounded.prompt, draft: { stageId: "evidence-decision", responseBranch: "ABSTENTION" } });
  assert.equal(abstained.ok, true);
  if (!abstained.ok) return;
  assert.equal(abstained.result.outcome.checks.answerability, "MISMATCH");
  assert.equal(abstained.result.guardrails.byEdge["evidence-decision--response-behavior"]?.find(({ gate }) => gate)?.verdict, "VIOLATION");

  const response = createPressRagStageDraft("response-behavior", grounded.prompt, outcome, grounded.expectation);
  assert.equal(response.stageId, "response-behavior");
  if (response.stageId !== "response-behavior") return;
  const unexpected = runPressRagSandbox({ recordedOutcome: outcome, expectation: grounded.expectation, prompt: grounded.prompt, draft: { ...response, citations: [...response.citations, { sourceLabel: "sandbox", logicalDocumentId: "unexpected-doc", filename: "sandbox.pdf", pageStart: 1, pageEnd: 1 }] } });
  assert.equal(unexpected.ok, true);
  if (!unexpected.ok) return;
  assert.equal(unexpected.result.outcome.checks.citations, "MISMATCH");

  const fallback = runPressRagSandbox({ recordedOutcome: outcome, expectation: grounded.expectation, prompt: grounded.prompt, draft: { stageId: "fallback", mode: "ABSTENTION", reason: "MANUAL_TEST" } });
  assert.equal(fallback.ok, true);
  if (!fallback.ok) return;
  const recorded = projectRecordedPressRagSandbox(outcome, grounded.expectation, grounded.prompt);
  assert.deepEqual(fallback.result.workflow.nodes.slice(0, 5), recorded.workflow.nodes.slice(0, 5));
  assert.equal(fallback.result.outcome.fallback.mode, "ABSTENTION");
});

test("a later stage edit stacked on an earlier one keeps the earlier stage broken", async () => {
  // CL-001 records retrieval as MATCH against a non-empty expected document set,
  // so a resurrected upstream verdict is visible.
  const retrievalCase = (await model()).scenarios[0]!;
  const outcome = retrievalCase.runs[0]!.candidate;
  const shared = { recordedOutcome: outcome, expectation: retrievalCase.expectation, prompt: retrievalCase.prompt } as const;
  const retrievalIndex = PRESS_RAG_SANDBOX_STAGE_IDS.indexOf("retrieval-execution");
  const recorded = projectRecordedPressRagSandbox(outcome, retrievalCase.expectation, retrievalCase.prompt);
  assert.ok(retrievalCase.expectation.expectedDocuments.length > 0);
  assert.equal(recorded.workflow.nodes[retrievalIndex]?.status, "MATCH");

  const retrieval = createPressRagStageDraft("retrieval-execution", retrievalCase.prompt, outcome, retrievalCase.expectation);
  assert.equal(retrieval.stageId, "retrieval-execution");
  if (retrieval.stageId !== "retrieval-execution") return;
  const broken = runPressRagSandbox({
    ...shared,
    draft: { ...retrieval, hits: retrieval.hits.map((hit) => ({ ...hit, logicalDocumentId: "wrong-document" })) },
  });
  assert.equal(broken.ok, true);
  if (!broken.ok) return;
  assert.equal(broken.result.workflow.nodes[retrievalIndex]?.status, "MISMATCH");

  // Editing a downstream stage must not restore the recorded upstream verdict.
  const later = runPressRagSandbox({
    ...shared,
    draft: { stageId: "verification", mode: "ANSWER", status: "PASS", supportedClaims: 1, totalClaims: 1 },
    current: broken.result,
  });
  assert.equal(later.ok, true);
  if (!later.ok) return;
  assert.equal(later.result.outcome.retrieval[0]?.logicalDocumentId, "wrong-document");
  assert.equal(later.result.outcome.checks.retrieval, "MISMATCH");
  assert.equal(later.result.workflow.nodes[retrievalIndex]?.status, "MISMATCH");
});

test("a forbidden logical citation is recalculated locally and reaches terminal evaluation", async () => {
  const safety = (await model()).scenarios[4]!;
  const outcome = safety.runs[0]!.candidate;
  const forbidden = safety.expectation.forbiddenLogicalDocumentIds[0];
  assert.ok(forbidden);
  const result = runPressRagSandbox({ recordedOutcome: outcome, expectation: safety.expectation, prompt: safety.prompt, draft: { stageId: "response-behavior", finalAnswer: "sandbox answer", summary: null, citations: [{ sourceLabel: "sandbox", logicalDocumentId: forbidden, filename: "sandbox.pdf", pageStart: 1, pageEnd: 1 }] } });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.result.outcome.checks.forbiddenSources, "MISMATCH");
  assert.equal(result.result.workflow.nodes.at(-1)?.status, "MISMATCH");
});

test("field validation rejects sensitive prose, malformed collections, invalid pairs, and terminal inconsistency", () => {
  const cases: PressRagStageDraft[] = [
    { stageId: "request-intake", prompt: "contact qa@example.com" },
    { stageId: "retrieval-execution", hits: [{ logicalDocumentId: "doc", filename: "safe.pdf", pageStart: 2, pageEnd: 1, score: 2 }], tools: [{ sequence: 1, toolName: "search_knowledge", status: "COMPLETED", latencyMs: -1 }] },
    { stageId: "verification", mode: "ANSWER", status: null, supportedClaims: 2, totalClaims: 1 },
    { stageId: "fallback", mode: null, reason: "UNSAFE reason" },
    { stageId: "terminal-evaluation", status: "COMPLETED", errorCode: "ERROR", latencyMs: -1, costMicros: -1 },
  ];
  for (const draft of cases) assert.ok(validatePressRagStageDraft(draft).length > 0);
  assert.ok(validatePressRagStageDraft({ stageId: "request-intake", prompt: "safe", traversal: "TAKEN" } as unknown as PressRagStageDraft).some(({ code }) => code === "FORBIDDEN_FIELD"));
  assert.ok(validatePressRagStageDraft({ stageId: "retrieval-execution", hits: [{ logicalDocumentId: "doc", filename: "safe.pdf", pageStart: 1, pageEnd: 1, score: 0.5, rank: 99 }], tools: [] } as unknown as PressRagStageDraft).some(({ field }) => field.endsWith("rank")));
});
