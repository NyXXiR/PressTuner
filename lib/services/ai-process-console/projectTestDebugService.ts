import { createHash, randomUUID } from "node:crypto";
import { AI_PROCESS_CONSOLE_SOURCE } from "@/domain/ai-process-console/v1/publication";
import { TransitionEvaluatedEventV2Schema } from "@/domain/ai-process-console/v2/contracts";
import { ProjectTestSnapshotRequestSchema, ProjectTestSnapshotRequestV2Schema, ProjectTestSnapshotResponseV2Schema, ProjectTransitionReplayRequestSchema, ProjectTransitionReplayRequestV2Schema, ProjectTransitionReplayResponseV2Schema, StoredTestDebugSnapshotSchema, type ProjectTestSnapshotRequestV2, type ProjectTransitionReplayRequestV2 } from "@/domain/ai-process-console/v2/projectTestDebugContracts";
import { buildProcessDefinitionV2, buildProcessDefinitionV2Compatibility } from "@/domain/ai-process-console/v2/publication";
import { evaluatePressTransitionGuardrails } from "@/domain/press-ai-debugger/transitionGuardrails";
import { prisma } from "@/lib/prisma";
import { cleanupIsolatedFixtureWorkspace, createIsolatedFixtureWorkspace } from "./isolatedFixtureWorkspace";

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

const v2Unavailable = (requestId: string, reasonCode: string) => ProjectTestSnapshotResponseV2Schema.parse({ schemaVersion: "2.0", requestId, status: "UNAVAILABLE", reasonCode });
const v2Rejected = (requestId: string, attemptId: string, reasonCode: string) => ProjectTransitionReplayResponseV2Schema.parse({ schemaVersion: "2.0", requestId, status: "REJECTED", replayOfAttemptId: attemptId, reasonCode });
const utf8Bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const forbiddenKey = /provider|operationid|runid|test.?run|trace|adapter|credential|callback|metadata|url|endpoint|destination|token|secret|password|authorization|headers?/iu;
const safeCandidate = (value: unknown, seen = new Set<object>()): boolean => {
  if (typeof value === "string") return !/\b(?:https?:\/\/|postgres(?:ql)?:\/\/)/iu.test(value);
  if (value === null || typeof value !== "object") return true;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((item) => safeCandidate(item, seen));
  return Object.entries(value as Record<string, unknown>).every(([key, item]) => !forbiddenKey.test(key) && safeCandidate(item, seen));
};

const supportedDefinition = (request: ProjectTestSnapshotRequestV2 | ProjectTransitionReplayRequestV2) => {
  const selected = buildProcessDefinitionV2();
  const carrier = buildProcessDefinitionV2Compatibility();
  const location = "location" in request ? request.location : request.transition;
  if (location.kind !== "TRANSITION") return null;
  const carrierTransition = carrier.transitions.find((item) => item.transitionId === location.transitionId && item.sourceNodeId === location.sourceNodeId && item.targetNodeId === location.targetNodeId);
  const direct = request.metadata.processVersion === carrier.version && request.metadata.processDefinitionHash === carrier.canonicalSha256 && carrierTransition?.testApi?.snapshotInspect === true;
  const grants = carrierTransition?.testApi?.compatibleDefinitions?.filter((item) => item.processVersion === request.metadata.processVersion && item.processDefinitionHash === request.metadata.processDefinitionHash) ?? [];
  const compatible = request.metadata.processVersion === selected.version && request.metadata.processDefinitionHash === selected.canonicalSha256 && grants.length === 1;
  if ((!direct && !compatible) || carrierTransition?.testApi?.isolatedReplay !== true) return null;
  return { selected: direct ? carrier : selected, carrierTransition };
};

type ProjectTestDebugDatabase = Pick<typeof prisma, "aiProcessTestRun" | "aiProcessFactOutbox">;

