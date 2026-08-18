import { z } from "zod";
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

export const StoredTestDebugSnapshotSchema = z.strictObject({
  schemaVersion: z.literal("1.0"),
  nodes: z.array(z.strictObject({ nodeId: IdentifierSchema, input: jsonObject, output: jsonObject, requirements: z.array(requirement).max(100) })).max(100),
  transitions: z.array(z.strictObject({ transitionId: IdentifierSchema, sourceNodeId: IdentifierSchema, targetNodeId: IdentifierSchema, sourceInput: jsonObject, sourceOutput: jsonObject, targetInput: jsonObject, decision: z.strictObject({ decisionRef: IdentifierSchema, matched: z.boolean() }), requirements: z.array(requirement).max(100), context: z.strictObject({ teamId: IdentifierSchema, articleId: IdentifierSchema, articleTeamId: IdentifierSchema, articleType: z.literal("PRESS_RELEASE") }) })).max(500),
});

export type ProjectTestSnapshotRequest = z.infer<typeof ProjectTestSnapshotRequestSchema>;
export type ProjectTransitionReplayRequest = z.infer<typeof ProjectTransitionReplayRequestSchema>;
export type StoredTestDebugSnapshot = z.infer<typeof StoredTestDebugSnapshotSchema>;
