import assert from "node:assert/strict";
import test from "node:test";
import { buildProcessDefinitionV2 } from "@/domain/ai-process-console/v2/publication";
import { inspectProjectTestSnapshotV2, replayProjectTestTransitionV2 } from "./projectTestDebugService";

const original = buildProcessDefinitionV2();
const metadata = {
  projectId: "presstuner", environment: "conformance", serviceName: "presstuner", processId: "press-creation",
  processVersion: original.version, processDefinitionHash: original.canonicalSha256, scope: "ATTEMPT" as const,
  caseId: "case-1", objectType: "synthetic-press-fixture", operationId: "command-1", attemptId: "attempt-1",
  executionMode: "TEST" as const, testRunId: "test-run-1",
};
const transition = { kind: "TRANSITION" as const, transitionId: "brief-draft", transitionEvaluationId: "transition-occurrence-1", sourceNodeId: "brief-normalization", targetNodeId: "draft-generation" };
const snapshot = {
  schemaVersion: "1.0",
  nodes: [],
  transitions: [{
    transitionId: "brief-draft", sourceNodeId: "brief-normalization", targetNodeId: "draft-generation",
    sourceInput: { memoText: "2030년 1월 3곳에 공개" }, sourceOutput: { oneLiner: { value: "2030년 1월 3곳에 공개" } }, targetInput: { articleId: "article-1" },
    decision: { decisionRef: "presstuner:decision:brief-draft:3.0.0", matched: true },
    requirements: [{ requirementId: "memo-brief-grounding", requirementVersion: "1.0.0", verdict: "PASS", reasonCodes: [] }],
    context: { teamId: "original-team", articleId: "original-article", articleTeamId: "original-team", articleType: "PRESS_RELEASE" },
  }],
};

type ProjectTestDebugDatabase = NonNullable<NonNullable<Parameters<typeof inspectProjectTestSnapshotV2>[1]>["database"]>;

const database: ProjectTestDebugDatabase = {
  aiProcessTestRun: { findFirst: async () => ({ id: "receipt-1", debugSnapshot: snapshot }) },
  aiProcessFactOutbox: { findMany: async () => [{ payload: {
    specversion: "1.0", id: "event-transition-1", source: "urn:presstuner:ai-process-console:facts:v1", subject: "attempts/attempt-1",
    time: "2026-08-25T08:00:00.000Z", schemaVersion: "2.0", correlationId: metadata.caseId, sequence: 7,
    metadata, type: "dev.aiprocess.event.transition.evaluated.v2",
    data: {
      transitionEvaluationId: transition.transitionEvaluationId, transitionId: transition.transitionId,
      sourceNodeId: transition.sourceNodeId, targetNodeId: transition.targetNodeId,
      sourceNodeExecutionId: "source-execution-1", sourceNodeTerminalEventId: "source-terminal-1",
      decision: { componentId: "presstuner:decision:brief-draft", version: "3.0.0", sha256: "a".repeat(64) }, matched: true,
    },
    causationId: "source-terminal-1",
  } }] },
} as unknown as ProjectTestDebugDatabase;

test("v2 snapshot validates the complete retained tuple and exactly echoes metadata and private location", async () => {
  const response = await inspectProjectTestSnapshotV2({ schemaVersion: "2.0", requestId: "snapshot-1", metadata, location: transition }, { database, now: () => new Date("2026-08-25T08:00:00.000Z") });
  assert.equal(response.status, "AVAILABLE");
  if (response.status !== "AVAILABLE") return;
  assert.deepEqual(response.metadata, metadata);
  assert.deepEqual(response.location, transition);
  assert.equal(response.approval, "PROJECT_TEST_SAFE");
  assert.equal(response.replayReadiness?.state, "READY");
  assert.deepEqual(response.transitionContext?.priorNodeInput, snapshot.transitions[0].sourceInput);
  assert.deepEqual(response.transitionContext?.targetInput, snapshot.transitions[0].targetInput);
});

