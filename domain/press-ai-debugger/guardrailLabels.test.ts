import assert from "node:assert/strict";
import test from "node:test";
import { guardrailLabelKo } from "./guardrailLabels";
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
