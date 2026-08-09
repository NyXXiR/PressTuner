import assert from "node:assert/strict";
import test from "node:test";

import { pressCreationProcess } from "./processRegistry";
import { validatePressTopologyEdgeIds, validatePressTransitionCompatibility } from "./transitionCompatibility";

test("all five system transitions satisfy exact field and capability contracts", () => {
  assert.equal(pressCreationProcess.version, "3.0.0");
  assert.deepEqual(pressCreationProcess.edges.map((edge) => edge.id), ["initialization-brief", "brief-draft", "draft-review", "review-rewrite", "rewrite-review"]);
  for (const edge of pressCreationProcess.edges) assert.deepEqual(validatePressTransitionCompatibility(edge), { compatible: true });
});

test("compatible-looking but unregistered edges, self loops and forbidden targets fail closed", () => {
  assert.equal(validatePressTransitionCompatibility({ id: "invented", source: "selected-rewrite", target: "draft-review" }).compatible, false);
  assert.equal(validatePressTransitionCompatibility({ id: "rewrite-review", source: "draft-review", target: "draft-review" }).compatible, false);
  assert.equal(validatePressTransitionCompatibility({ id: "rewrite-review", source: "selected-rewrite", target: "article-initialization" }).compatible, false);
});

test("only the registered review/rewrite cycle is accepted", () => {
  assert.doesNotThrow(() => validatePressTopologyEdgeIds(pressCreationProcess.edges.map((edge) => edge.id)));
  assert.throws(() => validatePressTopologyEdgeIds(["rewrite-review", "rewrite-review"]), /DUPLICATE/);
  assert.throws(() => validatePressTopologyEdgeIds(["arbitrary"]), /NOT_REGISTERED/);
});
