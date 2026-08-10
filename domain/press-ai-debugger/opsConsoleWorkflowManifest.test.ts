import assert from "node:assert/strict";
import test from "node:test";
import { getPressAiProcessDefinition } from "./processRegistry";
import { buildOpsConsoleWorkflowManifest } from "./opsConsoleWorkflowManifest";

test("registry topology projects deterministically to fixed external workflow identities", () => {
  for (const [processId, expected] of [["rag-query", ["presstuner.press-agent", "press-agent-v2", "DAG"]], ["press-creation", ["presstuner.press-creation", "2.0.0", "STATE_MACHINE"]]] as const) {
    const registry = getPressAiProcessDefinition(processId);
    const first = buildOpsConsoleWorkflowManifest(processId);
    const second = buildOpsConsoleWorkflowManifest(processId);
    assert.deepEqual(first, second);
    assert.deepEqual([first.workflow.id, first.workflow.version, first.topology], expected);
    assert.deepEqual(first.stages.map((item) => item.id), [...registry.nodes].sort((a, b) => a.sequence - b.sequence).map((item) => item.id));
    assert.deepEqual(first.edges.map((item) => item.id), [...registry.edges].sort((a, b) => a.sequence - b.sequence).map((item) => item.id));
    assert.deepEqual(first.stages.map((item) => item.description), registry.nodes.map((item) => item.description));
    const serialized = JSON.stringify(first);
    for (const forbidden of ["inputSchema", "outputSchema", "troubleshooting", "quotaUnits", "payload", "operationKey", "rawText", "generated article"]) assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  }
});

test("press creation manifest declares registry gates and guardrails at their source stages", () => {
  const manifest = buildOpsConsoleWorkflowManifest("press-creation");
  const source = manifest.stages.find((item) => item.id === "brief-normalization")!;
  assert.ok(source.gateIds?.includes("confirm-normalized-brief"));
  assert.ok(source.guardrailIds?.includes("memo-brief-grounding"));
  assert.deepEqual(manifest.edges.find((item) => item.id === "brief-draft")?.guardrailIds, ["memo-brief-grounding", "critical-fact-preservation"]);
});

test("press agent manifest declares the five native monitoring guardrails", () => {
  const manifest = buildOpsConsoleWorkflowManifest("rag-query");
  const guardrailIds = new Set(manifest.stages.flatMap((stage) => stage.guardrailIds ?? []));
  assert.deepEqual([...guardrailIds].sort(), [
    "citation-claim-verification",
    "evidence-use",
    "expected-tool-behavior",
    "forbidden-source-protection",
    "safe-fallback",
  ]);
});
