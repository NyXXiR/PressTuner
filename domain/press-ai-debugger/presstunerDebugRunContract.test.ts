import assert from "node:assert/strict";
import test from "node:test";

import { buildPressTunerDebugRunSnapshot, hashPressTunerDebugRunSnapshot, PRESSTUNER_DEBUG_RUN_V1_SCHEMA_VERSION, PRESSTUNER_DEBUG_RUN_V2_SCHEMA_VERSION, PRESSTUNER_DEBUG_RUN_V3_SCHEMA_VERSION, PRESSTUNER_DOMAIN_REQUIREMENTS, PRESSTUNER_LEGACY_DOMAIN_REQUIREMENTS, PRESSTUNER_LEGACY_PRESS_CREATION_WORKFLOW, PRESSTUNER_LEGACY_REQUIREMENT_SCOPE, PRESSTUNER_PRESS_CREATION_WORKFLOW, PRESSTUNER_REQUIREMENT_SCOPE, PressTunerDebugRunSnapshotSchema, PressTunerDebugRunV1SnapshotSchema, PressTunerDebugRunV2SnapshotSchema, PressTunerDebugRunV3SnapshotSchema } from "./presstunerDebugRunContract";

const privateValues = ["PRIVATE_MEMO_SENTINEL", "PRIVATE_BRIEF_SENTINEL", "PRIVATE_ARTICLE_SENTINEL", "PRIVATE_PROMPT_SENTINEL", "PRIVATE_PROVIDER_SENTINEL", "team-private", "user-private"];
const hash = (letter: string) => letter.repeat(64);

function source() {
  const createdAt = new Date("2026-08-10T16:00:00.000Z");
  const observation = (guardrailId: string, verdict: "PASS" | "WARN" | "BLOCK" = "PASS") => ({ guardrailId, verdict, expected: privateValues[0], observed: privateValues[1], reason: privateValues[2], evidence: { raw: privateValues[3], provider: privateValues[4], teamId: privateValues[5], userId: privateValues[6] } });
  return {
    attempt: { id: "10000000-0000-4000-8000-000000000001", revision: 3, processId: "press-creation", processVersion: "2.1.0", registryHash: "fnv1a32:12345678", status: "INSPECTING" as const, activeNodeId: null, parentAttemptId: null, baselineAttemptId: null, createdAt, updatedAt: new Date("2026-08-10T16:01:00.000Z"), completedAt: null },
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
      { edgeId: "draft-review", verdict: "BLOCK" as const, createdAt, advancedAt: null, humanGateAcknowledgedAt: null, observations: [observation("brief-draft-grounding", "BLOCK"), observation("press-structure", "BLOCK"), { guardrailId: "evidence-fact-consistency", verdict: "BLOCK" as const, evidence: { kind: "EVIDENCE_FACT_CONSISTENCY", counts: { checked: 1, matched: 0, draftConflict: 1, sourceConflict: 0, notEvaluable: 0 }, riskCategoryCounts: { NUMBER: 1, PERIOD: 0, DATE: 0, PERSON: 0, TITLE: 0, DIRECT_QUOTE: 0, OTHER: 0 }, documentRefs: [`sha256:${hash("a")}`], factRefs: [`sha256:${hash("b")}`], claimRefs: [`sha256:${hash("c")}`] } }] },
      { edgeId: "review-rewrite", verdict: "PASS" as const, createdAt, advancedAt: null, humanGateAcknowledgedAt: null, observations: [observation("review-note-selection"), observation("review-checkpoint-lineage")] },
    ],
  };
}

