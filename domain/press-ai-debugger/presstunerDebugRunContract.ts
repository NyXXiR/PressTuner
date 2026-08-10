import { createHash } from "node:crypto";
import { z } from "zod";

import { requirementDisplayLabels } from "./guardrailLabels";
import { pressCreationProcess } from "./processRegistry";

export const PRESSTUNER_DEBUG_RUN_V1_SCHEMA_VERSION = "presstuner-debug-run/v1" as const;
export const PRESSTUNER_DEBUG_RUN_SCHEMA_VERSION = "presstuner-debug-run/v2" as const;
export const PRESSTUNER_PRESS_CREATION_WORKFLOW = { id: "presstuner.press-creation", version: "2.0.0" } as const;

const exportedRequirementIds = new Set([
  "article-team-ownership",
  "fresh-press-release",
  "memo-brief-grounding",
  "critical-fact-preservation",
  "brief-draft-grounding",
  "press-structure",
  "review-note-selection",
  "review-checkpoint-lineage",
] as const);

type RequirementId = (typeof exportedRequirementIds extends Set<infer Value> ? Value : never);
type StageId = "article-initialization" | "brief-normalization" | "draft-generation" | "draft-review";
type EdgeId = "initialization-brief" | "brief-draft" | "draft-review" | "review-rewrite";

export const PRESSTUNER_DOMAIN_REQUIREMENTS = pressCreationProcess.edges.flatMap((edge) =>
  edge.mandatoryGuardrailIds
    .filter((requirementId) => exportedRequirementIds.has(requirementId as never))
    .map((requirementId) => {
      const identity = {
        requirementId: requirementId as RequirementId,
        stageId: edge.source as StageId,
        edgeId: edge.id as EdgeId,
      };
      return { ...identity, display: requirementDisplayLabels(identity) };
    }),
);

if (PRESSTUNER_DOMAIN_REQUIREMENTS.length !== exportedRequirementIds.size) {
  throw new Error("PRESSTUNER_DOMAIN_REQUIREMENT_REGISTRY_MISMATCH");
}

const safeIdentifier = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:@/+~-]+$/);
const safeLabel = z.string().min(1).max(160).regex(/^[^\r\n\t<>]*$/);
const timestamp = z.string().datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();
const count = z.number().int().nonnegative();
const factCount = z.object({ checked: count, matched: count, missing: count }).strict();
const factKinds = ["NUMBER", "DATE", "QUOTE", "CONSTRAINT"] as const;
const bilingualLabel = z.object({ ko: safeLabel, en: safeLabel }).strict();

const executionFields = {
  snapshotRevision: z.number().int().positive(),
  capturedAt: timestamp,
  environment: safeIdentifier,
  run: z.object({
    id: z.string().uuid(), attemptRevision: count, processId: z.literal("press-creation"),
    processVersion: z.string().min(1).max(100), registryHash: z.string().min(8).max(128),
    status: z.enum(["ACTIVE", "INSPECTING", "BLOCKED", "COMPLETED", "FAILED"]),
    startedAt: timestamp, completedAt: nullableTimestamp,
  }).strict(),
  topology: z.object({
    kind: z.literal("STATE_MACHINE"),
    nodes: z.array(z.object({ id: safeIdentifier, sequence: count, label: safeLabel }).strict()).max(100),
    edges: z.array(z.object({ id: safeIdentifier, sequence: count, sourceNodeId: safeIdentifier, targetNodeId: safeIdentifier, humanGateId: safeIdentifier.nullable() }).strict()).max(200),
  }).strict(),
  nodes: z.array(z.object({ nodeId: safeIdentifier, state: z.enum(["PENDING", "ACTIVE", "STARTED", "COMPLETED", "FAILED", "RESTORED"]), startedAt: nullableTimestamp, completedAt: nullableTimestamp, reasonCode: z.string().min(1).max(100).nullable() }).strict()).max(100),
  checkpoints: z.array(z.object({ nodeId: safeIdentifier, mode: z.enum(["EXECUTED", "RESTORED"]), createdAt: timestamp }).strict()).max(100),
  transitions: z.array(z.object({ edgeId: safeIdentifier, verdict: z.enum(["PASS", "WARN", "BLOCK"]), state: z.enum(["EVALUATED", "AWAITING_HUMAN", "ADVANCED", "BLOCKED"]), evaluatedAt: timestamp, advancedAt: nullableTimestamp }).strict()).max(200),
  humanGates: z.array(z.object({ gateId: safeIdentifier, edgeId: safeIdentifier, state: z.enum(["REQUESTED", "ACKNOWLEDGED", "BLOCKED"]), requestedAt: timestamp, resolvedAt: nullableTimestamp }).strict()).max(100),
  retry: z.object({ kind: z.enum(["ORIGINAL", "RETRY"]), parentRunId: z.string().uuid().nullable(), baselineRunId: z.string().uuid().nullable(), restoredNodeIds: z.array(safeIdentifier).max(100) }).strict(),
  privacy: z.object({ contentExcluded: z.literal(true) }).strict(),
} as const;