async function loadV2(request: ProjectTestSnapshotRequestV2 | ProjectTransitionReplayRequestV2, database: ProjectTestDebugDatabase = prisma) {
  const location = "location" in request ? request.location : request.transition;
  const definition = supportedDefinition(request);
  const metadata = request.metadata;
  if (!definition || location.kind !== "TRANSITION" || metadata.projectId !== "presstuner" || metadata.environment !== "conformance" || metadata.serviceName !== "presstuner"
    || metadata.processId !== "press-creation" || metadata.executionMode !== "TEST") return null;
  const receipt = await database.aiProcessTestRun.findFirst({
    where: {
      projectId: metadata.projectId, testRunId: metadata.testRunId, correlationId: metadata.caseId, factAttemptId: metadata.attemptId,
      commandId: metadata.operationId, processId: metadata.processId, processVersion: metadata.processVersion,
      processDefinitionHash: metadata.processDefinitionHash, status: "SUCCEEDED",
    },
    select: { id: true, debugSnapshot: true },
  });
  if (!receipt?.debugSnapshot) return null;
  const parsedSnapshot = StoredTestDebugSnapshotSchema.safeParse(receipt.debugSnapshot);
  if (!parsedSnapshot.success) return null;
  const occurrenceFacts = await database.aiProcessFactOutbox.findMany({
    where: {
      source: AI_PROCESS_CONSOLE_SOURCE, attemptId: metadata.attemptId,
      eventType: "dev.aiprocess.event.transition.evaluated.v2", deliveryState: "DELIVERED",
    },
    orderBy: { sequence: "asc" }, take: 501, select: { payload: true },
  });
  if (occurrenceFacts.length > 500) return null;
  const exactOccurrences = occurrenceFacts.flatMap(({ payload }) => {
    const parsed = TransitionEvaluatedEventV2Schema.safeParse(payload);
    if (!parsed.success) return [];
    const event = parsed.data;
    const exact = event.source === AI_PROCESS_CONSOLE_SOURCE
      && event.metadata.projectId === metadata.projectId && event.metadata.environment === metadata.environment
      && event.metadata.serviceName === metadata.serviceName && event.metadata.processId === metadata.processId
      && event.metadata.processVersion === metadata.processVersion && event.metadata.processDefinitionHash === metadata.processDefinitionHash
      && event.metadata.scope === metadata.scope && event.metadata.caseId === metadata.caseId
      && event.metadata.objectType === metadata.objectType && event.metadata.operationId === metadata.operationId
      && event.metadata.attemptId === metadata.attemptId && event.metadata.executionMode === metadata.executionMode
      && event.metadata.testRunId === metadata.testRunId && event.data.transitionEvaluationId === location.transitionEvaluationId
      && event.data.transitionId === location.transitionId && event.data.sourceNodeId === location.sourceNodeId
      && event.data.targetNodeId === location.targetNodeId;
    return exact ? [event] : [];
  });
  if (exactOccurrences.length !== 1) return null;
  const snapshot = parsedSnapshot.data;
  const edge = snapshot.transitions.find((item) => item.transitionId === location.transitionId && item.sourceNodeId === location.sourceNodeId && item.targetNodeId === location.targetNodeId
    && (snapshot.schemaVersion === "1.0" || "transitionEvaluationId" in item && item.transitionEvaluationId === location.transitionEvaluationId));
  if (!edge) return null;
  return { metadata, location, edge, definition };
}

const outcomes = (requirements: Array<{ requirementId: string; requirementVersion: string; verdict: "PASS" | "WARN" | "BLOCK" | "NOT_EVALUABLE" | "NOT_REACHED" | "NOT_APPLICABLE"; reasonCodes: string[] }>) => requirements.map((item) => ({
  requirementId: item.requirementId,
  requirementVersion: item.requirementVersion,
  outcome: item.verdict === "PASS" || item.verdict === "WARN" || item.verdict === "BLOCK"
    ? { state: "EVALUATED" as const, verdict: item.verdict, reasonCodes: item.reasonCodes }
    : item.verdict === "NOT_EVALUABLE" ? { state: "NOT_EVALUABLE" as const, reasonCode: item.reasonCodes[0] ?? "NOT_EVALUABLE" }
      : item.verdict === "NOT_APPLICABLE" ? { state: "NOT_APPLICABLE" as const, reasonCode: item.reasonCodes[0] ?? "NOT_APPLICABLE" }
        : { state: "NOT_REACHED" as const },
}));

