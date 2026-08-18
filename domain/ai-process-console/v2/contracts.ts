import { z } from "zod";
import { ArtifactReferenceV1Schema, IdentifierSchema, Sha256Schema } from "../v1/contracts";

export const ComponentRevisionV2Schema = z.strictObject({
  componentId: IdentifierSchema,
  version: z.string().min(1).max(64),
  sha256: Sha256Schema,
});

export const RequirementLocationV2Schema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("NODE"), nodeId: IdentifierSchema }),
  z.strictObject({ kind: z.literal("TRANSITION"), transitionId: IdentifierSchema, stageId: IdentifierSchema }),
]);

export const RequirementOutcomeV2Schema = z.discriminatedUnion("state", [
  z.strictObject({ state: z.literal("EVALUATED"), verdict: z.enum(["PASS", "WARN", "BLOCK"]), reasonCodes: z.array(IdentifierSchema).max(20) }),
  z.strictObject({ state: z.literal("NOT_EVALUABLE"), reasonCode: IdentifierSchema }),
  z.strictObject({ state: z.literal("NOT_REACHED") }),
  z.strictObject({ state: z.literal("NOT_APPLICABLE"), reasonCode: IdentifierSchema }),
]);

const evidencePolicy = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("NONE") }),
  z.strictObject({ kind: z.literal("SOURCE_BOUND"), sourceSet: ComponentRevisionV2Schema }),
  z.strictObject({ kind: z.literal("RETRIEVED_CORPUS"), corpus: ComponentRevisionV2Schema, minimumEvidenceItems: z.number().int().min(1).max(100) }),
  z.strictObject({ kind: z.literal("EXTERNAL_VERIFICATION"), verifier: ComponentRevisionV2Schema }),
]);

export const ProcessDefinitionV2Schema = z.strictObject({
  schemaVersion: z.literal("2.0"),
  processId: IdentifierSchema,
  version: z.string().min(1).max(64),
  canonicalSha256: Sha256Schema,
  entryNodeIds: z.array(IdentifierSchema).min(1).max(20),
  nodes: z.array(z.strictObject({ nodeId: IdentifierSchema, label: z.string().min(1).max(120), kind: z.enum(["ACTION", "DECISION", "HUMAN_GATE", "TERMINAL"]), handler: ComponentRevisionV2Schema, evidencePolicy })).min(1).max(100),
  transitions: z.array(z.strictObject({ transitionId: IdentifierSchema, sourceNodeId: IdentifierSchema, targetNodeId: IdentifierSchema, decision: ComponentRevisionV2Schema, maxTraversalsPerAttempt: z.number().int().min(1).max(100) })).max(500),
  requirements: z.array(z.strictObject({ requirementId: IdentifierSchema, version: z.string().min(1).max(64), label: z.string().min(1).max(160), description: z.string().min(1).max(500).optional(), evaluator: ComponentRevisionV2Schema, location: RequirementLocationV2Schema, evaluation: z.strictObject({ kind: z.literal("BOOLEAN") }) })).max(200),
});

export const AttemptMetadataV2Schema = z.strictObject({
  projectId: IdentifierSchema, environment: z.string().min(1).max(64), serviceName: z.string().min(1).max(128),
  processId: IdentifierSchema, processVersion: z.string().min(1).max(64), processDefinitionHash: Sha256Schema,
  scope: z.literal("ATTEMPT"), caseId: IdentifierSchema, objectType: z.string().min(1).max(64), operationId: IdentifierSchema,
  attemptId: IdentifierSchema, executionMode: z.enum(["TEST", "LIVE"]), testRunId: IdentifierSchema.optional(),
}).superRefine((metadata, context) => {
  if (metadata.executionMode === "TEST" && !metadata.testRunId) context.addIssue({ code: "custom", message: "TEST attempt requires testRunId", path: ["testRunId"] });
  if (metadata.executionMode === "LIVE" && metadata.testRunId) context.addIssue({ code: "custom", message: "LIVE attempt cannot claim testRunId", path: ["testRunId"] });
});

const envelope = <T extends string, D extends z.ZodType>(type: T, data: D) => z.strictObject({
  specversion: z.literal("1.0"), id: IdentifierSchema, source: z.string().min(1).max(256), subject: z.string().min(1).max(256),
  time: z.iso.datetime({ offset: true }), schemaVersion: z.literal("2.0"), correlationId: IdentifierSchema, causationId: IdentifierSchema.optional(),
  sequence: z.number().int().nonnegative(), metadata: AttemptMetadataV2Schema, type: z.literal(type), data,
}).superRefine((event, context) => {
  if (event.correlationId !== event.metadata.caseId) context.addIssue({ code: "custom", message: "correlationId must equal caseId", path: ["correlationId"] });
});

