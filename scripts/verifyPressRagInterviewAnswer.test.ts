import assert from "node:assert/strict";
import test from "node:test";

import { verifyPressRagInterviewAnswer } from "./verifyPressRagInterviewAnswer";

test("checked answer regenerates entirely from stable non-continuity inputs", async () => {
  assert.deepEqual(
    await verifyPressRagInterviewAnswer({
      datasetPath: "evals/press-rag/controlled-live/dataset-v4.approved.json",
      cyclePath:
        "evals/press-rag/controlled-live/results/controlled-live-cycle-v3-optimized.json",
    }),
    { status: "INTERVIEW_FINAL" },
  );
});
