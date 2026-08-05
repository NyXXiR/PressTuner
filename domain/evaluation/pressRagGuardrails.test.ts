import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { presentPressRagDemo } from "./pressRagDemoPresenter";
import {
  PRESS_RAG_GUARDRAIL_IDS,
  projectPressRagGuardrails,
  rollUpGuardrails,
} from "./pressRagGuardrails";
import { projectPressRagWorkflowView } from "./pressRagWorkflowView";

const ROOT = new URL("../../evals/press-rag/controlled-live/", import.meta.url);
const fixture = async (name: string) => JSON.parse(await readFile(new URL(name, ROOT), "utf8")) as unknown;

async function projectAll() {
  const viewModel = presentPressRagDemo({
    dataset: await fixture("dataset-v4.approved.json"),
    baseline: await fixture("results/baseline-v1.json"),
    candidate: await fixture("results/candidate-v3-optimized.json"),
  });
  return viewModel.scenarios.flatMap((scenario) =>
    scenario.runs.flatMap((run) =>
      (["baseline", "candidate"] as const).map((configuration) => {
        const outcome = run[configuration];
        const workflow = projectPressRagWorkflowView(outcome, scenario.expectation, scenario.prompt);
        return {
          caseId: scenario.caseId,
          configuration,
          workflow,
          guardrails: projectPressRagGuardrails(outcome, scenario.expectation, workflow),
        };
      }),
    ),
  );
}

test("every node and edge always exposes the same five guardrails in a fixed order", async () => {
  for (const { workflow, guardrails, caseId } of await projectAll()) {
    for (const node of workflow.nodes) {
      const lanes = guardrails.byNode[node.id];
      assert.ok(lanes, `${caseId} ${node.id} has no guardrail lanes`);
      assert.deepEqual(lanes.map((lane) => lane.guardrailId), [...PRESS_RAG_GUARDRAIL_IDS]);
    }
    for (const edge of workflow.edges) {
      const lanes = guardrails.byEdge[edge.id];
      assert.ok(lanes, `${caseId} ${edge.id} has no guardrail lanes`);
      assert.deepEqual(lanes.map((lane) => lane.guardrailId), [...PRESS_RAG_GUARDRAIL_IDS]);
    }
  }
});

test("exactly one guardrail gates each edge and it names the transition condition", async () => {
  for (const { workflow, guardrails } of await projectAll()) {
    for (const edge of workflow.edges) {
      const gates = guardrails.byEdge[edge.id]!.filter((lane) => lane.gate);
      assert.equal(gates.length, 1, `${edge.id} must have exactly one gating guardrail`);
      assert.match(gates[0]!.expected, new RegExp(edge.decisionLabel));
      // A taken edge cannot be reported as a violation of its own gate.
      if (edge.state === "TAKEN") assert.equal(gates[0]!.verdict, "PASS");
    }
  }
});

test("no lane is ever blank: every result carries expected, observed, and a reason", async () => {
  for (const { guardrails } of await projectAll()) {
    const all = [...Object.values(guardrails.byNode), ...Object.values(guardrails.byEdge)].flat();
    for (const lane of all) {
      assert.ok(lane.label.length > 0);
      assert.ok(lane.rule.length > 0);
      assert.ok(lane.expected.length > 0);
      assert.ok(lane.observed.length > 0);
      assert.ok(lane.reason.length > 0, `${lane.guardrailId} is missing a reason`);
    }
  }
});

test("a not-applicable lane never claims a verdict about the run", async () => {
  for (const { guardrails } of await projectAll()) {
    const all = [...Object.values(guardrails.byNode), ...Object.values(guardrails.byEdge)].flat();
    for (const lane of all.filter((entry) => entry.verdict === "NOT_APPLICABLE")) {
      assert.equal(lane.expected, "—");
      assert.equal(lane.observed, "—");
      assert.equal(lane.gate, false);
    }
  }
});

test("the roll-up reports the worst verdict a stage produced", () => {
  const lane = (verdict: "PASS" | "VIOLATION" | "NOT_EVALUABLE" | "NOT_APPLICABLE") => ({
    guardrailId: "evidence-use" as const, label: "l", rule: "r",
    verdict, expected: "e", observed: "o", reason: "why", gate: false,
  });

  assert.equal(rollUpGuardrails([lane("PASS"), lane("VIOLATION"), lane("NOT_EVALUABLE")]), "VIOLATION");
  assert.equal(rollUpGuardrails([lane("PASS"), lane("NOT_EVALUABLE")]), "NOT_EVALUABLE");
  assert.equal(rollUpGuardrails([lane("PASS"), lane("NOT_APPLICABLE")]), "PASS");
  assert.equal(rollUpGuardrails([lane("NOT_APPLICABLE")]), "NOT_APPLICABLE");
});

test("a failed recorded run always surfaces the failure at the terminal stage", async () => {
  const projections = await projectAll();
  const failed = projections.filter(({ workflow }) => workflow.summary.recordedStatus === "FAILED");

  assert.ok(failed.length > 0, "the demo dataset should include at least one failed run");
  for (const { guardrails, workflow, caseId } of failed) {
    const terminal = guardrails.byNode[workflow.nodes[workflow.nodes.length - 1]!.id]!;
    // A run can fail after a genuinely successful retrieval, so some lanes may still pass.
    // What must never happen is a failed run reading as clean across the board.
    assert.ok(
      terminal.some((lane) => lane.verdict === "VIOLATION" || lane.verdict === "NOT_EVALUABLE"),
      `${caseId}: a failed run must not report every guardrail as satisfied`,
    );
  }
});
