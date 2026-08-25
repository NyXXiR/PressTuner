import { z } from "zod";
import { AttemptMetadataV2Schema, RequirementOutcomeV2Schema } from "./contracts";
import { IdentifierSchema, Sha256Schema } from "../v1/contracts";

const jsonObject = z.record(z.string().min(1).max(120), z.json());
const identity = {
  projectId: IdentifierSchema, environment: IdentifierSchema, processId: IdentifierSchema, processVersion: z.string().min(1).max(64),
  processDefinitionHash: Sha256Schema, executionMode: z.literal("TEST"), caseId: IdentifierSchema, attemptId: IdentifierSchema,
};
const transition = z.strictObject({ transitionId: IdentifierSchema, sourceNodeId: IdentifierSchema, targetNodeId: IdentifierSchema });
const requirement = z.strictObject({ requirementId: IdentifierSchema, requirementVersion: z.string().min(1).max(64), verdict: z.enum(["PASS", "WARN", "BLOCK", "NOT_EVALUABLE", "NOT_REACHED", "NOT_APPLICABLE"]), reasonCodes: z.array(IdentifierSchema).max(20) });

export const ProjectTestSnapshotRequestSchema = z.strictObject({ schemaVersion: z.literal("1.0"), requestId: IdentifierSchema, ...identity, location: z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("NODE"), nodeId: IdentifierSchema }), z.strictObject({ kind: z.literal("TRANSITION"), ...transition.shape })]) });
export const ProjectTransitionReplayRequestSchema = z.strictObject({ schemaVersion: z.literal("1.0"), requestId: IdentifierSchema, ...identity, transition, candidateInput: jsonObject });

export const ProjectTestLocationV2Schema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("NODE"), nodeId: IdentifierSchema, nodeExecutionId: IdentifierSchema }),
  z.strictObject({ kind: z.literal("TRANSITION"), ...transition.shape, transitionEvaluationId: IdentifierSchema }),
]);
export const ProjectTestSnapshotRequestV2Schema = z.strictObject({ schemaVersion: z.literal("2.0"), requestId: IdentifierSchema, metadata: AttemptMetadataV2Schema.refine((metadata) => metadata.executionMode === "TEST", "TEST metadata is required"), location: ProjectTestLocationV2Schema });
const requirementResultV2 = z.strictObject({ requirementId: IdentifierSchema, requirementVersion: z.string().min(1).max(64), outcome: RequirementOutcomeV2Schema });
const replayReadiness = z.strictObject({ state: z.enum(["READY", "UNAVAILABLE"]), observedAt: z.iso.datetime({ offset: true }), reasonCode: IdentifierSchema.optional() });
export const ProjectTestSnapshotResponseV2Schema = z.discriminatedUnion("status", [
  z.strictObject({ schemaVersion: z.literal("2.0"), requestId: IdentifierSchema, status: z.literal("AVAILABLE"), approval: z.literal("PROJECT_TEST_SAFE"), metadata: AttemptMetadataV2Schema, location: ProjectTestLocationV2Schema, input: jsonObject, output: jsonObject, requirements: z.array(requirementResultV2).max(100), transitionContext: z.strictObject({ priorNodeInput: jsonObject, priorNodeOutput: jsonObject, condition: z.json(), evaluationInput: jsonObject, targetInput: jsonObject, decision: z.strictObject({ matched: z.boolean() }) }).optional(), replayReadiness: replayReadiness.optional() }),
  z.strictObject({ schemaVersion: z.literal("2.0"), requestId: IdentifierSchema, status: z.literal("UNAVAILABLE"), reasonCode: IdentifierSchema }),
]);
export const ProjectTransitionReplayRequestV2Schema = z.strictObject({ schemaVersion: z.literal("2.0"), requestId: IdentifierSchema, metadata: AttemptMetadataV2Schema.refine((metadata) => metadata.executionMode === "TEST", "TEST metadata is required"), transition: ProjectTestLocationV2Schema.refine((location) => location.kind === "TRANSITION", "A transition occurrence is required"), candidateInput: jsonObject });
export const ProjectTransitionReplayResponseV2Schema = z.discriminatedUnion("status", [
  z.strictObject({ schemaVersion: z.literal("2.0"), requestId: IdentifierSchema, status: z.literal("COMPLETED"), approval: z.literal("PROJECT_TEST_SAFE"), replayId: IdentifierSchema, replayOfAttemptId: IdentifierSchema, replayAttemptId: IdentifierSchema, metadata: AttemptMetadataV2Schema, transition: ProjectTestLocationV2Schema.refine((location) => location.kind === "TRANSITION"), matched: z.boolean(), output: jsonObject, requirements: z.array(requirementResultV2).max(100) }),
  z.strictObject({ schemaVersion: z.literal("2.0"), requestId: IdentifierSchema, status: z.literal("REJECTED"), replayOfAttemptId: IdentifierSchema, reasonCode: IdentifierSchema }),
]);

export const StoredTestDebugSnapshotV1Schema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  nodes: z.array(z.strictObject({ nodeId: IdentifierSchema, input: jsonObject, output: jsonObject, requirements: z.array(requirement).max(100) })).max(100),
  transitions: z.array(z.strictObject({ transitionId: IdentifierSchema, sourceNodeId: IdentifierSchema, targetNodeId: IdentifierSchema, sourceInput: jsonObject, sourceOutput: jsonObject, targetInput: jsonObject, decision: z.strictObject({ decisionRef: IdentifierSchema, matched: z.boolean() }), requirements: z.array(requirement).max(100), context: z.strictObject({ teamId: IdentifierSchema, articleId: IdentifierSchema, articleTeamId: IdentifierSchema, articleType: z.literal("PRESS_RELEASE") }) })).max(500),
});
export const StoredTestDebugSnapshotV2Schema = z.strictObject({
  schemaVersion: z.literal("2.0"),
  nodes: z.array(z.strictObject({ nodeId: IdentifierSchema, nodeExecutionId: IdentifierSchema.optional(), input: jsonObject, output: jsonObject, requirements: z.array(requirement).max(100) })).max(100),
  transitions: z.array(z.strictObject({ transitionId: IdentifierSchema, transitionEvaluationId: IdentifierSchema, sourceNodeId: IdentifierSchema, targetNodeId: IdentifierSchema, sourceInput: jsonObject, sourceOutput: jsonObject, targetInput: jsonObject, decision: z.strictObject({ decisionRef: IdentifierSchema, matched: z.boolean() }), requirements: z.array(requirement).max(100), context: z.strictObject({ teamId: IdentifierSchema, articleId: IdentifierSchema, articleTeamId: IdentifierSchema, articleType: z.literal("PRESS_RELEASE") }) })).max(500),
});
export const StoredTestDebugSnapshotSchema = z.union([StoredTestDebugSnapshotV1Schema, StoredTestDebugSnapshotV2Schema]);

export type ProjectTestSnapshotRequest = z.infer<typeof ProjectTestSnapshotRequestSchema>;
export type ProjectTransitionReplayRequest = z.infer<typeof ProjectTransitionReplayRequestSchema>;
export type StoredTestDebugSnapshot = z.infer<typeof StoredTestDebugSnapshotSchema>;
export type ProjectTestSnapshotRequestV2 = z.infer<typeof ProjectTestSnapshotRequestV2Schema>;
export type ProjectTransitionReplayRequestV2 = z.infer<typeof ProjectTransitionReplayRequestV2Schema>;
