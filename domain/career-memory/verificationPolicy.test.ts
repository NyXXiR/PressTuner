import assert from "node:assert/strict";
import test from "node:test";

import {
  computeCareerVerificationResult,
  normalizeCareerFindingSupport,
  isCareerOverrideCurrent,
  isCareerVerificationCurrent,
} from "./verificationPolicy";

test("deterministic verification blocks risky unsupported or contradictory claims", () => {
  assert.equal(computeCareerVerificationResult([]), "PASS");
  assert.equal(
    computeCareerVerificationResult([
      { type: "SUPPORTED", riskCategory: "NUMBER" },
    ]),
    "PASS",
  );
  assert.equal(
    computeCareerVerificationResult([
      { type: "UNSUPPORTED", riskCategory: "OTHER" },
    ]),
    "WARN",
  );
  assert.equal(
    computeCareerVerificationResult([
      { type: "UNSUPPORTED", riskCategory: "NUMBER" },
    ]),
    "BLOCK",
  );
  assert.equal(
    computeCareerVerificationResult([
      { type: "CONTRADICTION", riskCategory: "TITLE" },
    ]),
    "BLOCK",
  );
});

test("high-risk support accepts approved narrative facts that contain the exact claim", () => {
  const facts = [
    { id: "summary", kind: "SUMMARY" },
    { id: "action", kind: "ACTION" },
    { id: "outcome", kind: "OUTCOME" },
    { id: "metric", kind: "METRIC" },
    { id: "organization", kind: "ORGANIZATION" },
  ];
  assert.deepEqual(
    normalizeCareerFindingSupport(
      {
        type: "SUPPORTED",
        riskCategory: "NUMBER",
        supportingFactIds: ["summary"],
      },
      facts,
    ),
    {
      type: "SUPPORTED",
      riskCategory: "NUMBER",
      supportingFactIds: ["summary"],
    },
  );
  assert.deepEqual(
    normalizeCareerFindingSupport(
      {
        type: "SUPPORTED",
        riskCategory: "NUMBER",
        supportingFactIds: ["action", "outcome", "metric"],
      },
      facts,
    ),
    {
      type: "SUPPORTED",
      riskCategory: "NUMBER",
      supportingFactIds: ["action", "outcome", "metric"],
    },
  );
  assert.deepEqual(
    normalizeCareerFindingSupport(
      {
        type: "UNSUPPORTED",
        riskCategory: "OTHER",
        supportingFactIds: [],
      },
      facts,
    ),
    {
      type: "UNSUPPORTED",
      riskCategory: "OTHER",
      supportingFactIds: [],
    },
  );
});

test("verification and override require exact hash, revision, owner, and memory version", () => {
  const current = {
    userId: "user-a",
    answerHash: "hash",
    answerRevision: 3,
    careerMemoryVersion: 7,
  };
  const verification = { ...current, id: "verification-1", result: "BLOCK" as const };
  assert.equal(isCareerVerificationCurrent(verification, current), true);
  assert.equal(
    isCareerVerificationCurrent(
      verification,
      { ...current, answerRevision: 5, answerHash: "hash" },
    ),
    false,
  );
  assert.equal(
    isCareerOverrideCurrent(
      {
        userId: "user-a",
        answerHash: "hash",
        answerRevision: 3,
        verificationId: "verification-1",
        reason: "Reviewed manually",
      },
      verification,
      current,
    ),
    true,
  );
  assert.equal(
    isCareerOverrideCurrent(
      {
        userId: "user-b",
        answerHash: "hash",
        answerRevision: 3,
        verificationId: "verification-1",
        reason: "Reviewed manually",
      },
      verification,
      current,
    ),
    false,
  );
});
