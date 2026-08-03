import assert from "node:assert/strict";
import test from "node:test";

import { projectCareerRegistrationReadiness } from "./registrationReadiness";

const empty = {
  confirmedExperienceCount: 0,
  trustedFactCount: 0,
  pendingCandidateCount: 0,
  processingSourceCount: 0,
  failedSourceCount: 0,
};

test("career registration readiness follows the user-visible lifecycle", () => {
  assert.deepEqual(
    projectCareerRegistrationReadiness({ ...empty, processingSourceCount: 1 }),
    {
      registrationStatus: "PROCESSING",
      nextAction: { type: "wait_for_processing" },
    },
  );
  assert.deepEqual(
    projectCareerRegistrationReadiness({
      ...empty,
      pendingCandidateCount: 2,
      confirmedExperienceCount: 1,
      trustedFactCount: 3,
    }),
    {
      registrationStatus: "REVIEW_REQUIRED",
      nextAction: { type: "review_candidates" },
    },
  );
  assert.deepEqual(
    projectCareerRegistrationReadiness({
      ...empty,
      confirmedExperienceCount: 1,
      trustedFactCount: 1,
    }),
    {
      registrationStatus: "READY",
      nextAction: { type: "start_application" },
    },
  );
  assert.deepEqual(projectCareerRegistrationReadiness(empty), {
    registrationStatus: "EMPTY",
    nextAction: { type: "add_career_memory" },
  });
  assert.deepEqual(
    projectCareerRegistrationReadiness({ ...empty, failedSourceCount: 1 }),
    {
      registrationStatus: "FAILED",
      nextAction: { type: "retry_source" },
    },
  );
});

test("all candidates must be decided before registration becomes READY", () => {
  const readiness = projectCareerRegistrationReadiness({
    ...empty,
    confirmedExperienceCount: 4,
    trustedFactCount: 20,
    pendingCandidateCount: 1,
  });
  assert.equal(readiness.registrationStatus, "REVIEW_REQUIRED");
});
