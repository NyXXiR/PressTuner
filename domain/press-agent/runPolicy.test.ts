import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPressAgentArticleVersion,
  assertAppliedDraftMatchesVerified,
  assertFinalSourceIds,
  buildAgentStepIdempotencyKey,
  buildAgentMutationIdempotencyKey,
  readPressAgentArticleVersion,
  PRESS_AGENT_TOOLS,
  restorePressAgentCheckpoint,
  hashVerifiedAgentDraft,
  transitionPressAgentRun,
} from "./runPolicy";

test("article approval preserves its starting version and rejects a stale article", () => {
  const expected = "2026-07-23T01:00:00.000Z";
  assert.equal(readPressAgentArticleVersion({ articleUpdatedAt: expected }), expected);
  assert.throws(
    () =>
      assertPressAgentArticleVersion(
        expected,
        new Date("2026-07-23T01:00:01.000Z"),
      ),
    /PRESS_AGENT_ARTICLE_VERSION_CONFLICT/,
  );
});

test("final sources must be a subset of retrieved FACT sources", () => {
  assert.deepEqual(
    assertFinalSourceIds(["source-2"], ["source-1", "source-2"]),
    ["source-2"],
  );
  assert.throws(
    () => assertFinalSourceIds(["style-source"], ["source-1"]),
    /PRESS_AGENT_FINAL_SOURCE_INVALID/,
  );
});

test("apply requires the exact verified title, body, and source ordering", () => {
  const draft = {
    title: "Verified",
    body: "Exact body",
    sourceIds: ["source-1"],
  };
  const verifiedHash = hashVerifiedAgentDraft(draft);
  assert.doesNotThrow(() =>
    assertAppliedDraftMatchesVerified(verifiedHash, draft),
  );
  assert.throws(
    () =>
      assertAppliedDraftMatchesVerified(verifiedHash, {
        ...draft,
        body: "Changed body",
      }),
    /PRESS_AGENT_VERIFIED_DRAFT_MISMATCH/,
  );
});

test("the single Press Agent exposes explicit tools and gates consequential effects", () => {
  assert.deepEqual(
    PRESS_AGENT_TOOLS.map(({ name }) => name),
    [
      "search_knowledge",
      "compare_sources",
      "draft_press_release",
      "verify_claims",
      "apply_press_release",
    ],
  );
  assert.equal(
    PRESS_AGENT_TOOLS.find(({ name }) => name === "apply_press_release")
      ?.requiresApproval,
    true,
  );
  assert.ok(
    PRESS_AGENT_TOOLS.filter(({ requiresApproval }) => !requiresApproval).every(
      ({ effect }) => effect === "READ",
    ),
  );
  assert.equal(
    PRESS_AGENT_TOOLS.find(({ name }) => name === "search_knowledge")
      ?.schemaVersion,
    "v2-role-scoped",
  );
});

test("approval interrupts and resumes a run without completing the effect early", () => {
  const running = transitionPressAgentRun(
    { status: "PENDING", retryCount: 0 },
    { type: "START" },
  );
  const interrupted = transitionPressAgentRun(running, {
    type: "APPROVAL_REQUIRED",
  });
  assert.equal(interrupted.status, "WAITING_APPROVAL");

  const resumed = transitionPressAgentRun(interrupted, {
    type: "APPROVED",
  });
  assert.equal(resumed.status, "RUNNING");
  assert.throws(
    () => transitionPressAgentRun(running, { type: "APPROVED" }),
    /PRESS_AGENT_ILLEGAL_TRANSITION/,
  );
});

test("failed steps resume with an incremented retry count", () => {
  const failed = transitionPressAgentRun(
    { status: "RUNNING", retryCount: 1 },
    { type: "FAIL" },
  );
  assert.equal(failed.status, "FAILED");
  assert.deepEqual(transitionPressAgentRun(failed, { type: "RETRY" }), {
    status: "RUNNING",
    retryCount: 2,
  });
});

test("persisted checkpoints enforce team, run, and agent version identity", () => {
  const checkpoint = JSON.stringify({
    runId: "run-1",
    teamId: "team-1",
    agentVersion: "press-agent-v1",
    sdkState: "serialized-state",
  });
  assert.equal(
    restorePressAgentCheckpoint(checkpoint, {
      runId: "run-1",
      teamId: "team-1",
      agentVersion: "press-agent-v1",
    }).sdkState,
    "serialized-state",
  );
  assert.throws(
    () =>
      restorePressAgentCheckpoint(checkpoint, {
        runId: "run-1",
        teamId: "team-2",
        agentVersion: "press-agent-v1",
      }),
    /PRESS_AGENT_CHECKPOINT_MISMATCH/,
  );
});

test("step idempotency keys remain stable across retries", () => {
  assert.equal(
    buildAgentStepIdempotencyKey({
      runId: "run-1",
      sequence: 3,
      toolName: "verify_claims",
    }),
    buildAgentStepIdempotencyKey({
      runId: "run-1",
      sequence: 3,
      toolName: "verify_claims",
    }),
  );
});

test("write idempotency is independent of retry sequence", () => {
  const input = { articleId: "article-1", verifiedDraftHash: "hash" };
  assert.equal(
    buildAgentMutationIdempotencyKey({ runId: "run-1", toolName: "apply_press_release", mutationIdentity: input }),
    buildAgentMutationIdempotencyKey({ runId: "run-1", toolName: "apply_press_release", mutationIdentity: input }),
  );
});

test("cancellation is explicit and terminal", () => {
  const requested = transitionPressAgentRun(
    { status: "RUNNING", retryCount: 0 },
    { type: "CANCEL_REQUEST" },
  );
  assert.equal(requested.status, "CANCEL_REQUESTED");
  assert.equal(
    transitionPressAgentRun(requested, { type: "CANCEL" }).status,
    "CANCELED",
  );
  assert.throws(
    () => transitionPressAgentRun({ status: "COMPLETED", retryCount: 0 }, { type: "CANCEL_REQUEST" }),
    /ILLEGAL_TRANSITION/,
  );
  assert.throws(
    () => transitionPressAgentRun({ status: "CANCELED", retryCount: 0 }, { type: "RETRY" }),
    /ILLEGAL_TRANSITION/,
  );
});