const criticalFactCounts = z.object({ checked: count, matched: count, missing: count, overflow: count, byKind: z.object({ NUMBER: factCount, DATE: factCount, QUOTE: factCount, CONSTRAINT: factCount }).strict() }).strict();
const criticalFactDetails = z.object({
  kind: z.literal("CRITICAL_FACT_PRESERVATION"),
  counts: criticalFactCounts,
  missingFactHashes: z.array(z.string().regex(/^sha256:[0-9a-f]{64}$/)).max(32),
}).strict().superRefine((details, context) => {
  const categories = factKinds.map((kind) => details.counts.byKind[kind]);
  if (details.counts.matched + details.counts.missing !== details.counts.checked) context.addIssue({ code: "custom", path: ["counts"], message: "invalid total counts" });
  for (const [index, category] of categories.entries()) if (category.matched + category.missing !== category.checked) context.addIssue({ code: "custom", path: ["counts", "byKind", factKinds[index]], message: "invalid category counts" });
  if (categories.reduce((sum, item) => sum + item.checked, 0) + details.counts.overflow !== details.counts.checked) context.addIssue({ code: "custom", path: ["counts"], message: "invalid overflow count" });
  if (details.missingFactHashes.length > details.counts.missing) context.addIssue({ code: "custom", path: ["missingFactHashes"], message: "too many missing hashes" });
});

const outcome = z.discriminatedUnion("state", [
  z.object({ state: z.literal("EVALUATED"), verdict: z.enum(["PASS", "WARN", "BLOCK"]), evaluatedAt: timestamp }).strict(),
  z.object({ state: z.literal("NOT_EVALUABLE"), reasonCode: z.enum(["MANDATORY_OBSERVATION_MISSING", "SAFE_AGGREGATE_UNAVAILABLE"]) }).strict(),
  z.object({ state: z.literal("NOT_REACHED") }).strict(),
  z.object({ state: z.literal("NOT_APPLICABLE"), reasonCode: z.literal("PRODUCER_DEFINED_INAPPLICABLE") }).strict(),
]);

const requirementObservation = z.object({
  requirementId: safeIdentifier,
  stageId: safeIdentifier,
  edgeId: safeIdentifier,
  display: z.object({ label: bilingualLabel, stageLabel: bilingualLabel, edgeLabel: bilingualLabel }).strict(),
  outcome,
  details: criticalFactDetails.optional(),
}).strict();

function validateTopology(snapshot: { topology: z.infer<typeof executionFields.topology>; nodes: Array<{ nodeId: string }>; checkpoints: Array<{ nodeId: string }>; transitions: Array<{ edgeId: string }>; humanGates: Array<{ edgeId: string; gateId: string }> }, context: z.RefinementCtx) {
  const nodeIds = new Set(snapshot.topology.nodes.map((node) => node.id));
  const edgeIds = new Set(snapshot.topology.edges.map((edge) => edge.id));
  const gateIds = new Set(snapshot.topology.edges.flatMap((edge) => edge.humanGateId ? [edge.humanGateId] : []));
  for (const edge of snapshot.topology.edges) {
    if (!nodeIds.has(edge.sourceNodeId)) context.addIssue({ code: "custom", path: ["topology", "edges"], message: "dangling source node" });
    if (!nodeIds.has(edge.targetNodeId)) context.addIssue({ code: "custom", path: ["topology", "edges"], message: "dangling target node" });
  }
  for (const node of snapshot.nodes) if (!nodeIds.has(node.nodeId)) context.addIssue({ code: "custom", path: ["nodes"], message: "unknown node" });
  for (const checkpoint of snapshot.checkpoints) if (!nodeIds.has(checkpoint.nodeId)) context.addIssue({ code: "custom", path: ["checkpoints"], message: "unknown node" });
  for (const transition of snapshot.transitions) if (!edgeIds.has(transition.edgeId)) context.addIssue({ code: "custom", path: ["transitions"], message: "unknown edge" });
  for (const gate of snapshot.humanGates) if (!edgeIds.has(gate.edgeId) || !gateIds.has(gate.gateId)) context.addIssue({ code: "custom", path: ["humanGates"], message: "unknown gate" });
}

