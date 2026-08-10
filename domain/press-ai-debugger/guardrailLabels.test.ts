import assert from "node:assert/strict";
import test from "node:test";
import { guardrailLabelKo, requirementDisplayLabels } from "./guardrailLabels";
import { pressCreationProcess } from "./processRegistry";

test("every mandatory guardrail of press-creation has a Korean label", () => {
  for (const edge of pressCreationProcess.edges) {
    for (const guardrailId of edge.mandatoryGuardrailIds) {
      const label = guardrailLabelKo(guardrailId);
      assert.notEqual(label, guardrailId, `missing label: ${guardrailId}`);
      assert.ok(label.length > 0);
    }
  }
});

test("unknown guardrail ids fall back to the raw id", () => {
  assert.equal(guardrailLabelKo("no-such-guardrail"), "no-such-guardrail");
});

test("exports safe bilingual requirement, stage, and edge labels", () => {
  assert.deepEqual(requirementDisplayLabels({ requirementId: "critical-fact-preservation", stageId: "brief-normalization", edgeId: "brief-draft" }), {
    label: { ko: "핵심 사실 보존", en: "Critical fact preservation" },
    stageLabel: { ko: "브리프 정규화", en: "Brief normalization" },
    edgeLabel: { ko: "브리프에서 초안으로", en: "Brief to draft" },
  });
});
