import { createHash } from "node:crypto";
import { ProjectTestSnapshotRequestSchema, ProjectTransitionReplayRequestSchema, StoredTestDebugSnapshotSchema } from "@/domain/ai-process-console/v2/projectTestDebugContracts";
import { buildProcessDefinitionV2 } from "@/domain/ai-process-console/v2/publication";
import { evaluatePressTransitionGuardrails } from "@/domain/press-ai-debugger/transitionGuardrails";
import { prisma } from "@/lib/prisma";

const unavailable = (requestId: string, reasonCode: string) => ({ schemaVersion: "1.0" as const, requestId, status: "UNAVAILABLE" as const, reasonCode });
const rejected = (requestId: string, attemptId: string, reasonCode: string) => ({ schemaVersion: "1.0" as const, requestId, status: "REJECTED" as const, replayOfAttemptId: attemptId, reasonCode });

async function load(request: { projectId: string; environment: string; processId: string; processVersion: string; processDefinitionHash: string; caseId: string; attemptId: string }) {
  const definition = buildProcessDefinitionV2();
  if (request.projectId !== "presstuner" || request.environment !== "conformance" || request.processId !== definition.processId || request.processVersion !== definition.version || request.processDefinitionHash !== definition.canonicalSha256) return null;
  const receipt = await prisma.aiProcessTestRun.findFirst({ where: { projectId: request.projectId, correlationId: request.caseId, factAttemptId: request.attemptId, processVersion: request.processVersion, processDefinitionHash: request.processDefinitionHash, status: "SUCCEEDED" }, select: { debugSnapshot: true } });
  if (!receipt?.debugSnapshot) return null;
  const parsed = StoredTestDebugSnapshotSchema.safeParse(receipt.debugSnapshot);
  return parsed.success ? parsed.data : null;
}

export async function inspectProjectTestSnapshot(input: unknown) {
  const parsed = ProjectTestSnapshotRequestSchema.safeParse(input);
  if (!parsed.success) return unavailable("invalid-request", "REQUEST_INVALID");
  const request = parsed.data;
  const stored = await load(request);
  if (!stored) return unavailable(request.requestId, "SNAPSHOT_NOT_FOUND");
  const location = request.location;
  if (location.kind === "NODE") {
    const node = stored.nodes.find((candidate) => candidate.nodeId === location.nodeId);
    return node ? { schemaVersion: "1.0" as const, requestId: request.requestId, status: "AVAILABLE" as const, approval: "PROJECT_TEST_SAFE" as const, snapshot: { kind: "NODE" as const, nodeId: node.nodeId, input: node.input, output: node.output, requirements: node.requirements } } : unavailable(request.requestId, "NODE_NOT_OBSERVED");
  }
  const edge = stored.transitions.find((candidate) => candidate.transitionId === location.transitionId && candidate.sourceNodeId === location.sourceNodeId && candidate.targetNodeId === location.targetNodeId);
  return edge ? { schemaVersion: "1.0" as const, requestId: request.requestId, status: "AVAILABLE" as const, approval: "PROJECT_TEST_SAFE" as const, snapshot: { kind: "TRANSITION" as const, transitionId: edge.transitionId, sourceNodeId: edge.sourceNodeId, targetNodeId: edge.targetNodeId, sourceOutput: edge.sourceOutput, evaluationInput: edge.sourceInput, targetInput: edge.targetInput, decision: edge.decision, requirements: edge.requirements } } : unavailable(request.requestId, "TRANSITION_NOT_OBSERVED");
}

export async function replayProjectTestTransition(input: unknown) {
  const parsed = ProjectTransitionReplayRequestSchema.safeParse(input);
  if (!parsed.success) return rejected("invalid-request", "invalid-attempt", "REQUEST_INVALID");
  const request = parsed.data;
  const stored = await load(request);
  if (!stored) return rejected(request.requestId, request.attemptId, "SNAPSHOT_NOT_FOUND");
  const edge = stored.transitions.find((candidate) => candidate.transitionId === request.transition.transitionId && candidate.sourceNodeId === request.transition.sourceNodeId && candidate.targetNodeId === request.transition.targetNodeId);
  if (!edge) return rejected(request.requestId, request.attemptId, "TRANSITION_NOT_OBSERVED");
  const result = evaluatePressTransitionGuardrails({ edgeId: edge.transitionId, sourceInput: edge.sourceInput, sourceOutput: edge.sourceOutput, targetPayload: request.candidateInput, attempt: { teamId: edge.context.teamId, articleId: edge.context.articleId }, article: { id: edge.context.articleId, teamId: edge.context.articleTeamId, type: edge.context.articleType } });
  const requirements = result.observations.map((item) => ({ requirementId: item.guardrailId, requirementVersion: "1.0.0", verdict: item.verdict, reasonCodes: item.verdict === "PASS" ? [] : [item.origin === "MANDATORY" ? "MANDATORY_GUARDRAIL_FAILED" : "CASE_EXPECTATION_FAILED"] }));
  const replayId = `replay-${createHash("sha256").update(JSON.stringify([request.attemptId, edge.transitionId, request.candidateInput])).digest("hex").slice(0, 32)}`;
  return { schemaVersion: "1.0" as const, requestId: request.requestId, status: "COMPLETED" as const, approval: "PROJECT_TEST_SAFE" as const, replayId, replayOfAttemptId: request.attemptId, transition: request.transition, decision: { decisionRef: edge.decision.decisionRef, matched: result.verdict !== "BLOCK" }, output: request.candidateInput, requirements };
}
