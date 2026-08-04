import assert from "node:assert/strict";
import test from "node:test";

import { buildJudgeCalibrationArtifact } from "./judgeCalibrationArtifact";

function records(count = 30) {
  return Array.from({ length: count }, (_, index) => ({
    claimId: `claim-${index}`,
    blinded: true as const,
    humanLabel: index < 15 ? ("SUPPORTED" as const) : ("UNSUPPORTED" as const),
    judgeLabel: index < 15 ? ("SUPPORTED" as const) : ("UNSUPPORTED" as const),
    rawJudgment: { label: index < 15 ? "SUPPORTED" : "UNSUPPORTED" },
    rationale: "Independent blinded review",
    reviewer: { type: "HUMAN" as const, id: "reviewer-1" },
    costMicros: 10,
  }));
}

test("calibration requires 30 balanced blinded human labels and retains audit hashes", () => {
  const artifact = buildJudgeCalibrationArtifact({
    model: "gpt-4.1-mini",
    temperature: 0,
    prompt: "judge prompt",
    schema: { type: "object" },
    records: records(),
  });
  assert.equal(artifact.status, "PASS");
  assert.equal(artifact.agreement, 1);
  assert.equal(artifact.falseSupportedRate, 0);
  assert.equal(artifact.totalCostMicros, 300);
  assert.match(artifact.promptHash, /^[a-f0-9]{64}$/);
  assert.match(artifact.schemaHash, /^[a-f0-9]{64}$/);
});

test("calibration fails closed for small, imbalanced, or false-supported samples", () => {
  assert.equal(buildJudgeCalibrationArtifact({
    model: "gpt-4.1-mini", temperature: 0, prompt: "p", schema: {}, records: records(20),
  }).status, "FAIL");
  const falseSupported = records();
  for (let index = 15; index < 20; index += 1) falseSupported[index] = { ...falseSupported[index]!, judgeLabel: "SUPPORTED" };
  const artifact = buildJudgeCalibrationArtifact({
    model: "gpt-4.1-mini", temperature: 0, prompt: "p", schema: {}, records: falseSupported,
  });
  assert.equal(artifact.status, "FAIL");
  assert.ok(artifact.insufficiencyReasons.includes("FALSE_SUPPORTED_RATE_ABOVE_GATE"));
});
