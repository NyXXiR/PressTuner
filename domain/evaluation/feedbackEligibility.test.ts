import assert from "node:assert/strict";
import test from "node:test";

import { evaluateFeedbackEligibility } from "./feedbackEligibility";

test("excludes consent, secret, cross-team, and non-terminal candidates", () => {
  const result = evaluateFeedbackEligibility({
    sourceTeamId: "other",
    targetTeamId: "team",
    terminal: false,
    consent: false,
    eligibleForEvaluation: true,
    containsProhibitedData: true,
    sourceKind: "runtime_failure",
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.reasons, [
    "CROSS_TEAM_SOURCE",
    "NON_TERMINAL_TRACE",
    "CONSENT_REQUIRED",
    "PROHIBITED_DATA",
  ]);
});
