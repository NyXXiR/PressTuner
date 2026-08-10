import { createHash } from "node:crypto";
import { z } from "zod";

import { pressCreationProcess } from "./processRegistry";

export const PRESSTUNER_DEBUG_RUN_SCHEMA_VERSION = "presstuner-debug-run/v1" as const;

const safeIdentifier = z.string().min(1).max(200).regex(/^[A-Za-z0-9._:@/+~-]+$/);
const timestamp = z.string().datetime({ offset: true });
const nullableTimestamp = timestamp.nullable();
const count = z.number().int().nonnegative();
const factCount = z.object({ checked: count, matched: count, missing: count }).strict();

export const PressTunerDebugRunSnapshotSchema = z.object({
  schemaVersion: z.literal(PRESSTUNER_DEBUG_RUN_SCHEMA_VERSION),
  snapshotRevision: z.number().int().positive(),
  capturedAt: timestamp,
  environment: safeIdentifier,
  run: z.object({
    id: z.string().uuid(),
    attemptRevision: count,
    processId: z.literal("press-creation"),
    processVersion: z.string().min(1).max(100),
    registryHash: z.string().min(8).max(128),
    status: z.enum(["ACTIVE", "INSPECTING", "BLOCKED", "COMPLETED", "FAILED"]),
    startedAt: timestamp,
    completedAt: nullableTimestamp,
  }).strict(),
  topology: z.object({
    kind: z.literal("STATE_MACHINE"),
    nodes: z.array(z.object({ id: safeIdentifier, sequence: count, label: z.string().min(1).max(160) }).strict()).max(100),
    edges: z.array(z.object({ id: safeIdentifier, sequence: count, sourceNodeId: safeIdentifier, targetNodeId: safeIdentifier, humanGateId: safeIdentifier.nullable() }).strict()).max(200),
  }).strict(),
  nodes: z.array(z.object({
    nodeId: safeIdentifier,
    state: z.enum(["PENDING", "ACTIVE", "STARTED", "COMPLETED", "FAILED", "RESTORED"]),
    startedAt: nullableTimestamp,
    completedAt: nullableTimestamp,
    reasonCode: z.string().min(1).max(100).nullable(),
  }).strict()).max(100),
  checkpoints: z.array(z.object({ nodeId: safeIdentifier, mode: z.enum(["EXECUTED", "RESTORED"]), createdAt: timestamp }).strict()).max(100),
  transitions: z.array(z.object({ edgeId: safeIdentifier, verdict: z.enum(["PASS", "WARN", "BLOCK"]), state: z.enum(["EVALUATED", "AWAITING_HUMAN", "ADVANCED", "BLOCKED"]), evaluatedAt: timestamp, advancedAt: nullableTimestamp }).strict()).max(200),
  humanGates: z.array(z.object({ gateId: safeIdentifier, edgeId: safeIdentifier, state: z.enum(["REQUESTED", "ACKNOWLEDGED", "BLOCKED"]), requestedAt: timestamp, resolvedAt: nullableTimestamp }).strict()).max(100),
  retry: z.object({ kind: z.enum(["ORIGINAL", "RETRY"]), parentRunId: z.string().uuid().nullable(), baselineRunId: z.string().uuid().nullable(), restoredNodeIds: z.array(safeIdentifier).max(100) }).strict(),
  evaluations: z.array(z.object({
    id: z.literal("critical-fact-preservation"),
    edgeId: z.literal("brief-draft"),
    verdict: z.enum(["PASS", "WARN", "BLOCK"]),
    counts: z.object({ checked: count, matched: count, missing: count, overflow: count, byKind: z.object({ NUMBER: factCount, DATE: factCount, QUOTE: factCount, CONSTRAINT: factCount }).strict() }).strict(),
    missingFactHashes: z.array(z.string().regex(/^sha256:[0-9a-f]{64}$/)).max(32),
  }).strict()).max(1),
  privacy: z.object({ contentExcluded: z.literal(true) }).strict(),
}).strict().superRefine((snapshot, context) => {
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
});

export type PressTunerDebugRunSnapshot = z.infer<typeof PressTunerDebugRunSnapshotSchema>;

