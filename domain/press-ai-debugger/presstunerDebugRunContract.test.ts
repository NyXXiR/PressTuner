import assert from "node:assert/strict";
import test from "node:test";

import { buildPressTunerDebugRunSnapshot, hashPressTunerDebugRunSnapshot, PRESSTUNER_DEBUG_RUN_V1_SCHEMA_VERSION, PRESSTUNER_DOMAIN_REQUIREMENTS, PRESSTUNER_PRESS_CREATION_WORKFLOW, PressTunerDebugRunSnapshotSchema, PressTunerDebugRunV1SnapshotSchema } from "./presstunerDebugRunContract";

const privateValues = ["PRIVATE_MEMO_SENTINEL", "PRIVATE_BRIEF_SENTINEL", "PRIVATE_ARTICLE_SENTINEL", "PRIVATE_PROMPT_SENTINEL", "PRIVATE_PROVIDER_SENTINEL", "team-private", "user-private"];
const hash = (letter: string) => letter.repeat(64);

function source() {
  const createdAt = new Date("2026-08-10T16:00:00.000Z");
  const observation = (guardrailId: string, verdict: "PASS" | "WARN" | "BLOCK" = "PASS") => ({ guardrailId, verdict, expected: privateValues[0], observed: privateValues[1], reason: privateValues[2], evidence: { raw: privateValues[3], provider: privateValues[4], teamId: privateValues[5], userId: privateValues[6] } });
  return {
    attempt: { id: "10000000-0000-4000-8000-000000000001", revision: 3, processId: "press-creation", processVersion: "2.0.0", registryHash: "fnv1a32:12345678", status: "INSPECTING" as const, activeNodeId: null, parentAttemptId: null, baselineAttemptId: null, createdAt, updatedAt: new Date("2026-08-10T16:01:00.000Z"), completedAt: null },
    checkpoints: [{ nodeId: "brief-normalization", mode: "EXECUTED" as const, createdAt }],
    steps: [{ toolName: "brief-normalization", status: "COMPLETED", startedAt: createdAt, completedAt: createdAt, errorCode: null }],
    transitions: [
      { edgeId: "initialization-brief", verdict: "PASS" as const, createdAt, advancedAt: createdAt, humanGateAcknowledgedAt: null, observations: [observation("article-team-ownership"), observation("fresh-press-release")] },
      { edgeId: "brief-draft", verdict: "WARN" as const, createdAt, advancedAt: null, humanGateAcknowledgedAt: null, observations: [observation("memo-brief-grounding", "WARN"), { guardrailId: "critical-fact-preservation", verdict: "WARN" as const, expected: privateValues[0], observed: privateValues[1], reason: privateValues[2], evidence: { checked: [
      { factKind: "NUMBER", factHash: hash("a"), matchStatus: "MATCHED", factValue: privateValues[3] },
      { factKind: "DATE", factHash: hash("b"), matchStatus: "MATCHED", providerPayload: privateValues[4] },
      { factKind: "QUOTE", factHash: hash("c"), matchStatus: "MISSING", teamId: privateValues[5] },
      { factKind: "CONSTRAINT", factHash: hash("d"), matchStatus: "MATCHED", userId: privateValues[6] },
    ], evidenceOverflow: 0, missingCount: 1 } }] },
      { edgeId: "draft-review", verdict: "BLOCK" as const, createdAt, advancedAt: null, humanGateAcknowledgedAt: null, observations: [observation("brief-draft-grounding", "BLOCK"), observation("press-structure", "BLOCK")] },
      { edgeId: "review-rewrite", verdict: "PASS" as const, createdAt, advancedAt: null, humanGateAcknowledgedAt: null, observations: [observation("review-note-selection"), observation("review-checkpoint-lineage")] },
    ],
  };
}

