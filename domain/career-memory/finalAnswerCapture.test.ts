import assert from "node:assert/strict";
import test from "node:test";

import { normalizeFinalAnswerCaptureItems } from "./finalAnswerCapture";

test("final-answer capture keeps multiple supported proposals and removes exact duplicates", () => {
  const answer = "At Apollo I launched A. At Borealis I launched B.";
  const items = normalizeFinalAnswerCaptureItems(answer, [
    {
      mode: "CREATE",
      title: "Apollo launch",
      content: "Launched A",
      evidence: [{ fieldPath: "summary", excerpt: "At Apollo I launched A." }],
    },
    {
      mode: "CREATE",
      title: "Apollo launch",
      content: "Launched A",
      evidence: [{ fieldPath: "summary", excerpt: "At Apollo I launched A." }],
    },
    {
      mode: "AUGMENT",
      targetExperienceId: "existing-b",
      title: "Borealis launch",
      content: "Launched B",
      evidence: [{ fieldPath: "summary", excerpt: "At Borealis I launched B." }],
    },
    {
      mode: "CREATE",
      title: "Invented",
      content: "Not in the answer",
      evidence: [{ fieldPath: "summary", excerpt: "Invented evidence" }],
    },
  ]);

  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.mode), ["CREATE", "AUGMENT"]);
  assert.equal(items[1]?.targetExperienceId, "existing-b");
  assert.match(items[0]?.finalAnswerDedupeKey ?? "", /^[a-f0-9]{64}$/);
});