test("v2 snapshot independently rejects unsafe stored keys", async () => {
  const unsafe = structuredClone(snapshot);
  (unsafe.transitions[0] as { sourceOutput: Record<string, unknown> }).sourceOutput = { authorization: "secret" };
  const unsafeDatabase = {
    aiProcessTestRun: { findFirst: async () => ({ id: "receipt-1", debugSnapshot: unsafe }) },
    aiProcessFactOutbox: database.aiProcessFactOutbox,
  } as unknown as typeof database;
  const response = await inspectProjectTestSnapshotV2({ schemaVersion: "2.0", requestId: "snapshot-unsafe", metadata, location: transition }, { database: unsafeDatabase });
  assert.deepEqual(response, { schemaVersion: "2.0", requestId: "snapshot-unsafe", status: "UNAVAILABLE", reasonCode: "SNAPSHOT_NOT_SAFE" });
});

test("v2 snapshot rejects a retained snapshot when the exact delivered occurrence fact is absent", async () => {
  const missingOccurrence = {
    aiProcessTestRun: database.aiProcessTestRun,
    aiProcessFactOutbox: { findMany: async () => [] },
  } as unknown as typeof database;
  const response = await inspectProjectTestSnapshotV2({ schemaVersion: "2.0", requestId: "snapshot-no-occurrence", metadata, location: transition }, { database: missingOccurrence });
  assert.deepEqual(response, { schemaVersion: "2.0", requestId: "snapshot-no-occurrence", status: "UNAVAILABLE", reasonCode: "SNAPSHOT_NOT_FOUND" });
});

test("isolated replay creates fresh lineage, invokes cleanup, and does not expose original workspace identity", async () => {
  const cleaned: unknown[] = [];
  let sequence = 0;
  const response = await replayProjectTestTransitionV2({ schemaVersion: "2.0", requestId: "replay-1", metadata, transition, candidateInput: { articleId: "candidate", confirmedBrief: "2030년 1월 3곳에 공개" } }, {
    database,
    createWorkspace: async () => ({ teamId: "synthetic-team", userId: "synthetic-user" }),
    cleanupWorkspace: async (workspace) => { cleaned.push(workspace); },
    createId: () => `id-${++sequence}`,
  });
  assert.equal(response.status, "COMPLETED");
  if (response.status !== "COMPLETED") return;
  assert.equal(response.replayOfAttemptId, metadata.attemptId);
  assert.equal(response.replayAttemptId, response.metadata.attemptId);
  assert.notEqual(response.replayAttemptId, metadata.attemptId);
  assert.equal(response.metadata.testRunId, metadata.testRunId);
  assert.equal(response.metadata.processDefinitionHash, metadata.processDefinitionHash);
  assert.deepEqual(response.transition, transition);
  assert.equal(response.approval, "PROJECT_TEST_SAFE");
  assert.equal(cleaned.length, 1);
  assert.doesNotMatch(JSON.stringify(response), /original-team|original-article/u);
});

test("replay independently rejects oversized and forbidden candidates before database or workspace access", async () => {
  let workspaceCalled = false;
  const createWorkspace = async () => { workspaceCalled = true; return { teamId: "synthetic-team", userId: "synthetic-user" }; };
  for (const candidateInput of [{ authorization: "secret" }, { callbackUrl: "https://private.invalid" }, { value: "x".repeat(32_769) }]) {
    const response = await replayProjectTestTransitionV2({ schemaVersion: "2.0", requestId: "replay-invalid", metadata, transition, candidateInput }, { database, createWorkspace });
    assert.equal(response.status, "REJECTED");
  }
  assert.equal(workspaceCalled, false);
});

test("cleanup runs in finally when guardrail evaluation fails", async () => {
  let cleaned = false;
  const brokenWorkspace = Object.defineProperty({ userId: "synthetic-user" }, "teamId", { enumerable: true, get() { throw new Error("workspace unavailable"); } });
  const response = await replayProjectTestTransitionV2({ schemaVersion: "2.0", requestId: "replay-failure", metadata, transition, candidateInput: {} }, {
    database, createWorkspace: async () => brokenWorkspace as { teamId: string; userId: string }, cleanupWorkspace: async () => { cleaned = true; },
  });
  assert.equal(response.status, "REJECTED");
  assert.equal(cleaned, true);
});
