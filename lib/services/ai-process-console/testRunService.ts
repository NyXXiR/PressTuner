import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { EventV1Schema, TestRunRequestedCommandV1Schema, type EventV1, type TestRunRequestedCommandV1 } from "@/domain/ai-process-console/v1/contracts";
import { canonicalJson, sha256Canonical } from "@/domain/ai-process-console/v1/canonicalJson";
import { buildCheckpointOutputReference, createResolvedFactFactory, createUnresolvedRejectionFact, hashPrivateClaim, publishedProcessDefinitionReference, type FactFactory } from "@/domain/ai-process-console/v1/factEvents";
import { resolveSyntheticFixture, type SyntheticFixture } from "@/domain/ai-process-console/v1/fixtureRegistry";
import { AI_PROCESS_CONSOLE_SOURCE, buildProcessDefinition, buildProjectManifest } from "@/domain/ai-process-console/v1/publication";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { prisma } from "@/lib/prisma";
import type { PressAiDependencyOverrides, PressAiCompletionRequest } from "@/lib/services/article/pressAiDependencies";
import { advanceCheckpointEdge, createCheckpointAttempt, executeCheckpointNode, type CheckpointLifecycleHooks } from "@/lib/services/press-ai-debugger/checkpointDebuggerService";
import { cleanupIsolatedFixtureWorkspace, createIsolatedFixtureWorkspace, type IsolatedFixtureWorkspace } from "./isolatedFixtureWorkspace";
import { enqueueAiProcessFact, enqueueNextAiProcessFact, flushAiProcessFactOutbox } from "./factOutbox";
import type { AiProcessFactTransport } from "./factTransport";

type RejectionCode = "FIXTURE_NOT_FOUND" | "DEFINITION_NOT_FOUND" | "ISOLATION_UNAVAILABLE" | "REQUEST_INVALID";
type TestRunOutcome = Readonly<{ status: "SUCCEEDED" | "FAILED" | "REJECTED"; testRunId: string; rejectionCode?: RejectionCode; failureCode?: string; replayed?: boolean }>;

const looseEnvelope = z.object({
  id: z.string().min(1).max(128), source: z.string().min(1).max(256), correlationId: z.string().min(1).max(128),
  data: z.object({ testRunId: z.string().min(1).max(128), projectId: z.string().min(1).max(128), fixture: z.object({ artifactId: z.string().min(1).max(128), sha256: z.string().regex(/^[a-f0-9]{64}$/), locator: z.string().min(1).max(256) }) }).passthrough(),
}).passthrough();

