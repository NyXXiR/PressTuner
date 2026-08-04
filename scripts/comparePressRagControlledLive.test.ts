import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseComparisonDataset } from "./comparePressRagControlledLive";

test("comparison CLI parses the approved JSON payload before domain validation", () => {
  const raw = readFileSync(
    "evals/press-rag/controlled-live/dataset-v4.approved.json",
    "utf8",
  );

  const dataset = parseComparisonDataset(raw);

  assert.equal(dataset.status, "APPROVED");
  assert.equal(dataset.cases.length, 40);
});