type StoredEvidence = {
  checked?: unknown;
  evidenceOverflow?: unknown;
  missingCount?: unknown;
};

export type DebugRunProjectionSource = {
  attempt: {
    id: string; revision: number; processId: string; processVersion: string; registryHash: string;
    status: "ACTIVE" | "INSPECTING" | "BLOCKED" | "COMPLETED" | "FAILED";
    activeNodeId: string | null; parentAttemptId: string | null; baselineAttemptId: string | null;
    createdAt: Date; updatedAt: Date; completedAt: Date | null;
  };
  checkpoints: readonly { nodeId: string; mode: "EXECUTED" | "RESTORED"; createdAt: Date }[];
  transitions: readonly {
    edgeId: string; verdict: "PASS" | "WARN" | "BLOCK"; createdAt: Date; advancedAt: Date | null;
    humanGateAcknowledgedAt: Date | null;
    observations: readonly { guardrailId: string; verdict: "PASS" | "WARN" | "BLOCK"; evidence: unknown }[];
  }[];
  steps?: readonly { toolName: string | null; status: string; startedAt: Date | null; completedAt: Date | null; errorCode: string | null }[];
};

const iso = (value: Date) => value.toISOString();
const optionalIso = (value: Date | null | undefined) => value ? iso(value) : null;
const factKinds = ["NUMBER", "DATE", "QUOTE", "CONSTRAINT"] as const;

function projectEvaluation(source: DebugRunProjectionSource) {
  const observation = source.transitions.flatMap((transition) => transition.observations.map((item) => ({ ...item, edgeId: transition.edgeId }))).find((item) => item.guardrailId === "critical-fact-preservation" && item.edgeId === "brief-draft");
  if (!observation) return [];
  const evidence = observation.evidence && typeof observation.evidence === "object" ? observation.evidence as StoredEvidence : {};
  const checked = Array.isArray(evidence.checked) ? evidence.checked : [];
  const safeFacts = checked.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const value = item as Record<string, unknown>;
    if (!factKinds.includes(value.factKind as typeof factKinds[number]) || typeof value.factHash !== "string" || !/^[0-9a-f]{64}$/.test(value.factHash) || !["MATCHED", "MISSING"].includes(String(value.matchStatus))) return [];
    return [{ factKind: value.factKind as typeof factKinds[number], factHash: value.factHash, matchStatus: value.matchStatus as "MATCHED" | "MISSING" }];
  });
  const overflow = typeof evidence.evidenceOverflow === "number" && Number.isInteger(evidence.evidenceOverflow) && evidence.evidenceOverflow >= 0 ? evidence.evidenceOverflow : 0;
  const persistedMissing = typeof evidence.missingCount === "number" && Number.isInteger(evidence.missingCount) && evidence.missingCount >= 0 ? evidence.missingCount : safeFacts.filter((fact) => fact.matchStatus === "MISSING").length;
  const totalChecked = safeFacts.length + overflow;
  const missing = Math.min(totalChecked, persistedMissing);
  const byKind = Object.fromEntries(factKinds.map((kind) => {
    const facts = safeFacts.filter((fact) => fact.factKind === kind);
    const kindMissing = facts.filter((fact) => fact.matchStatus === "MISSING").length;
    return [kind, { checked: facts.length, matched: facts.length - kindMissing, missing: kindMissing }];
  })) as Record<typeof factKinds[number], { checked: number; matched: number; missing: number }>;
  return [{ id: "critical-fact-preservation" as const, edgeId: "brief-draft" as const, verdict: observation.verdict, counts: { checked: totalChecked, matched: totalChecked - missing, missing, overflow, byKind }, missingFactHashes: safeFacts.filter((fact) => fact.matchStatus === "MISSING").map((fact) => `sha256:${fact.factHash}`).sort() }];
}

