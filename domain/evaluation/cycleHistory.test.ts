import assert from "node:assert/strict";
import test from "node:test";

import { parseCycleHistory } from "./cycleHistory";

const hash = "a".repeat(64);

test("cycle two references cycle one's regression dataset without mutating history", () => {
  const input = [
    { cycleId: "cycle-001", sequence: 1, createdAt: "2026-08-03T00:00:00Z", datasetId: "dataset-v3", regressionDatasetFromCycleId: null, configurationDiff: {}, disposition: "REJECT", artifactHash: hash },
    { cycleId: "cycle-002", sequence: 2, createdAt: "2026-08-03T01:00:00Z", datasetId: "dataset-v3.1", regressionDatasetFromCycleId: "cycle-001", configurationDiff: { prompt: { from: "v1", to: "v2" } }, disposition: "PROMOTE", artifactHash: hash },
  ];
  const before = structuredClone(input[0]);
  const parsed = parseCycleHistory(input);
  assert.deepEqual(parsed[0], before);
  assert.equal(parsed[1].regressionDatasetFromCycleId, "cycle-001");
  assert.throws(() => parseCycleHistory([input[1]]), /SEQUENCE_INVALID|PARENT_UNKNOWN/);
});