export const PressTunerDebugRunV1SnapshotSchema = z.object({
  schemaVersion: z.literal(PRESSTUNER_DEBUG_RUN_V1_SCHEMA_VERSION),
  ...executionFields,
  evaluations: z.array(z.object({
    id: z.literal("critical-fact-preservation"), edgeId: z.literal("brief-draft"), verdict: z.enum(["PASS", "WARN", "BLOCK"]),
    counts: criticalFactCounts,
    missingFactHashes: z.array(z.string().regex(/^sha256:[0-9a-f]{64}$/)).max(32),
  }).strict()).max(1),
}).strict().superRefine(validateTopology);

export const PressTunerDebugRunV2SnapshotSchema = z.object({
  schemaVersion: z.literal(PRESSTUNER_DEBUG_RUN_SCHEMA_VERSION),
  ...executionFields,
  workflow: z.object({ id: z.literal(PRESSTUNER_PRESS_CREATION_WORKFLOW.id), version: z.literal(PRESSTUNER_PRESS_CREATION_WORKFLOW.version) }).strict(),
  domainObservations: z.object({ requirements: z.array(requirementObservation).length(PRESSTUNER_DOMAIN_REQUIREMENTS.length) }).strict(),
}).strict().superRefine((snapshot, context) => {
  validateTopology(snapshot, context);
  const expected = new Map<string, (typeof PRESSTUNER_DOMAIN_REQUIREMENTS)[number]>(PRESSTUNER_DOMAIN_REQUIREMENTS.map((item) => [item.requirementId, item]));
  const seen = new Set<string>();
  for (const [index, item] of snapshot.domainObservations.requirements.entries()) {
    const definition = expected.get(item.requirementId);
    if (!definition || seen.has(item.requirementId)) context.addIssue({ code: "custom", path: ["domainObservations", "requirements", index], message: "unknown or duplicate requirement" });
    else if (item.stageId !== definition.stageId || item.edgeId !== definition.edgeId || JSON.stringify(item.display) !== JSON.stringify(definition.display)) context.addIssue({ code: "custom", path: ["domainObservations", "requirements", index], message: "noncanonical requirement metadata" });
    if (item.requirementId === "critical-fact-preservation") {
      if (item.outcome.state === "EVALUATED" && !item.details) context.addIssue({ code: "custom", path: ["domainObservations", "requirements", index, "details"], message: "missing critical fact details" });
      if (item.outcome.state !== "EVALUATED" && item.details) context.addIssue({ code: "custom", path: ["domainObservations", "requirements", index, "details"], message: "details require an evaluated outcome" });
    } else if (item.details) context.addIssue({ code: "custom", path: ["domainObservations", "requirements", index, "details"], message: "details not allowed" });
    seen.add(item.requirementId);
  }
});

export const PressTunerDebugRunSnapshotSchema = z.discriminatedUnion("schemaVersion", [PressTunerDebugRunV1SnapshotSchema, PressTunerDebugRunV2SnapshotSchema]);
export type PressTunerDebugRunV1Snapshot = z.infer<typeof PressTunerDebugRunV1SnapshotSchema>;
export type PressTunerDebugRunSnapshot = z.infer<typeof PressTunerDebugRunSnapshotSchema>;
export type PressTunerDebugRunV2Snapshot = z.infer<typeof PressTunerDebugRunV2SnapshotSchema>;

type StoredEvidence = { checked?: unknown; evidenceOverflow?: unknown; missingCount?: unknown };
export type DebugRunProjectionSource = {
  attempt: { id: string; revision: number; processId: string; processVersion: string; registryHash: string; status: "ACTIVE" | "INSPECTING" | "BLOCKED" | "COMPLETED" | "FAILED"; activeNodeId: string | null; parentAttemptId: string | null; baselineAttemptId: string | null; createdAt: Date; updatedAt: Date; completedAt: Date | null };
  checkpoints: readonly { nodeId: string; mode: "EXECUTED" | "RESTORED"; createdAt: Date }[];
  transitions: readonly { edgeId: string; verdict: "PASS" | "WARN" | "BLOCK"; createdAt: Date; advancedAt: Date | null; humanGateAcknowledgedAt: Date | null; observations: readonly { guardrailId: string; verdict: "PASS" | "WARN" | "BLOCK"; evidence: unknown }[] }[];
  steps?: readonly { toolName: string | null; status: string; startedAt: Date | null; completedAt: Date | null; errorCode: string | null }[];
};