const hashCommand = (command: unknown) => sha256Canonical(command);
const factAttemptId = (command: { source: string; id: string }) => {
  const hash = createHash("sha256").update(`${command.source}:${command.id}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
const safeFailureCode = (error: unknown, fallback = "TEST_RUN_FAILED") => {
  const code = error instanceof Error ? (error as Error & { code?: string }).code : undefined;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{0,99}$/.test(code) ? code : fallback;
};

const factLogicalKey = Object.freeze({
  testRunAccepted: "test-run:accepted",
  testRunRejected: "test-run:rejected",
  testRunCompleted: "test-run:completed",
  attemptStarted: "attempt:started",
  attemptCompleted: "attempt:completed",
  attemptFailed: "attempt:failed",
  nodeStarted: (nodeId: string, commandId: string) => `node:${nodeId}:${commandId}:started`,
  nodeCompleted: (checkpointId: string) => `checkpoint:${checkpointId}:node-completed`,
  nodeFailed: (nodeId: string, commandId: string) => `node:${nodeId}:${commandId}:failed`,
  transitionEvaluated: (transitionId: string) => `transition:${transitionId}:evaluated`,
  evidenceEvaluated: (evidenceEvaluationId: string) => `evidence:${evidenceEvaluationId}:evaluated`,
  transitionSelected: (transitionId: string) => `transition:${transitionId}:selected`,
});

type AttemptTerminalCause = Parameters<NonNullable<CheckpointLifecycleHooks["onAttemptTerminal"]>>[1]["cause"];

function terminalCauseEventId(factory: FactFactory, cause: AttemptTerminalCause): string {
  if (cause.kind === "NODE_COMPLETED") return factory.eventIdFor(factLogicalKey.nodeCompleted(cause.checkpointId));
  if (cause.kind === "NODE_FAILED") return factory.eventIdFor(factLogicalKey.nodeFailed(cause.nodeId, cause.commandId));
  if (cause.kind === "TRANSITION_EVALUATED") return factory.eventIdFor(factLogicalKey.transitionEvaluated(cause.transitionId));
  return factory.eventIdFor(factLogicalKey.evidenceEvaluated(cause.evidenceEvaluationId));
}

export function classifyTestRunRequest(input: unknown): { accepted: true; command: TestRunRequestedCommandV1; fixture: SyntheticFixture } | { accepted: false; code: RejectionCode } {
  const parsed = TestRunRequestedCommandV1Schema.safeParse(input);
  if (!parsed.success) return { accepted: false, code: "REQUEST_INVALID" };
  const manifest = buildProjectManifest();
  if (parsed.data.data.projectId !== manifest.projectId) return { accepted: false, code: "REQUEST_INVALID" };
  if (canonicalJson(parsed.data.data.processDefinition) !== canonicalJson(publishedProcessDefinitionReference)) return { accepted: false, code: "DEFINITION_NOT_FOUND" };
  const fixture = resolveSyntheticFixture(parsed.data.data.fixture);
  if (!fixture) return { accepted: false, code: parsed.data.data.fixture.locator.startsWith("ref:saved-cases/") ? "ISOLATION_UNAVAILABLE" : "FIXTURE_NOT_FOUND" };
  return { accepted: true, command: parsed.data, fixture };
}

function deterministicDependencies(fixture: SyntheticFixture): PressAiDependencyOverrides {
  return {
    now: () => new Date("2030-01-01T00:00:00.000Z"),
    createId: () => "synthetic-session",
    searchKnowledge: async () => ({ hits: [] }),
    loadKnowledgeContexts: async () => ({ stylePolicy: "", styleExamples: "" }),
    completeJson: async (request: PressAiCompletionRequest) => {
      const system = request.messages[0]?.content ?? "";
      const user = request.messages[1]?.content ?? "";
      if (system.includes("브리프를 근거 기반")) {
        if (fixture.scenario === "GUARDRAIL_BLOCK") return JSON.stringify({ serviceName: {}, announceType: {}, oneLiner: {}, points: [], quoteWho: {}, quoteMessage: {}, eventAt: {}, publishAt: {} });
        const candidate = { value: fixture.memoText, sourceId: "memo", evidence: fixture.memoText };
        return JSON.stringify({ serviceName: {}, announceType: { value: "기타", sourceId: "memo", evidence: fixture.memoText }, oneLiner: candidate, points: [candidate], quoteWho: {}, quoteMessage: {}, eventAt: {}, publishAt: {} });
      }
      if (fixture.scenario === "NODE_FAILURE" && fixture.failureNodeId === "draft-generation" && !system.includes("notes 배열") && !system.includes("선택된 수정")) {
        throw Object.assign(new Error("SYNTHETIC_HANDLER_FAILURE"), { code: "SYNTHETIC_HANDLER_FAILURE" });
      }
      if (system.includes("notes 배열")) return JSON.stringify({ notes: [{ quote: "합성 보도자료 리드", note: "합성 문장을 더 명료하게 다듬는다.", type: "HINT", sourceFactIds: [] }] });
      if (system.includes("선택") || user.includes("selected") || user.includes("수정")) return JSON.stringify({ title: "합성 보도자료 수정본", plain: `합성 보도자료 리드\n${fixture.memoText}\n합성 보도자료 마침` });
      return JSON.stringify({ title: "합성 보도자료", lead: "합성 보도자료 리드", fact: fixture.memoText, paragraphs: [{ text: fixture.memoText, importance: 3 }], closing: "합성 보도자료 마침", usedFactIds: [] });
    },
  };
}

function createFactHooks(factory: FactFactory): CheckpointLifecycleHooks {
  const emit = (tx: Prisma.TransactionClient, build: (sequence: number) => EventV1) => enqueueNextAiProcessFact(tx, { source: AI_PROCESS_CONSOLE_SOURCE, attemptId: factory.identity.attemptId, build });
  const node = (nodeId: string) => pressCreationProcess.nodes.find((item) => item.id === nodeId)!;
  return {
    onAttemptCreated: async (tx, event) => { await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.attempt.started.v1", logicalKey: factLogicalKey.attemptStarted, sequence, occurredAt: event.occurredAt, causationId: factory.eventIdFor(factLogicalKey.testRunAccepted), data: { attemptId: event.attemptId } })); },
    onNodeStarted: async (tx, event) => { await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.node.execution.started.v1", logicalKey: factLogicalKey.nodeStarted(event.nodeId, event.commandId), sequence, occurredAt: event.occurredAt, causationId: event.incomingTransitionId ? factory.eventIdFor(factLogicalKey.transitionSelected(event.incomingTransitionId)) : factory.eventIdFor(factLogicalKey.attemptStarted), data: { nodeId: event.nodeId, handlerRef: `presstuner:handler:${node(event.nodeId).operationKey}:v1` } })); },
    onNodeCompleted: async (tx, event) => { await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.node.execution.completed.v1", logicalKey: factLogicalKey.nodeCompleted(event.checkpointId), sequence, occurredAt: event.occurredAt, causationId: factory.eventIdFor(factLogicalKey.nodeStarted(event.nodeId, event.commandId)), data: { nodeId: event.nodeId, handlerRef: `presstuner:handler:${node(event.nodeId).operationKey}:v1`, durationMs: event.durationMs, outputArtifact: buildCheckpointOutputReference({ checkpointId: event.checkpointId, output: event.output }) } })); },
    onNodeFailed: async (tx, event) => { await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.node.execution.failed.v1", logicalKey: factLogicalKey.nodeFailed(event.nodeId, event.commandId), sequence, occurredAt: event.occurredAt, causationId: factory.eventIdFor(factLogicalKey.nodeStarted(event.nodeId, event.commandId)), data: { nodeId: event.nodeId, handlerRef: `presstuner:handler:${node(event.nodeId).operationKey}:v1`, errorCode: /^[A-Z][A-Z0-9_]{0,99}$/.test(event.errorCode) ? event.errorCode : "NODE_EXECUTION_FAILED" } })); },
    onTransitionEvaluated: async (tx, event) => { await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.transition.evaluated.v1", logicalKey: factLogicalKey.transitionEvaluated(event.transitionId), sequence, occurredAt: event.occurredAt, causationId: factory.eventIdFor(factLogicalKey.nodeCompleted(event.sourceCheckpointId)), data: { transitionId: event.edgeId, sourceNodeId: event.sourceNodeId, targetNodeId: event.targetNodeId, matched: event.matched, decisionRef: `presstuner:decision:${event.edgeId}:v1` } })); },
    onTransitionSelected: async (tx, event) => { await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.transition.selected.v1", logicalKey: factLogicalKey.transitionSelected(event.transitionId), sequence, occurredAt: event.occurredAt, causationId: factory.eventIdFor(event.evidenceEvaluationId ? factLogicalKey.evidenceEvaluated(event.evidenceEvaluationId) : factLogicalKey.transitionEvaluated(event.transitionId)), data: { transitionId: event.edgeId, sourceNodeId: event.sourceNodeId, targetNodeId: event.targetNodeId, decisionRef: `presstuner:decision:${event.edgeId}:v1` } })); },
    onEvidenceEvaluated: async (tx, event) => {
      const definitionNode = buildProcessDefinition().nodes.find((item) => item.nodeId === event.nodeId)!;
      await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.evidence.evaluated.v1", logicalKey: factLogicalKey.evidenceEvaluated(event.evidenceEvaluationId), sequence, occurredAt: event.occurredAt, causationId: factory.eventIdFor(factLogicalKey.transitionEvaluated(event.transitionId)), data: { nodeId: event.nodeId, policy: definitionNode.evidencePolicy, evaluations: event.evaluations.slice(0, 100).map((item) => ({ claimId: item.claimId, claimSha256: hashPrivateClaim(item.claimText), result: item.result, evidenceArtifacts: [], evaluatorRef: item.evaluatorRef, reasonCodes: [...item.reasonCodes] })) } }));
    },
    onAttemptTerminal: async (tx, event) => {
      const causationId = terminalCauseEventId(factory, event.cause);
      if (event.status === "COMPLETED" && event.cause.kind === "NODE_COMPLETED") {
        const cause = event.cause;
        await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.attempt.completed.v1", logicalKey: factLogicalKey.attemptCompleted, sequence, occurredAt: event.occurredAt, causationId, data: { attemptId: event.attemptId, resultArtifact: buildCheckpointOutputReference({ checkpointId: cause.checkpointId, output: cause.output }) } }));
      }
      else await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.attempt.failed.v1", logicalKey: factLogicalKey.attemptFailed, sequence, occurredAt: event.occurredAt, causationId, data: { attemptId: event.attemptId, failureCode: (event.failureCode ?? (event.status === "BLOCKED" ? "TRANSITION_GUARDRAIL_BLOCK" : "ATTEMPT_FAILED")).replace(/[^A-Za-z0-9._:/+-]/g, "_").slice(0, 128) } }));
    },
  };
}

async function runFixture(args: { fixture: SyntheticFixture; workspace: IsolatedFixtureWorkspace; attemptId: string; factory: FactFactory }): Promise<{ outcome: "SUCCEEDED" | "FAILED"; failureCode?: string }> {
  const hooks = createFactHooks(args.factory);
  const dependencies = deterministicDependencies(args.fixture);
  await createCheckpointAttempt({ teamId: args.workspace.teamId, userId: args.workspace.userId, hooks, input: { commandId: args.attemptId, expectedRevision: 0, rawText: args.fixture.memoText, tone: args.fixture.tone, reviewInstruction: args.fixture.reviewInstruction, rewriteInstruction: args.fixture.rewriteInstruction } });
  let revision = 0;
  for (const node of pressCreationProcess.nodes.slice().sort((a, b) => a.sequence - b.sequence)) {
    const executeId = `execute-${node.sequence}-${args.attemptId.slice(-32)}`;
    const executed = await executeCheckpointNode({ teamId: args.workspace.teamId, userId: args.workspace.userId, attemptId: args.attemptId, nodeId: node.id, hooks, dependencies, input: { commandId: executeId, expectedRevision: revision, ...(node.id === "draft-review" ? { selectedNoteIds: [...args.fixture.selectedNoteIds], rewriteInstruction: args.fixture.rewriteInstruction } : {}) } });
    revision = executed.response.revision;
    if (executed.response.status === "BLOCKED") return { outcome: "FAILED", failureCode: "TRANSITION_GUARDRAIL_BLOCK" };
    if (executed.response.status === "COMPLETED") return { outcome: "SUCCEEDED" };
    const edge = pressCreationProcess.edges.find((item) => item.source === node.id);
    if (!edge) return { outcome: "FAILED", failureCode: "TRANSITION_NOT_FOUND" };
    const advanced = await advanceCheckpointEdge({ teamId: args.workspace.teamId, userId: args.workspace.userId, attemptId: args.attemptId, edgeId: edge.id, hooks, input: { commandId: `advance-${edge.sequence}-${args.attemptId.slice(-32)}`, expectedRevision: revision, acknowledgeWarn: true, acknowledgeHumanGate: Boolean(edge.humanGate) } });
    revision = advanced.response.revision;
  }
  return { outcome: "FAILED", failureCode: "TERMINAL_NOT_REACHED" };
}

async function persistRejection(args: { input: z.infer<typeof looseEnvelope>; code: RejectionCode; commandHash: string }): Promise<TestRunOutcome> {
  const attemptId = factAttemptId(args.input);
  const existing = await prisma.aiProcessTestRun.findUnique({ where: { commandSource_commandId: { commandSource: args.input.source, commandId: args.input.id } } });
  if (existing) {
    if (existing.commandHash !== args.commandHash) throw new Error("AI_PROCESS_COMMAND_REUSE_CONFLICT");
    return { status: "REJECTED", testRunId: existing.testRunId, rejectionCode: existing.rejectionCode as RejectionCode, replayed: true };
  }
  await prisma.$transaction(async (tx) => {
    await tx.aiProcessTestRun.create({ data: { commandSource: args.input.source, commandId: args.input.id, commandHash: args.commandHash, projectId: args.input.data.projectId, testRunId: args.input.data.testRunId, correlationId: args.input.correlationId, fixtureArtifactId: args.input.data.fixture.artifactId, fixtureSha256: args.input.data.fixture.sha256, fixtureLocator: args.input.data.fixture.locator, factAttemptId: attemptId, status: "REJECTED", rejectionCode: args.code, completedAt: new Date() } });
    if (args.code === "FIXTURE_NOT_FOUND" || args.code === "ISOLATION_UNAVAILABLE") {
      const factory = createResolvedFactFactory({ identity: { caseId: args.input.correlationId, objectType: "synthetic-press-fixture", operationId: args.input.id, attemptId, correlationId: args.input.correlationId, testRunId: args.input.data.testRunId } });
      await enqueueAiProcessFact(tx, { attemptId, event: factory.create({ type: "dev.aiprocess.event.test-run.rejected.v1", logicalKey: factLogicalKey.testRunRejected, sequence: 1, causationId: args.input.id, data: { testRunId: args.input.data.testRunId, reasonCode: args.code } }) });
    } else {
      const event = createUnresolvedRejectionFact({ testRunId: args.input.data.testRunId, correlationId: args.input.correlationId, commandId: args.input.id, reasonCode: args.code });
      await enqueueAiProcessFact(tx, { attemptId, event });
    }
  });
  return { status: "REJECTED", testRunId: args.input.data.testRunId, rejectionCode: args.code };
}

export function createAiProcessTestRunService(dependencies: { transport?: AiProcessFactTransport; createWorkspace?: typeof createIsolatedFixtureWorkspace; cleanupWorkspace?: typeof cleanupIsolatedFixtureWorkspace } = {}) {
  const createWorkspace = dependencies.createWorkspace ?? createIsolatedFixtureWorkspace;
  const cleanupWorkspace = dependencies.cleanupWorkspace ?? cleanupIsolatedFixtureWorkspace;
  return {
    async handle(input: unknown): Promise<TestRunOutcome> {
      const classification = classifyTestRunRequest(input);
      const loose = looseEnvelope.safeParse(input);
      if (!classification.accepted) {
        if (!loose.success) return { status: "REJECTED", testRunId: "unresolved", rejectionCode: classification.code };
        const outcome = await persistRejection({ input: loose.data, code: classification.code, commandHash: hashCommand(input) });
        await flushAiProcessFactOutbox({ transport: dependencies.transport });
        return outcome;
      }
      const { command, fixture } = classification;
      const commandHash = hashCommand(command);
      const existing = await prisma.aiProcessTestRun.findUnique({ where: { commandSource_commandId: { commandSource: command.source, commandId: command.id } } });
      if (existing) {
        if (existing.commandHash !== commandHash) throw new Error("AI_PROCESS_COMMAND_REUSE_CONFLICT");
        return { status: existing.status === "SUCCEEDED" ? "SUCCEEDED" : existing.status === "REJECTED" ? "REJECTED" : "FAILED", testRunId: existing.testRunId, rejectionCode: existing.rejectionCode as RejectionCode | undefined, failureCode: existing.failureCode ?? undefined, replayed: true };
      }
      const attemptId = factAttemptId(command);
      const identity = {
        caseId: command.correlationId, objectType: "synthetic-press-fixture", operationId: command.id,
        attemptId, correlationId: command.correlationId, testRunId: command.data.testRunId,
        trace: command.trace, observabilityReferences: command.observabilityReferences,
      };
      const factory = createResolvedFactFactory({ identity });
      const receipt = await prisma.aiProcessTestRun.create({ data: { commandSource: command.source, commandId: command.id, commandHash, projectId: command.data.projectId, testRunId: command.data.testRunId, correlationId: command.correlationId, processId: "press-creation", processVersion: "2.1.0", processDefinitionHash: buildProcessDefinition().canonicalSha256, fixtureArtifactId: command.data.fixture.artifactId, fixtureSha256: command.data.fixture.sha256, fixtureLocator: command.data.fixture.locator, factAttemptId: attemptId, status: "RECEIVED" } });
      let workspace: IsolatedFixtureWorkspace | null = null;
      let result: { outcome: "SUCCEEDED" | "FAILED"; failureCode?: string } = { outcome: "FAILED", failureCode: "TEST_RUN_FAILED" };
      try {
        workspace = await createWorkspace(command.data.testRunId);
      } catch {
        await prisma.$transaction(async (tx) => {
          await tx.aiProcessTestRun.update({ where: { id: receipt.id }, data: { status: "REJECTED", rejectionCode: "ISOLATION_UNAVAILABLE", completedAt: new Date() } });
          await enqueueNextAiProcessFact(tx, { source: AI_PROCESS_CONSOLE_SOURCE, attemptId, build: (sequence) => factory.create({ type: "dev.aiprocess.event.test-run.rejected.v1", logicalKey: factLogicalKey.testRunRejected, sequence, causationId: command.id, data: { testRunId: command.data.testRunId, reasonCode: "ISOLATION_UNAVAILABLE" } }) });
        });
        await flushAiProcessFactOutbox({ transport: dependencies.transport });
        return { status: "REJECTED", testRunId: command.data.testRunId, rejectionCode: "ISOLATION_UNAVAILABLE" };
      }
      await prisma.$transaction(async (tx) => {
        await tx.aiProcessTestRun.update({ where: { id: receipt.id }, data: { status: "RUNNING", startedAt: new Date() } });
        await enqueueNextAiProcessFact(tx, { source: AI_PROCESS_CONSOLE_SOURCE, attemptId, build: (sequence) => factory.create({ type: "dev.aiprocess.event.test-run.accepted.v1", logicalKey: factLogicalKey.testRunAccepted, sequence, causationId: command.id, data: { testRunId: command.data.testRunId, processDefinition: publishedProcessDefinitionReference } }) });
      });
      let attemptTerminalEventId = factory.eventIdFor(factLogicalKey.attemptFailed);
      try {
        result = await runFixture({ fixture, workspace, attemptId, factory });
        attemptTerminalEventId = factory.eventIdFor(result.outcome === "SUCCEEDED" ? factLogicalKey.attemptCompleted : factLogicalKey.attemptFailed);
      } catch (error) {
        result = { outcome: "FAILED", failureCode: safeFailureCode(error) };
        const terminal = await prisma.aiProcessFactOutbox.findFirst({ where: { source: AI_PROCESS_CONSOLE_SOURCE, attemptId, eventType: "dev.aiprocess.event.attempt.failed.v1" }, select: { id: true } });
        if (!terminal) {
          const nodeFailure = await prisma.aiProcessFactOutbox.findFirst({ where: { source: AI_PROCESS_CONSOLE_SOURCE, attemptId, eventType: "dev.aiprocess.event.node.execution.failed.v1" }, orderBy: { sequence: "desc" }, select: { payload: true } });
          const causationId = nodeFailure ? EventV1Schema.parse(nodeFailure.payload).id : factory.eventIdFor(factLogicalKey.testRunAccepted);
          try { await prisma.$transaction(async (tx) => enqueueNextAiProcessFact(tx, { source: AI_PROCESS_CONSOLE_SOURCE, attemptId, build: (sequence) => factory.create({ type: "dev.aiprocess.event.attempt.failed.v1", logicalKey: factLogicalKey.attemptFailed, sequence, causationId, data: { attemptId, failureCode: result.failureCode ?? "TEST_RUN_FAILED" } }) })); }
          catch { /* Fact persistence cannot bypass isolated-workspace cleanup. */ }
        }
      }
      let cleanupFailure: string | null = null;
      if (workspace) {
        try { await cleanupWorkspace(workspace); }
        catch { cleanupFailure = "ISOLATION_CLEANUP_FAILED"; }
      }
      if (cleanupFailure) result = { outcome: "FAILED", failureCode: cleanupFailure };
      await prisma.$transaction(async (tx) => {
        await tx.aiProcessTestRun.update({ where: { id: receipt.id }, data: { status: result.outcome, failureCode: result.failureCode, completedAt: new Date() } });
        await enqueueNextAiProcessFact(tx, { source: AI_PROCESS_CONSOLE_SOURCE, attemptId, build: (sequence) => factory.create({ type: "dev.aiprocess.event.test-run.completed.v1", logicalKey: factLogicalKey.testRunCompleted, sequence, causationId: attemptTerminalEventId, data: { testRunId: command.data.testRunId, outcome: result.outcome } }) });
      });
      await flushAiProcessFactOutbox({ transport: dependencies.transport });
      return { status: result.outcome, testRunId: command.data.testRunId, failureCode: result.failureCode };
    },
  };
}

export type { TestRunOutcome };
