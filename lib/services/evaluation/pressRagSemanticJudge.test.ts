import assert from "node:assert/strict";
import test from "node:test";

import { judgePressRagClaim } from "./pressRagSemanticJudge";

test("semantic judge executes at temperature zero and retains raw judgment and rationale", async () => {
  const judgment = await judgePressRagClaim({
    claimId: "claim-1",
    claim: "매출은 100억 원이다.",
    evidence: [{ sourceId: "source-1", quote: "매출은 100억 원" }],
    call: async (input) => {
      assert.deepEqual(Object.keys(input).sort(), ["claim", "evidence"]);
      return { label: "SUPPORTED", rationale: "Exact value", raw: { requestId: "recorded" } };
    },
  });
  assert.equal(judgment.temperature, 0);
  assert.equal(judgment.label, "SUPPORTED");
  assert.deepEqual(judgment.rawJudgment, { requestId: "recorded" });
});
