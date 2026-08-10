import assert from "node:assert/strict";
import test from "node:test";

import { buildPressTunerDebugRunSnapshot, hashPressTunerDebugRunSnapshot, PressTunerDebugRunSnapshotSchema } from "./presstunerDebugRunContract";

const privateValues = ["PRIVATE_MEMO_SENTINEL", "PRIVATE_BRIEF_SENTINEL", "PRIVATE_ARTICLE_SENTINEL", "PRIVATE_PROMPT_SENTINEL", "PRIVATE_PROVIDER_SENTINEL", "team-private", "user-private"];
const hash = (letter: string) => letter.repeat(64);

function source() {
  const createdAt = new Date("2026-08-10T16:00:00.000Z");
  return {
    attempt: { id: "10000000-0000-4000-8000-000000000001", revision: 3, processId: "press-creation", processVersion: "2.0.0", registryHash: "fnv1a32:12345678", status: "INSPECTING" as const, activeNodeId: null, parentAttemptId: null, baselineAttemptId: null, createdAt, updatedAt: new Date("2026-08-10T16:01:00.000Z"), completedAt: null },
    checkpoints: [{ nodeId: "brief-normalization", mode: "EXECUTED" as const, createdAt }],
    steps: [{ toolName: "brief-normalization", status: "COMPLETED", startedAt: createdAt, completedAt: createdAt, errorCode: null }],
    transitions: [{ edgeId: "brief-draft", verdict: "WARN" as const, createdAt, advancedAt: null, humanGateAcknowledgedAt: null, observations: [{ guardrailId: "critical-fact-preservation", verdict: "WARN" as const, expected: privateValues[0], observed: privateValues[1], reason: privateValues[2], evidence: { checked: [
      { factKind: "NUMBER", factHash: hash("a"), matchStatus: "MATCHED", factValue: privateValues[3] },
      { factKind: "DATE", factHash: hash("b"), matchStatus: "MATCHED", providerPayload: privateValues[4] },
      { factKind: "QUOTE", factHash: hash("c"), matchStatus: "MISSING", teamId: privateValues[5] },
      { factKind: "CONSTRAINT", factHash: hash("d"), matchStatus: "MATCHED", userId: privateValues[6] },
    ], evidenceOverflow: 0, missingCount: 1 } }] }],
  };
}

test("builds a deterministic strict content-free snapshot with all fact kinds", () => {
  const snapshot = buildPressTunerDebugRunSnapshot(source(), { environment: "qa", snapshotRevision: 1 });
  assert.deepEqual(snapshot.evaluations[0]?.counts.byKind, { NUMBER: { checked: 1, matched: 1, missing: 0 }, DATE: { checked: 1, matched: 1, missing: 0 }, QUOTE: { checked: 1, matched: 0, missing: 1 }, CONSTRAINT: { checked: 1, matched: 1, missing: 0 } });
  assert.deepEqual(snapshot.evaluations[0]?.missingFactHashes, [`sha256:${hash("c")}`]);
  const serialized = JSON.stringify(snapshot);
  for (const sentinel of privateValues) assert.equal(serialized.includes(sentinel), false, sentinel);
  assert.equal(hashPressTunerDebugRunSnapshot(snapshot), hashPressTunerDebugRunSnapshot(buildPressTunerDebugRunSnapshot(source(), { environment: "qa", snapshotRevision: 99 })));
});

test("rejects unknown data, custom evaluations, and dangling topology", () => {
  const snapshot = buildPressTunerDebugRunSnapshot(source(), { environment: "qa", snapshotRevision: 1 });
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse({ ...snapshot, prompt: "forbidden" }));
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse({ ...snapshot, evaluations: [{ ...snapshot.evaluations[0], id: "custom-evaluator" }] }));
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse({ ...snapshot, topology: { ...snapshot.topology, edges: [{ ...snapshot.topology.edges[0], sourceNodeId: "missing-node" }] } }));
});