const iso = (value: Date) => value.toISOString();
const optionalIso = (value: Date | null | undefined) => value ? iso(value) : null;

function projectCriticalFactDetails(evidenceValue: unknown) {
  if (!evidenceValue || typeof evidenceValue !== "object") return null;
  const evidence = evidenceValue as StoredEvidence;
  if (!Array.isArray(evidence.checked) || typeof evidence.evidenceOverflow !== "number" || !Number.isInteger(evidence.evidenceOverflow) || evidence.evidenceOverflow < 0 || typeof evidence.missingCount !== "number" || !Number.isInteger(evidence.missingCount) || evidence.missingCount < 0) return null;
  const facts = evidence.checked.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (!factKinds.includes(value.factKind as typeof factKinds[number]) || typeof value.factHash !== "string" || !/^[0-9a-f]{64}$/.test(value.factHash) || !["MATCHED", "MISSING"].includes(String(value.matchStatus))) return [];
    return [{ factKind: value.factKind as typeof factKinds[number], factHash: value.factHash, matchStatus: value.matchStatus as "MATCHED" | "MISSING" }];
  });
  if (facts.length !== evidence.checked.length) return null;
  const checked = facts.length + evidence.evidenceOverflow;
  const knownMissing = facts.filter((fact) => fact.matchStatus === "MISSING").length;
  if (evidence.missingCount > checked || evidence.missingCount < knownMissing || evidence.missingCount - knownMissing > evidence.evidenceOverflow) return null;
  const byKind = Object.fromEntries(factKinds.map((kind) => {
    const matching = facts.filter((fact) => fact.factKind === kind);
    const missing = matching.filter((fact) => fact.matchStatus === "MISSING").length;
    return [kind, { checked: matching.length, matched: matching.length - missing, missing }];
  })) as Record<typeof factKinds[number], { checked: number; matched: number; missing: number }>;
  return criticalFactDetails.parse({ kind: "CRITICAL_FACT_PRESERVATION", counts: { checked, matched: checked - evidence.missingCount, missing: evidence.missingCount, overflow: evidence.evidenceOverflow, byKind }, missingFactHashes: facts.filter((fact) => fact.matchStatus === "MISSING").map((fact) => `sha256:${fact.factHash}`).sort().slice(0, 32) });
}

function projectDomainObservations(source: DebugRunProjectionSource) {
  const transitions = new Map(source.transitions.map((transition) => [transition.edgeId, transition]));
  return PRESSTUNER_DOMAIN_REQUIREMENTS.map((definition) => {
    const base = { requirementId: definition.requirementId, stageId: definition.stageId, edgeId: definition.edgeId, display: definition.display };
    const transition = transitions.get(definition.edgeId);
    if (!transition) return { ...base, outcome: { state: "NOT_REACHED" as const } };
    const observation = transition.observations.find((item) => item.guardrailId === definition.requirementId);
    if (!observation) return { ...base, outcome: { state: "NOT_EVALUABLE" as const, reasonCode: "MANDATORY_OBSERVATION_MISSING" as const } };
    if (definition.requirementId === "critical-fact-preservation") {
      const details = projectCriticalFactDetails(observation.evidence);
      if (!details) return { ...base, outcome: { state: "NOT_EVALUABLE" as const, reasonCode: "SAFE_AGGREGATE_UNAVAILABLE" as const } };
      return { ...base, outcome: { state: "EVALUATED" as const, verdict: observation.verdict, evaluatedAt: iso(transition.createdAt) }, details };
    }
    return { ...base, outcome: { state: "EVALUATED" as const, verdict: observation.verdict, evaluatedAt: iso(transition.createdAt) } };
  });
}

