import { z } from "zod";

export const AI_TELEMETRY_SCHEMA_VERSION = "ai-telemetry-event/v1" as const;
export const AI_TELEMETRY_EVENT_KINDS = [
  "run.lifecycle", "span.lifecycle", "transition.evaluation", "human.approval",
  "edge.traversed", "dataset.item.captured", "replay.started", "experiment.outcome",
  "regression.outcome",
] as const;

const boundedText = (max: number) => z.string().min(1).max(max);
const identifier = boundedText(200).regex(/^[A-Za-z0-9._:@/+~-]+$/);
const hex32 = z.string().regex(/^[0-9a-f]{32}$/);
const hex16 = z.string().regex(/^[0-9a-f]{16}$/);
const timestamp = z.string().datetime({ offset: true });
const scalar = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
const forbiddenAttribute = /(prompt|completion|output|input|memo|prose|content|body|credential|secret|token|user.?id|team.?id|provider.?response)/i;
const safeAttributes = z.record(z.string().min(1).max(100), scalar).superRefine((value, context) => {
  for (const key of Object.keys(value)) if (forbiddenAttribute.test(key)) context.addIssue({ code: "custom", path: [key], message: "sensitive attribute name is forbidden" });
  if (Object.keys(value).length > 32) context.addIssue({ code: "custom", message: "too many attributes" });
});

const scope = z.object({
  teamId: identifier,
  runId: identifier.nullable(),
  processId: identifier,
  processVersion: boundedText(100),
  registryHash: z.string().min(8).max(128),
  attemptId: identifier,
  parentAttemptId: identifier.nullable().default(null),
  caseId: identifier.nullable().default(null),
}).strict();

const evidence = z.object({
  sourceField: z.string().min(1).max(160),
  factKind: z.enum(["NUMBER", "DATE", "QUOTE", "CONSTRAINT", "TEXT"]),
  factValue: z.string().min(1).max(240),
  factHash: z.string().regex(/^[0-9a-f]{64}$/),
  matchStatus: z.enum(["MATCHED", "MISSING", "EXCLUDED"]),
  reasonCode: z.string().min(1).max(100),
}).strict();

const check = z.object({ id: identifier, status: z.enum(["PASS", "FAIL", "NOT_EVALUABLE"]), value: z.number().finite().nullable().optional(), reasonCode: boundedText(100) }).strict();

const payloadByKind = {
  "run.lifecycle": z.object({ phase: z.enum(["STARTED", "COMPLETED", "FAILED", "BLOCKED", "CANCELLED"]), reasonCode: boundedText(100).nullable().default(null) }).strict(),
  "span.lifecycle": z.object({ phase: z.enum(["STARTED", "COMPLETED", "FAILED"]), spanKind: z.enum(["AGENT", "CHAIN", "TOOL", "GUARDRAIL", "EVALUATOR"]), operationName: boundedText(160), nodeId: identifier.nullable().default(null), reasonCode: boundedText(100).nullable().default(null) }).strict(),
  "transition.evaluation": z.object({ edgeId: identifier, evaluator: z.object({ id: identifier, version: boundedText(100) }).strict(), score: z.object({ value: z.number().finite().min(0).max(1), label: boundedText(80) }).strict(), verdict: z.enum(["PASS", "WARN", "BLOCK", "NOT_EVALUABLE"]), evidence: z.array(evidence).max(32), evidenceOverflow: z.number().int().nonnegative().default(0), reasonCode: boundedText(100) }).strict(),
  "human.approval": z.object({ gateId: identifier, phase: z.enum(["REQUESTED", "RECORDED"]), decision: z.enum(["PENDING", "APPROVED", "REJECTED", "ACKNOWLEDGED"]), actorRef: z.string().max(80).nullable() }).strict(),
  "edge.traversed": z.object({ edgeId: identifier, sourceNodeId: identifier, targetNodeId: identifier, verdict: z.enum(["PASS", "WARN"]), acknowledged: z.boolean() }).strict(),
  "dataset.item.captured": z.object({ datasetId: identifier, datasetVersion: boundedText(100), itemId: identifier, captureKind: boundedText(80) }).strict(),
  "replay.started": z.object({ sourceAttemptId: identifier, restoredCheckpointId: identifier.nullable(), caseId: identifier.nullable() }).strict(),
  "experiment.outcome": z.object({ datasetId: identifier, datasetVersion: boundedText(100), configurationId: identifier, disposition: z.enum(["PROMOTE", "REJECT", "NOT_EVALUABLE"]), checks: z.array(check).max(32) }).strict(),
  "regression.outcome": z.object({ datasetId: identifier, datasetVersion: boundedText(100), baselineConfigurationId: identifier, candidateConfigurationId: identifier, disposition: z.enum(["PROMOTE", "REJECT", "NOT_EVALUABLE"]), checks: z.array(check).max(32) }).strict(),
} as const;

const status = z.enum(["STARTED", "RUNNING", "WAITING", "COMPLETED", "FAILED", "BLOCK", "BLOCKED", "CANCELLED", "RECORDED", "PASS", "WARN", "NOT_EVALUABLE"]);
const common = {
  schemaVersion: z.literal(AI_TELEMETRY_SCHEMA_VERSION),
  eventId: z.string().regex(/^aevt_[0-9a-f]{48}$/),
  traceId: hex32,
  spanId: hex16,
  parentSpanId: hex16.nullable(),
  sequence: z.number().int().positive(),
  occurredAt: timestamp,
  scope,
  executionMode: z.enum(["LIVE", "REPLAY", "DETERMINISTIC"]),
  status,
  attributes: safeAttributes,
};

const variant = <Kind extends keyof typeof payloadByKind>(eventKind: Kind) => z.object({ ...common, eventKind: z.literal(eventKind), payload: payloadByKind[eventKind] }).strict();
export const CanonicalAiTelemetryEventSchema = z.discriminatedUnion("eventKind", [
  variant("run.lifecycle"), variant("span.lifecycle"), variant("transition.evaluation"), variant("human.approval"), variant("edge.traversed"), variant("dataset.item.captured"), variant("replay.started"), variant("experiment.outcome"), variant("regression.outcome"),
]).superRefine((event, context) => {
  if (event.parentSpanId === event.spanId) context.addIssue({ code: "custom", path: ["parentSpanId"], message: "span cannot parent itself" });
  if (event.eventKind === "run.lifecycle" && event.parentSpanId !== null) context.addIssue({ code: "custom", path: ["parentSpanId"], message: "run lifecycle spans are roots" });
  if (event.eventKind === "run.lifecycle" && ["COMPLETED", "FAILED", "BLOCKED", "CANCELLED"].includes(event.payload.phase) && !["COMPLETED", "FAILED", "BLOCKED", "CANCELLED"].includes(event.status)) context.addIssue({ code: "custom", path: ["status"], message: "terminal lifecycle event requires terminal status" });
  if (event.eventKind === "span.lifecycle" && ["COMPLETED", "FAILED"].includes(event.payload.phase) && !["COMPLETED", "FAILED"].includes(event.status)) context.addIssue({ code: "custom", path: ["status"], message: "terminal span event requires terminal status" });
});
export type CanonicalAiTelemetryEvent = z.infer<typeof CanonicalAiTelemetryEventSchema>;
export type CanonicalAiTelemetryEventInput = Omit<CanonicalAiTelemetryEvent, "sequence"> & { sequence?: number };
export const parseCanonicalAiTelemetryEvent = (value: unknown) => CanonicalAiTelemetryEventSchema.parse(value);