test("builds a deterministic strict content-free snapshot with all fact kinds", () => {
  const snapshot = buildPressTunerDebugRunSnapshot(source(), { environment: "qa", snapshotRevision: 1 });
  assert.equal(snapshot.schemaVersion, "presstuner-debug-run/v4");
  assert.deepEqual(snapshot.workflow, PRESSTUNER_PRESS_CREATION_WORKFLOW);
  assert.deepEqual(snapshot.domainObservations.requirements.map(({ requirementId, stageId, edgeId, display, scope }) => ({ requirementId, stageId, edgeId, display, scope })), PRESSTUNER_DOMAIN_REQUIREMENTS.map((item) => ({ ...item, scope: PRESSTUNER_REQUIREMENT_SCOPE })));
  assert.equal(snapshot.domainObservations.requirements.length, 9);
  const critical = snapshot.domainObservations.requirements.find((item) => item.requirementId === "critical-fact-preservation");
  assert.equal(critical?.details?.kind, "CRITICAL_FACT_PRESERVATION");
  const criticalDetails = critical?.details?.kind === "CRITICAL_FACT_PRESERVATION" ? critical.details : null;
  assert.deepEqual(criticalDetails?.counts.byKind, { NUMBER: { checked: 1, matched: 1, missing: 0 }, DATE: { checked: 1, matched: 1, missing: 0 }, QUOTE: { checked: 1, matched: 0, missing: 1 }, CONSTRAINT: { checked: 1, matched: 1, missing: 0 } });
  assert.deepEqual(criticalDetails?.missingFactHashes, [`sha256:${hash("c")}`]);
  assert.equal(critical?.outcome.state, "EVALUATED");
  assert.equal(snapshot.domainObservations.requirements.find((item) => item.requirementId === "memo-brief-grounding")?.outcome.state, "EVALUATED");
  assert.equal(snapshot.domainObservations.requirements.find((item) => item.requirementId === "evidence-fact-consistency")?.details?.kind, "EVIDENCE_FACT_CONSISTENCY");
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
  expectState(snapshot, "evidence-fact-consistency", "NOT_EVALUABLE");
  expectState(snapshot, "review-note-selection", "NOT_REACHED");
  const notApplicable = structuredClone(snapshot);
  const item = notApplicable.domainObservations.requirements.find((row) => row.requirementId === "review-note-selection")!;
  item.outcome = { state: "NOT_APPLICABLE", reasonCode: "PRODUCER_DEFINED_INAPPLICABLE" };
  assert.equal(PressTunerDebugRunSnapshotSchema.parse(notApplicable).schemaVersion, "presstuner-debug-run/v4");
});

function expectState(snapshot: ReturnType<typeof buildPressTunerDebugRunSnapshot>, requirementId: string, state: string) {
  assert.equal(snapshot.domainObservations.requirements.find((item) => item.requirementId === requirementId)?.outcome.state, state);
}