export async function inspectProjectTestSnapshotV2(input: unknown, dependencies: { now?: () => Date; database?: ProjectTestDebugDatabase } = {}) {
  const parsed = ProjectTestSnapshotRequestV2Schema.safeParse(input);
  if (!parsed.success) return v2Unavailable("invalid-request", "REQUEST_INVALID");
  const loaded = await loadV2(parsed.data, dependencies.database);
  if (!loaded) return v2Unavailable(parsed.data.requestId, "SNAPSHOT_NOT_FOUND");
  const { edge, metadata, location } = loaded;
  if (![edge.sourceInput, edge.sourceOutput, edge.targetInput].every((value) => safeCandidate(value))) return v2Unavailable(parsed.data.requestId, "SNAPSHOT_NOT_SAFE");
  const response = ProjectTestSnapshotResponseV2Schema.parse({
    schemaVersion: "2.0", requestId: parsed.data.requestId, status: "AVAILABLE", approval: "PROJECT_TEST_SAFE",
    metadata, location, input: edge.sourceInput, output: edge.sourceOutput, requirements: outcomes(edge.requirements),
    transitionContext: {
      priorNodeInput: edge.sourceInput, priorNodeOutput: edge.sourceOutput,
      condition: { kind: "ALL_REQUIREMENTS", requirementIds: edge.requirements.map((item) => item.requirementId) },
      evaluationInput: edge.sourceInput, targetInput: edge.targetInput, decision: { matched: edge.decision.matched },
    },
    replayReadiness: { state: "READY", observedAt: (dependencies.now ?? (() => new Date()))().toISOString() },
  });
  return utf8Bytes(response) <= 65_536 ? response : v2Unavailable(parsed.data.requestId, "SNAPSHOT_TOO_LARGE");
}

export async function replayProjectTestTransitionV2(input: unknown, dependencies: { createWorkspace?: typeof createIsolatedFixtureWorkspace; cleanupWorkspace?: typeof cleanupIsolatedFixtureWorkspace; createId?: () => string; database?: ProjectTestDebugDatabase } = {}) {
  const parsed = ProjectTransitionReplayRequestV2Schema.safeParse(input);
  if (!parsed.success) return v2Rejected("invalid-request", "invalid-attempt", "REQUEST_INVALID");
  const request = parsed.data;
  if (utf8Bytes(request.candidateInput) > 32_768 || !safeCandidate(request.candidateInput)) return v2Rejected(request.requestId, request.metadata.attemptId, "CANDIDATE_INVALID");
  const loaded = await loadV2(request, dependencies.database);
  if (!loaded) return v2Rejected(request.requestId, request.metadata.attemptId, "SNAPSHOT_NOT_FOUND");
  const createId = dependencies.createId ?? randomUUID;
  const replayAttemptId = `replay-attempt-${createId()}`;
  const replayId = `replay-${createId()}`;
  let workspace: Awaited<ReturnType<typeof createIsolatedFixtureWorkspace>> | null = null;
  try {
    workspace = await (dependencies.createWorkspace ?? createIsolatedFixtureWorkspace)(replayAttemptId);
    const result = evaluatePressTransitionGuardrails({
      edgeId: loaded.edge.transitionId, sourceInput: loaded.edge.sourceInput, sourceOutput: loaded.edge.sourceOutput, targetPayload: request.candidateInput,
      attempt: { teamId: workspace.teamId, articleId: `synthetic-article-${createId()}` },
    });
    const requirements = result.observations.map((item) => ({ requirementId: item.guardrailId, requirementVersion: "1.0.0", outcome: { state: "EVALUATED" as const, verdict: item.verdict, reasonCodes: item.verdict === "PASS" ? [] : [item.origin === "MANDATORY" ? "MANDATORY_GUARDRAIL_FAILED" : "CASE_EXPECTATION_FAILED"] } }));
    const response = ProjectTransitionReplayResponseV2Schema.parse({
      schemaVersion: "2.0", requestId: request.requestId, status: "COMPLETED", approval: "PROJECT_TEST_SAFE", replayId,
      replayOfAttemptId: request.metadata.attemptId, replayAttemptId,
      metadata: { ...request.metadata, operationId: `replay-operation-${createId()}`, attemptId: replayAttemptId },
      transition: request.transition, matched: result.verdict !== "BLOCK", output: request.candidateInput, requirements,
    });
    return utf8Bytes(response) <= 65_536 ? response : v2Rejected(request.requestId, request.metadata.attemptId, "RESPONSE_TOO_LARGE");
  } catch {
    return v2Rejected(request.requestId, request.metadata.attemptId, "ISOLATED_REPLAY_FAILED");
  } finally {
    if (workspace) await (dependencies.cleanupWorkspace ?? cleanupIsolatedFixtureWorkspace)(workspace);
  }
}