export function buildPressTunerDebugRunSnapshot(source: DebugRunProjectionSource, args: { environment: string; snapshotRevision: number; capturedAt?: Date }): PressTunerDebugRunSnapshot {
  const topologyNodes = [...pressCreationProcess.nodes].sort((a, b) => a.sequence - b.sequence).map((node) => ({ id: node.id, sequence: node.sequence, label: node.label }));
  const topologyEdges = [...pressCreationProcess.edges].sort((a, b) => a.sequence - b.sequence).map((edge) => ({ id: edge.id, sequence: edge.sequence, sourceNodeId: edge.source, targetNodeId: edge.target, humanGateId: edge.humanGate?.id ?? null }));
  const checkpoints = [...source.checkpoints].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.nodeId.localeCompare(b.nodeId));
  const checkpointByNode = new Map(checkpoints.map((checkpoint) => [checkpoint.nodeId, checkpoint]));
  const steps = new Map((source.steps ?? []).flatMap((step) => step.toolName ? [[step.toolName, step] as const] : []));
  const nodes = topologyNodes.map((node) => {
    const checkpoint = checkpointByNode.get(node.id);
    const step = steps.get(node.id);
    const state = checkpoint?.mode === "RESTORED" ? "RESTORED" : checkpoint ? "COMPLETED" : step?.status === "FAILED" ? "FAILED" : step?.status === "RUNNING" ? "STARTED" : source.attempt.activeNodeId === node.id ? "ACTIVE" : "PENDING";
    return { nodeId: node.id, state, startedAt: optionalIso(step?.startedAt), completedAt: optionalIso(step?.completedAt ?? (checkpoint ? checkpoint.createdAt : null)), reasonCode: state === "FAILED" && step?.errorCode ? step.errorCode.slice(0, 100) : null };
  });
  const edgeById = new Map(topologyEdges.map((edge) => [edge.id, edge]));
  const transitions = [...source.transitions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.edgeId.localeCompare(b.edgeId)).map((transition) => ({ edgeId: transition.edgeId, verdict: transition.verdict, state: transition.verdict === "BLOCK" ? "BLOCKED" as const : transition.advancedAt ? "ADVANCED" as const : edgeById.get(transition.edgeId)?.humanGateId ? "AWAITING_HUMAN" as const : "EVALUATED" as const, evaluatedAt: iso(transition.createdAt), advancedAt: optionalIso(transition.advancedAt) }));
  const transitionByEdge = new Map(source.transitions.map((transition) => [transition.edgeId, transition]));
  const humanGates = topologyEdges.flatMap((edge) => {
    if (!edge.humanGateId) return [];
    const transition = transitionByEdge.get(edge.id);
    if (!transition) return [];
    return [{ gateId: edge.humanGateId, edgeId: edge.id, state: transition.verdict === "BLOCK" ? "BLOCKED" as const : transition.humanGateAcknowledgedAt ? "ACKNOWLEDGED" as const : "REQUESTED" as const, requestedAt: iso(transition.createdAt), resolvedAt: optionalIso(transition.humanGateAcknowledgedAt) }];
  });
  return PressTunerDebugRunSnapshotSchema.parse({ schemaVersion: PRESSTUNER_DEBUG_RUN_SCHEMA_VERSION, snapshotRevision: args.snapshotRevision, capturedAt: iso(args.capturedAt ?? source.attempt.updatedAt), environment: args.environment, run: { id: source.attempt.id, attemptRevision: source.attempt.revision, processId: source.attempt.processId, processVersion: source.attempt.processVersion, registryHash: source.attempt.registryHash, status: source.attempt.status, startedAt: iso(source.attempt.createdAt), completedAt: optionalIso(source.attempt.completedAt) }, topology: { kind: "STATE_MACHINE", nodes: topologyNodes, edges: topologyEdges }, nodes, checkpoints: checkpoints.map((checkpoint) => ({ nodeId: checkpoint.nodeId, mode: checkpoint.mode, createdAt: iso(checkpoint.createdAt) })), transitions, humanGates, retry: { kind: source.attempt.parentAttemptId ? "RETRY" : "ORIGINAL", parentRunId: source.attempt.parentAttemptId, baselineRunId: source.attempt.baselineAttemptId, restoredNodeIds: checkpoints.filter((checkpoint) => checkpoint.mode === "RESTORED").map((checkpoint) => checkpoint.nodeId).sort() }, evaluations: projectEvaluation(source), privacy: { contentExcluded: true } });
}

export function hashPressTunerDebugRunSnapshot(snapshot: PressTunerDebugRunSnapshot): string {
  const content = Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "snapshotRevision"));
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