test("v4 rejects unsafe data and dangling topology while accepting future scoped IDs", () => {
  const snapshot = buildPressTunerDebugRunSnapshot(source(), { environment: "qa", snapshotRevision: 1 });
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse({ ...snapshot, prompt: "forbidden" }));
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse({ ...snapshot, workflow: { ...snapshot.workflow, id: "custom" } }));
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse({ ...snapshot, topology: { ...snapshot.topology, edges: [{ ...snapshot.topology.edges[0], sourceNodeId: "missing-node" }] } }));
  for (const mutate of [
    (value: typeof snapshot) => { value.domainObservations.requirements[0]!.scope = { ...PRESSTUNER_REQUIREMENT_SCOPE, kind: "STANDARD" as "WORKFLOW" }; },
    (value: typeof snapshot) => { value.domainObservations.requirements[0]!.scope = { ...PRESSTUNER_REQUIREMENT_SCOPE, workflowId: "spoofed" as typeof PRESSTUNER_REQUIREMENT_SCOPE.workflowId }; },
    (value: typeof snapshot) => { value.domainObservations.requirements[0]!.stageId = "spoofed"; },
    (value: typeof snapshot) => { value.domainObservations.requirements[0]!.edgeId = "spoofed"; },
    (value: typeof snapshot) => { value.domainObservations.requirements[0]!.display.label.en = "Spoofed"; },
    (value: typeof snapshot) => { value.domainObservations.requirements[1] = value.domainObservations.requirements[0]!; },
    (value: typeof snapshot) => { Object.assign(value.domainObservations.requirements[0]!, { raw: "forbidden" }); },
  ]) {
    const altered = structuredClone(snapshot);
    mutate(altered);
    assert.throws(() => PressTunerDebugRunSnapshotSchema.parse(altered));
  }
  const future = structuredClone(snapshot);
  future.domainObservations.requirements.push({
    requirementId: "future-safe-requirement",
    stageId: "verification",
    edgeId: "draft-review",
    display: { label: { ko: "향후 안전 조건", en: "Future safe requirement" }, stageLabel: { ko: "검증", en: "Verification" }, edgeLabel: { ko: "초안에서 리뷰로", en: "Draft to review" } },
    scope: PRESSTUNER_REQUIREMENT_SCOPE,
    outcome: { state: "NOT_EVALUABLE", reasonCode: "SAFE_AGGREGATE_UNAVAILABLE" },
  });
  assert.equal(PressTunerDebugRunSnapshotSchema.parse(future).schemaVersion, "presstuner-debug-run/v4");
  const unsafe = structuredClone(snapshot);
  unsafe.privacy.contentExcluded = false as true;
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse(unsafe));
  const inconsistent = structuredClone(snapshot);
  const inconsistentDetails = inconsistent.domainObservations.requirements.find((item) => item.requirementId === "evidence-fact-consistency")?.details;
  if (inconsistentDetails?.kind === "EVIDENCE_FACT_CONSISTENCY") inconsistentDetails.counts.checked = 2;
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse(inconsistent));
  const malformedHash = structuredClone(snapshot);
  const malformedDetails = malformedHash.domainObservations.requirements.find((item) => item.requirementId === "evidence-fact-consistency")?.details;
  if (malformedDetails?.kind === "EVIDENCE_FACT_CONSISTENCY") malformedDetails.documentRefs = ["sha256:not-a-hash"];
  assert.throws(() => PressTunerDebugRunSnapshotSchema.parse(malformedHash));
});

test("keeps strict v2 parsing while the union accepts all three versions", () => {
  const current = buildPressTunerDebugRunSnapshot(source(), { environment: "qa", snapshotRevision: 7 });
  const legacyRequirements = current.domainObservations.requirements.filter((item) => PRESSTUNER_LEGACY_DOMAIN_REQUIREMENTS.some((legacy) => legacy.requirementId === item.requirementId));
  const v2 = {
    ...current,
    schemaVersion: PRESSTUNER_DEBUG_RUN_V2_SCHEMA_VERSION,
    workflow: PRESSTUNER_LEGACY_PRESS_CREATION_WORKFLOW,
    domainObservations: { requirements: legacyRequirements.map(({ requirementId, stageId, edgeId, display, outcome, details }) => ({ requirementId, stageId, edgeId, display, outcome, details })) },
  };
  assert.equal(PressTunerDebugRunV2SnapshotSchema.parse(v2).schemaVersion, "presstuner-debug-run/v2");
  assert.equal(PressTunerDebugRunSnapshotSchema.parse(v2).schemaVersion, "presstuner-debug-run/v2");
  assert.throws(() => PressTunerDebugRunV2SnapshotSchema.parse({ ...v2, domainObservations: current.domainObservations }));
});

test("keeps strict v3 parsing with the frozen 2.0.0 eight-requirement roster", () => {
  const current = buildPressTunerDebugRunSnapshot(source(), { environment: "qa", snapshotRevision: 7 });
  const v3 = {
    ...current,
    schemaVersion: PRESSTUNER_DEBUG_RUN_V3_SCHEMA_VERSION,
    workflow: PRESSTUNER_LEGACY_PRESS_CREATION_WORKFLOW,
    domainObservations: { requirements: current.domainObservations.requirements.filter((item) => PRESSTUNER_LEGACY_DOMAIN_REQUIREMENTS.some((legacy) => legacy.requirementId === item.requirementId)).map((item) => ({ ...item, scope: PRESSTUNER_LEGACY_REQUIREMENT_SCOPE })) },
  };
  assert.equal(PressTunerDebugRunV3SnapshotSchema.parse(v3).schemaVersion, "presstuner-debug-run/v3");
  assert.equal(PressTunerDebugRunSnapshotSchema.parse(v3).schemaVersion, "presstuner-debug-run/v3");
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
