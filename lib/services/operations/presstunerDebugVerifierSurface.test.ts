import assert from "node:assert/strict";
import test from "node:test";

import { buildPressTunerDebugRunSnapshot } from "../../../domain/press-ai-debugger/presstunerDebugRunContract";
import { OPS_AI_OPERATIONS_ROUTE, verifyStoredSnapshot } from "../../../scripts/verifyPresstunerDebugIntegration";

const date = new Date("2026-08-11T00:00:00.000Z");
const snapshot = buildPressTunerDebugRunSnapshot({
  attempt: {
    id: "10000000-0000-4000-8000-000000000001",
    revision: 0,
    processId: "press-creation",
    processVersion: "2.0.0",
    registryHash: "fnv1a32:12345678",
    status: "ACTIVE",
    activeNodeId: "article-initialization",
    parentAttemptId: null,
    baselineAttemptId: null,
    createdAt: date,
    updatedAt: date,
    completedAt: null,
  },
  checkpoints: [],
  transitions: [],
}, { environment: "qa", snapshotRevision: 1 });
const critical = snapshot.domainObservations.requirements.find((item) => item.requirementId === "critical-fact-preservation")!;
critical.outcome = { state: "EVALUATED", verdict: "PASS", evaluatedAt: date.toISOString() };
critical.details = {
  kind: "CRITICAL_FACT_PRESERVATION",
  counts: {
    checked: 0,
    matched: 0,
    missing: 0,
    overflow: 0,
    byKind: {
      NUMBER: { checked: 0, matched: 0, missing: 0 },
      DATE: { checked: 0, matched: 0, missing: 0 },
      QUOTE: { checked: 0, matched: 0, missing: 0 },
      CONSTRAINT: { checked: 0, matched: 0, missing: 0 },
    },
  },
  missingFactHashes: [],
};

test("verifier uses the authenticated Ops route and returns aggregate contract/privacy evidence only", () => {
  assert.equal(OPS_AI_OPERATIONS_ROUTE, "/ops/ai-operations");
  const result = verifyStoredSnapshot(snapshot, ["PRIVATE_MEMO", "team-private", "user-private"]);
  assert.deepEqual(result, {
    ok: true,
    schemaVersion: "presstuner-debug-run/v3",
    requirementCount: 8,
    canonicalScope: true,
    route: "/ops/ai-operations",
    privacy: "passed",
  });
  assert.doesNotMatch(JSON.stringify(result), /10000000|attemptId|team|user|memo|snapshot|pressUrl|opsUrl/i);
});

test("verifier parses the strict snapshot union and requires v3 for a newly created run", () => {
  assert.throws(() => verifyStoredSnapshot({ ...snapshot, prompt: "forbidden" }, []), /OPS_SNAPSHOT_CONTRACT_INVALID/);
  const v2 = {
    ...snapshot,
    schemaVersion: "presstuner-debug-run/v2",
    domainObservations: {
      requirements: snapshot.domainObservations.requirements.map((item) => ({
        requirementId: item.requirementId,
        stageId: item.stageId,
        edgeId: item.edgeId,
        display: item.display,
        outcome: item.outcome,
        details: item.details,
      })),
    },
  };
  assert.throws(() => verifyStoredSnapshot(v2, []), /OPS_SNAPSHOT_V3_REQUIRED/);
});