export function buildPressTunerDebugRunSnapshot(source: DebugRunProjectionSource, args: { environment: string; snapshotRevision: number; capturedAt?: Date }): PressTunerDebugRunV2Snapshot {
  const topologyNodes = [...pressCreationProcess.nodes].sort((a, b) => a.sequence - b.sequence).map((node) => ({ id: node.id, sequence: node.sequence, label: node.label }));
  const topologyEdges = [...pressCreationProcess.edges].sort((a, b) => a.sequence - b.sequence).map((edge) => ({ id: edge.id, sequence: edge.sequence, sourceNodeId: edge.source, targetNodeId: edge.target, humanGateId: edge.humanGate?.id ?? null }));
  const checkpoints = [...source.checkpoints].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.nodeId.localeCompare(b.nodeId));
  const checkpointByNode = new Map(checkpoints.map((checkpoint) => [checkpoint.nodeId, checkpoint]));
  const steps = new Map((source.steps ?? []).flatMap((step) => step.toolName ? [[step.toolName, step] as const] : []));
  const nodes = topologyNodes.map((node) => {
    const checkpoint = checkpointByNode.get(node.id); const step = steps.get(node.id);
    const state = checkpoint?.mode === "RESTORED" ? "RESTORED" : checkpoint ? "COMPLETED" : step?.status === "FAILED" ? "FAILED" : step?.status === "RUNNING" ? "STARTED" : source.attempt.activeNodeId === node.id ? "ACTIVE" : "PENDING";
    return { nodeId: node.id, state, startedAt: optionalIso(step?.startedAt), completedAt: optionalIso(step?.completedAt ?? (checkpoint ? checkpoint.createdAt : null)), reasonCode: state === "FAILED" && step?.errorCode ? step.errorCode.slice(0, 100) : null };
  });
  const edgeById = new Map(topologyEdges.map((edge) => [edge.id, edge]));
  const transitions = [...source.transitions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.edgeId.localeCompare(b.edgeId)).map((transition) => ({ edgeId: transition.edgeId, verdict: transition.verdict, state: transition.verdict === "BLOCK" ? "BLOCKED" as const : transition.advancedAt ? "ADVANCED" as const : edgeById.get(transition.edgeId)?.humanGateId ? "AWAITING_HUMAN" as const : "EVALUATED" as const, evaluatedAt: iso(transition.createdAt), advancedAt: optionalIso(transition.advancedAt) }));
  const transitionByEdge = new Map(source.transitions.map((transition) => [transition.edgeId, transition]));
  const humanGates = topologyEdges.flatMap((edge) => { const transition = transitionByEdge.get(edge.id); if (!edge.humanGateId || !transition) return []; return [{ gateId: edge.humanGateId, edgeId: edge.id, state: transition.verdict === "BLOCK" ? "BLOCKED" as const : transition.humanGateAcknowledgedAt ? "ACKNOWLEDGED" as const : "REQUESTED" as const, requestedAt: iso(transition.createdAt), resolvedAt: optionalIso(transition.humanGateAcknowledgedAt) }]; });
  return PressTunerDebugRunV2SnapshotSchema.parse({ schemaVersion: PRESSTUNER_DEBUG_RUN_SCHEMA_VERSION, snapshotRevision: args.snapshotRevision, capturedAt: iso(args.capturedAt ?? source.attempt.updatedAt), environment: args.environment, run: { id: source.attempt.id, attemptRevision: source.attempt.revision, processId: source.attempt.processId, processVersion: source.attempt.processVersion, registryHash: source.attempt.registryHash, status: source.attempt.status, startedAt: iso(source.attempt.createdAt), completedAt: optionalIso(source.attempt.completedAt) }, topology: { kind: "STATE_MACHINE", nodes: topologyNodes, edges: topologyEdges }, nodes, checkpoints: checkpoints.map((checkpoint) => ({ nodeId: checkpoint.nodeId, mode: checkpoint.mode, createdAt: iso(checkpoint.createdAt) })), transitions, humanGates, retry: { kind: source.attempt.parentAttemptId ? "RETRY" : "ORIGINAL", parentRunId: source.attempt.parentAttemptId, baselineRunId: source.attempt.baselineAttemptId, restoredNodeIds: checkpoints.filter((checkpoint) => checkpoint.mode === "RESTORED").map((checkpoint) => checkpoint.nodeId).sort() }, privacy: { contentExcluded: true }, workflow: PRESSTUNER_PRESS_CREATION_WORKFLOW, domainObservations: { requirements: projectDomainObservations(source) } });
}

export function hashPressTunerDebugRunSnapshot(snapshot: PressTunerDebugRunSnapshot): string {
  const content = Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "snapshotRevision"));
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
