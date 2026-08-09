import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCER_CAPABILITIES, WorkflowManifestSchema, verifyWorkflowDefinitionHash } from "@nyxxir/ops-producer";

import { PRESS_AI_PROCESS_IDS } from "./processRegistry";
import { buildPressAiWorkflowManifest } from "./opsProducerManifest";

test("registered PressTuner workflows project to strict deterministic producer manifests", async () => {
  for (const processId of PRESS_AI_PROCESS_IDS) {
    const first = await buildPressAiWorkflowManifest(processId);
    const second = await buildPressAiWorkflowManifest(processId);

    assert.deepEqual(WorkflowManifestSchema.parse(first), first);
    assert.equal(await verifyWorkflowDefinitionHash(first), true);
    assert.equal(first.definitionHash, second.definitionHash);
    assert.equal(first.workflow.id, `presstuner.${processId}`);
    assert.deepEqual(new Set(first.capabilities), new Set(PRODUCER_CAPABILITIES));
  }
});

test("rag topology preserves registered nodes and branches without private registry fields", async () => {
  const manifest = await buildPressAiWorkflowManifest("rag-query");

  assert.deepEqual(manifest.stages.map(({ id, kind }) => ({ id, kind })), [
    { id: "request-intake", kind: "INTAKE" },
    { id: "retrieval-execution", kind: "TOOL_EXECUTION" },
    { id: "evidence-decision", kind: "DECISION" },
    { id: "response-behavior", kind: "RESPONSE" },
    { id: "verification", kind: "VERIFICATION" },
    { id: "fallback", kind: "FALLBACK" },
    { id: "terminal-evaluation", kind: "TERMINAL" },
  ]);
  assert.deepEqual(manifest.edges.filter((edge) => edge.sourceStageId === "verification").map(({ id, transitionType }) => ({ id, transitionType })), [
    { id: "verification-terminal", transitionType: "BRANCH" },
    { id: "verification-fallback", transitionType: "BRANCH" },
  ]);
  const serialized = JSON.stringify(manifest);
  assert.doesNotMatch(serialized, /payload|mandatoryGuardrailIds|description|troubleshooting|inputSchema|outputSchema|prompt|rawText/);
});

test("press creation manifest declares existing human gate identities", async () => {
  const manifest = await buildPressAiWorkflowManifest("press-creation");

  assert.deepEqual(manifest.stages.flatMap((stage) => stage.gateIds ?? []), [
    "confirm-normalized-brief",
    "confirm-generated-draft",
    "select-review-notes",
    "review-rewritten-draft",
  ]);
  assert.deepEqual(manifest.edges.map(({ id, transitionType }) => ({ id, transitionType })), [
    { id: "initialization-brief", transitionType: "SEQUENCE" },
    { id: "brief-draft", transitionType: "GUARD" },
    { id: "draft-review", transitionType: "GUARD" },
    { id: "review-rewrite", transitionType: "GUARD" },
    { id: "rewrite-review", transitionType: "RETRY" },
  ]);
  assert.equal(manifest.topology, "STATE_MACHINE");
});