test("builds a deterministic strict content-free snapshot with all fact kinds", () => {
  const snapshot = buildPressTunerDebugRunSnapshot(source(), { environment: "qa", snapshotRevision: 1 });
  assert.equal(snapshot.schemaVersion, "presstuner-debug-run/v2");
  assert.deepEqual(snapshot.workflow, PRESSTUNER_PRESS_CREATION_WORKFLOW);
  assert.deepEqual(snapshot.domainObservations.requirements.map(({ requirementId, stageId, edgeId, display }) => ({ requirementId, stageId, edgeId, display })), PRESSTUNER_DOMAIN_REQUIREMENTS);
  const critical = snapshot.domainObservations.requirements.find((item) => item.requirementId === "critical-fact-preservation");
  assert.deepEqual(critical?.details?.counts.byKind, { NUMBER: { checked: 1, matched: 1, missing: 0 }, DATE: { checked: 1, matched: 1, missing: 0 }, QUOTE: { checked: 1, matched: 0, missing: 1 }, CONSTRAINT: { checked: 1, matched: 1, missing: 0 } });
  assert.deepEqual(critical?.details?.missingFactHashes, [`sha256:${hash("c")}`]);
  assert.equal(critical?.outcome.state, "EVALUATED");
  assert.equal(snapshot.domainObservations.requirements.find((item) => item.requirementId === "memo-brief-grounding")?.outcome.state, "EVALUATED");
  const serialized = JSON.stringify(snapshot);
  for (const sentinel of privateValues) assert.equal(serialized.includes(sentinel), false, sentinel);
  assert.equal(hashPressTunerDebugRunSnapshot(snapshot), hashPressTunerDebugRunSnapshot(buildPressTunerDebugRunSnapshot(source(), { environment: "qa", snapshotRevision: 99 })));
});

test("projects missing mandatory observations and unreached edges without Ops inference", () => {
  const input = source();
  input.transitions[2]!.observations = [];
  input.transitions.pop();
  const snapshot = buildPressTunerDebugRunSnapshot(input, { environment: "qa", snapshotRevision: 1 });
  expectState(snapshot, "press-structure", "NOT_EVALUABLE");
  expectState(snapshot, "review-note-selection", "NOT_REACHED");
  const notApplicable = structuredClone(snapshot);
  const item = notApplicable.domainObservations.requirements.find((row) => row.requirementId === "review-note-selection")!;
  item.outcome = { state: "NOT_APPLICABLE", reasonCode: "PRODUCER_DEFINED_INAPPLICABLE" };
  assert.equal(PressTunerDebugRunSnapshotSchema.parse(notApplicable).schemaVersion, "presstuner-debug-run/v2");
});

function expectState(snapshot: ReturnType<typeof buildPressTunerDebugRunSnapshot>, requirementId: string, state: string) {
  assert.equal(snapshot.domainObservations.requirements.find((item) => item.requirementId === requirementId)?.outcome.state, state);
}

test("rejects unknown data, custom evaluations, and dangling topology", () => {
  const snapshot = buildPressTunerDebugRunSnapshot(source(), { environment: "qa", snapshotRevision: 1 });
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse({ ...snapshot, prompt: "forbidden" }));
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse({ ...snapshot, domainObservations: { requirements: snapshot.domainObservations.requirements.slice(1) } }));
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse({ ...snapshot, workflow: { ...snapshot.workflow, id: "custom" } }));
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse({ ...snapshot, topology: { ...snapshot.topology, edges: [{ ...snapshot.topology.edges[0], sourceNodeId: "missing-node" }] } }));
});

test("keeps explicit v1 parsing for pending outbox payloads", () => {
  const current = buildPressTunerDebugRunSnapshot(source(), { environment: "qa", snapshotRevision: 7 });
  const { workflow: _workflow, domainObservations: _domain, ...execution } = current;
  void _workflow; void _domain;
  const v1 = { ...execution, schemaVersion: PRESSTUNER_DEBUG_RUN_V1_SCHEMA_VERSION, evaluations: [] };
  assert.equal(PressTunerDebugRunV1SnapshotSchema.parse(v1).schemaVersion, "presstuner-debug-run/v1");
  assert.equal(PressTunerDebugRunSnapshotSchema.parse(v1).schemaVersion, "presstuner-debug-run/v1");
  assert.equal(hashPressTunerDebugRunSnapshot(v1), hashPressTunerDebugRunSnapshot({ ...v1, snapshotRevision: 99 }));
});