const exactCause = <S extends z.ZodTypeAny>(schema: S, field: string) => schema.superRefine((event, context) => {
  const value = event as { causationId?: string; data: Record<string, unknown> };
  if (value.causationId !== value.data[field]) context.addIssue({ code: "custom", message: `causationId must equal data.${field}`, path: ["causationId"] });
});

export const AttemptStartedEventV2Schema = envelope("dev.aiprocess.event.attempt.started.v2", z.strictObject({}));
export const NodeExecutionStartedEventV2Schema = envelope("dev.aiprocess.event.node.execution.started.v2", z.strictObject({ nodeExecutionId: IdentifierSchema, nodeId: IdentifierSchema, handler: ComponentRevisionV2Schema, enteredBy: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("ENTRY") }), z.strictObject({ kind: z.literal("TRANSITION"), transitionSelectionEventId: IdentifierSchema })]) }));
const terminal = { nodeExecutionId: IdentifierSchema, nodeId: IdentifierSchema, startedEventId: IdentifierSchema, handler: ComponentRevisionV2Schema };
export const NodeExecutionCompletedEventV2Schema = exactCause(envelope("dev.aiprocess.event.node.execution.completed.v2", z.strictObject({ ...terminal, durationMs: z.number().int().nonnegative().optional(), outputArtifact: ArtifactReferenceV1Schema.optional() })), "startedEventId");
export const NodeExecutionFailedEventV2Schema = exactCause(envelope("dev.aiprocess.event.node.execution.failed.v2", z.strictObject({ ...terminal, errorCode: IdentifierSchema })), "startedEventId");
export const TransitionEvaluatedEventV2Schema = exactCause(envelope("dev.aiprocess.event.transition.evaluated.v2", z.strictObject({ transitionEvaluationId: IdentifierSchema, transitionId: IdentifierSchema, sourceNodeId: IdentifierSchema, targetNodeId: IdentifierSchema, sourceNodeExecutionId: IdentifierSchema, sourceNodeTerminalEventId: IdentifierSchema, decision: ComponentRevisionV2Schema, matched: z.boolean() })), "sourceNodeTerminalEventId");
export const TransitionSelectedEventV2Schema = exactCause(envelope("dev.aiprocess.event.transition.selected.v2", z.strictObject({ transitionEvaluationId: IdentifierSchema, transitionId: IdentifierSchema, sourceNodeId: IdentifierSchema, targetNodeId: IdentifierSchema, evaluationEventId: IdentifierSchema, decision: ComponentRevisionV2Schema })), "evaluationEventId");
export const RequirementObservedEventV2Schema = exactCause(envelope("dev.aiprocess.event.requirement.observed.v2", z.strictObject({ requirementId: IdentifierSchema, requirementVersion: z.string().min(1).max(64), evaluator: ComponentRevisionV2Schema, location: RequirementLocationV2Schema, occurrence: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("NODE"), nodeId: IdentifierSchema, nodeExecutionId: IdentifierSchema }), z.strictObject({ kind: z.literal("TRANSITION"), transitionId: IdentifierSchema, transitionEvaluationId: IdentifierSchema })]), observedForEventId: IdentifierSchema, outcome: RequirementOutcomeV2Schema })), "observedForEventId");
export const AttemptCompletedEventV2Schema = exactCause(envelope("dev.aiprocess.event.attempt.completed.v2", z.strictObject({ terminalNodeId: IdentifierSchema, terminalNodeExecutionId: IdentifierSchema, terminalNodeEventId: IdentifierSchema, resultArtifact: ArtifactReferenceV1Schema.optional() })), "terminalNodeEventId");
export const AttemptFailedEventV2Schema = envelope("dev.aiprocess.event.attempt.failed.v2", z.strictObject({ failureCode: IdentifierSchema, failedEventId: IdentifierSchema.optional() }));

export const EventV2Schema = z.union([AttemptStartedEventV2Schema, NodeExecutionStartedEventV2Schema, NodeExecutionCompletedEventV2Schema, NodeExecutionFailedEventV2Schema, TransitionEvaluatedEventV2Schema, TransitionSelectedEventV2Schema, RequirementObservedEventV2Schema, AttemptCompletedEventV2Schema, AttemptFailedEventV2Schema]);

export type ComponentRevisionV2 = z.infer<typeof ComponentRevisionV2Schema>;
export type ProcessDefinitionV2 = z.infer<typeof ProcessDefinitionV2Schema>;
export type EventV2 = z.infer<typeof EventV2Schema>;
export type AttemptMetadataV2 = z.infer<typeof AttemptMetadataV2Schema>;
