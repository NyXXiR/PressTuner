import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { fixtureRegistry } from "@/domain/ai-process-console/v1/fixtureRegistry";
import { AI_PROCESS_CONSOLE_SOURCE, buildProcessDefinition, buildProjectManifest, processDefinitionReference } from "@/domain/ai-process-console/v1/publication";
import { EventV1Schema, findForbiddenIntegrationPaths, type EventV1 } from "@/domain/ai-process-console/v1/contracts";
import { createAiProcessTestRunService } from "./testRunService";
import { createHttpAiProcessFactTransport } from "./httpFactTransport.server";
import { createAiProcessTestRunPostHandler } from "./adapterRoutes.server";
import { signAiProcessRequest } from "./requestAuthentication";
import { readAiProcessProducerHealth } from "./producerHealth";
import { retainDeliveredAiProcessFacts } from "./deliveredFactRetention";
import { EventV2Schema } from "@/domain/ai-process-console/v2/contracts";
import { fixtureRegistryV2 } from "@/domain/ai-process-console/v2/fixtureRegistry";
import { buildProcessDefinitionV2 } from "@/domain/ai-process-console/v2/publication";
import { inspectProjectTestSnapshot, replayProjectTestTransition } from "./projectTestDebugService";

const receiptIds: string[] = [];
const attemptIds: string[] = [];

function command(fixtureIndex: number) {
  const suffix = randomUUID();
  return {
    specversion: "1.0", id: `command-${suffix}`, source: "urn:ai-process-console:test-runs", subject: "project/presstuner",
    time: "2030-01-01T00:00:00.000Z", schemaVersion: "1.0", correlationId: `correlation-${suffix}`, sequence: 0, executionMode: "TEST",
    type: "dev.aiprocess.command.test-run.requested.v1", data: { testRunId: `test-run-${suffix}`, projectId: buildProjectManifest().projectId, processDefinition: processDefinitionReference(buildProcessDefinition()), fixture: fixtureRegistry[fixtureIndex].artifact },
  } as const;
}

function commandV2(fixtureIndex: number) {
  const suffix = randomUUID();
  return {
    specversion: "1.0", id: `command-v2-${suffix}`, source: "urn:ai-process-console:test-runs", subject: "project/presstuner",
    time: "2030-01-01T00:00:00.000Z", schemaVersion: "1.0", correlationId: `correlation-v2-${suffix}`, sequence: 0, executionMode: "TEST",
    type: "dev.aiprocess.command.test-run.requested.v1", data: { testRunId: `test-run-v2-${suffix}`, projectId: buildProjectManifest().projectId, processDefinition: processDefinitionReference(buildProcessDefinitionV2()), fixture: fixtureRegistryV2[fixtureIndex].artifact },
  } as const;
}

async function remember(testRunId: string) {
  const receipt = await prisma.aiProcessTestRun.findUniqueOrThrow({ where: { projectId_testRunId: { projectId: "presstuner", testRunId } } });
  receiptIds.push(receipt.id); attemptIds.push(receipt.factAttemptId);
  return receipt;
}

test.before(async () => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.match(new URL(process.env.DATABASE_URL ?? "").pathname.slice(1), /(^|[_-])test($|[_-])/i);
  await prisma.aiProcessFactOutbox.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } });
  await prisma.aiProcessProducerDeliveryWatermark.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } });
  await prisma.aiProcessTestRun.deleteMany({ where: { projectId: "presstuner" } });
});

test.afterEach(async () => {
  if (attemptIds.length) await prisma.aiProcessFactOutbox.deleteMany({ where: { attemptId: { in: attemptIds } } });
  if (receiptIds.length) await prisma.aiProcessTestRun.deleteMany({ where: { id: { in: receiptIds } } });
  await prisma.aiProcessProducerDeliveryWatermark.deleteMany({ where: { source: AI_PROCESS_CONSOLE_SOURCE } });
  attemptIds.length = 0;
  receiptIds.length = 0;
});

test.after(async () => {
  await prisma.$disconnect();
});

test("successful isolated run emits a coherent monotonic terminal fact stream and cleans its tenant", async () => {
  const input = {
    ...command(0),
    trace: { provider: "OPENTELEMETRY" as const, traceId: "trace-synthetic-run", spanId: "span-synthetic-run", link: { label: "trace", url: "https://example.invalid/trace/synthetic" } },
    observabilityReferences: [{ provider: "POSTHOG" as const, metricKey: "test-run-success", windowStart: "2030-01-01T00:00:00.000Z", windowEnd: "2030-01-01T01:00:00.000Z", link: { label: "metric", url: "https://example.invalid/posthog/synthetic" } }],
  };
  const sentinel = await prisma.team.create({ data: { slug: `aipc-sentinel-${randomUUID()}`, name: "sentinel" } });
  try {
    const result = await createAiProcessTestRunService().handle(input);
    assert.equal(result.status, "SUCCEEDED");
    const receipt = await remember(input.data.testRunId);
    assert.equal(receipt.status, "SUCCEEDED");
    const facts = await prisma.aiProcessFactOutbox.findMany({ where: { attemptId: receipt.factAttemptId }, orderBy: { sequence: "asc" } });
    assert.deepEqual(facts.map((row) => row.sequence), facts.map((_, index) => index + 1));
    assert.equal(facts[0].eventType, "dev.aiprocess.event.test-run.accepted.v1");
    assert.equal(facts.at(-1)?.eventType, "dev.aiprocess.event.test-run.completed.v1");
    assert.equal(facts.filter((row) => row.eventType === "dev.aiprocess.event.node.execution.completed.v1").length, 5);
    const payloads = facts.map((row) => EventV1Schema.parse(row.payload));
    for (const event of payloads) {
      assert.deepEqual(findForbiddenIntegrationPaths(event), []);
      assert.equal(event.metadata?.caseId, input.correlationId);
      assert.equal(event.metadata?.operationId, input.id);
      assert.equal(event.metadata?.attemptId, receipt.factAttemptId);
      assert.notEqual(event.metadata?.attemptId, event.metadata?.caseId);
      assert.notEqual(event.metadata?.attemptId, event.metadata?.operationId);
    }
    const accepted = EventV1Schema.parse(facts[0].payload);
    assert.deepEqual(accepted.trace, { provider: "OPENTELEMETRY", traceId: "trace-synthetic-run", spanId: "span-synthetic-run" });
    assert.deepEqual(accepted.observabilityReferences, [{ provider: "POSTHOG", metricKey: "test-run-success", windowStart: "2030-01-01T00:00:00.000Z", windowEnd: "2030-01-01T01:00:00.000Z" }]);
    assert.equal(accepted.metadata?.traceId, "trace-synthetic-run");
    assert.equal(accepted.metadata?.spanId, "span-synthetic-run");
    assert.equal(accepted.causationId, input.id);
    const attemptStarted = payloads.find((event) => event.type === "dev.aiprocess.event.attempt.started.v1")!;
    assert.equal(attemptStarted.causationId, accepted.id);
    for (const node of buildProcessDefinition().nodes) {
      const started = payloads.find((event) => event.type === "dev.aiprocess.event.node.execution.started.v1" && event.data.nodeId === node.nodeId)!;
      const completed = payloads.find((event) => event.type === "dev.aiprocess.event.node.execution.completed.v1" && event.data.nodeId === node.nodeId)! as Extract<EventV1, { type: "dev.aiprocess.event.node.execution.completed.v1" }>;
      assert.equal(completed.causationId, started.id);
      assert.ok(completed.data.outputArtifact);
      assert.equal("summary" in completed.data.outputArtifact, false);
      const incoming = buildProcessDefinition().transitions.find((transition) => transition.targetNodeId === node.nodeId);
      if (!incoming) assert.equal(started.causationId, attemptStarted.id);
      else {
        const selected = payloads.find((event) => event.type === "dev.aiprocess.event.transition.selected.v1" && event.data.transitionId === incoming.transitionId)!;
        assert.equal(started.causationId, selected.id);
      }
    }
    const startedIds = payloads
      .filter((event) => event.type === "dev.aiprocess.event.node.execution.started.v1")
      .map((event) => event.id);
    assert.equal(new Set(startedIds).size, startedIds.length);
    for (const transition of buildProcessDefinition().transitions) {
      const sourceCompleted = payloads.find((event) => event.type === "dev.aiprocess.event.node.execution.completed.v1" && event.data.nodeId === transition.sourceNodeId)!;
      const evaluated = payloads.find((event) => event.type === "dev.aiprocess.event.transition.evaluated.v1" && event.data.transitionId === transition.transitionId)!;
      const evidence = payloads.find((event) => event.type === "dev.aiprocess.event.evidence.evaluated.v1" && event.data.nodeId === transition.sourceNodeId);
      const selected = payloads.find((event) => event.type === "dev.aiprocess.event.transition.selected.v1" && event.data.transitionId === transition.transitionId)!;
      assert.equal(evaluated.causationId, sourceCompleted.id);
      if (evidence) assert.equal(evidence.causationId, evaluated.id);
      assert.equal(selected.causationId, evidence?.id ?? evaluated.id);
    }
    const terminalNode = buildProcessDefinition().nodes.find((node) => node.kind === "TERMINAL")!;
    const terminalNodeCompleted = payloads.find((event) => event.type === "dev.aiprocess.event.node.execution.completed.v1" && event.data.nodeId === terminalNode.nodeId)! as Extract<EventV1, { type: "dev.aiprocess.event.node.execution.completed.v1" }>;
    const attemptCompleted = payloads.find((event) => event.type === "dev.aiprocess.event.attempt.completed.v1")! as Extract<EventV1, { type: "dev.aiprocess.event.attempt.completed.v1" }>;
    const testRunCompleted = payloads.find((event) => event.type === "dev.aiprocess.event.test-run.completed.v1")!;
    assert.deepEqual(attemptCompleted.data.resultArtifact, terminalNodeCompleted.data.outputArtifact);
    assert.equal(attemptCompleted.causationId, terminalNodeCompleted.id);
    assert.equal(testRunCompleted.causationId, attemptCompleted.id);
    assert.equal(await prisma.team.findUnique({ where: { id: sentinel.id } }) !== null, true);
    assert.equal(await prisma.team.count({ where: { slug: { startsWith: "aipc-" }, id: { not: sentinel.id } } }), 0);
    const replay = await createAiProcessTestRunService().handle(input);
    assert.equal(replay.replayed, true);
    assert.equal(await prisma.aiProcessFactOutbox.count({ where: { attemptId: receipt.factAttemptId } }), facts.length);
  } finally { await prisma.team.delete({ where: { id: sentinel.id } }).catch(() => undefined); }
});

test("ten v2 isolated attempts keep execution success separate from one exact quality BLOCK", async () => {
  const commands = Array.from({ length: 10 }, (_, index) => commandV2(index === 6 ? 1 : 0));
  const finalOutcomes: string[] = [];
  for (const input of commands) {
    const result = await createAiProcessTestRunService().handle(input);
    assert.equal(result.status, "SUCCEEDED");
    const receipt = await remember(input.data.testRunId);
    assert.equal(receipt.processVersion, "3.0.0");
    assert.notEqual(receipt.debugSnapshot, null);
    const rows = await prisma.aiProcessFactOutbox.findMany({ where: { attemptId: receipt.factAttemptId }, orderBy: { sequence: "asc" } });
    assert.deepEqual(rows.map((row) => row.sequence), rows.map((_, index) => index + 1));
    const facts = rows.map((row) => EventV2Schema.parse(row.payload));
    assert.equal(facts[0].type, "dev.aiprocess.event.attempt.started.v2");
    assert.equal(facts.at(-1)?.type, "dev.aiprocess.event.attempt.completed.v2");
    assert.equal(facts.filter((event) => event.type === "dev.aiprocess.event.node.execution.completed.v2").length, 5);
    const final = facts.find((event) => event.type === "dev.aiprocess.event.requirement.observed.v2" && event.data.requirementId === "final-output-quality");
    assert.ok(final && final.type === "dev.aiprocess.event.requirement.observed.v2");
    finalOutcomes.push(final.data.outcome.state === "EVALUATED" ? final.data.outcome.verdict : final.data.outcome.state);
    assert.deepEqual(final.data.occurrence, { kind: "NODE", nodeId: "selected-rewrite", nodeExecutionId: final.data.occurrence.kind === "NODE" ? final.data.occurrence.nodeExecutionId : "" });
    assert.equal(final.causationId, final.data.observedForEventId);
    if (input.data.fixture.artifactId === fixtureRegistryV2[1].artifact.artifactId) {
      const definition = buildProcessDefinitionV2();
      const exact = { projectId: "presstuner", environment: "conformance", processId: definition.processId, processVersion: definition.version, processDefinitionHash: definition.canonicalSha256, executionMode: "TEST" as const, caseId: input.correlationId, attemptId: receipt.factAttemptId };
      const node = await inspectProjectTestSnapshot({ schemaVersion: "1.0", requestId: "inspect-block-node", ...exact, location: { kind: "NODE", nodeId: "selected-rewrite" } });
      assert.equal(node.status, "AVAILABLE");
      assert.equal(node.status === "AVAILABLE" && node.snapshot.kind === "NODE" && node.snapshot.nodeId, "selected-rewrite");
      assert.equal(node.status === "AVAILABLE" && node.snapshot.kind === "NODE" && node.snapshot.output.title, " ");
      assert.deepEqual(node.status === "AVAILABLE" && node.snapshot.kind === "NODE" ? node.snapshot.requirements : [], [{ requirementId: "final-output-quality", requirementVersion: "1.0.0", verdict: "BLOCK", reasonCodes: ["EMPTY_FINAL_OUTPUT"] }]);
      const replay = await replayProjectTestTransition({ schemaVersion: "1.0", requestId: "replay-review-edge", ...exact, transition: { transitionId: "review-rewrite", sourceNodeId: "draft-review", targetNodeId: "selected-rewrite" }, candidateInput: { articleId: "synthetic", selectedNoteIds: [], userInstruction: "" } });
      assert.equal(replay.status, "COMPLETED");
      assert.equal(replay.status === "COMPLETED" && replay.decision.matched, false);
      assert.ok(replay.status === "COMPLETED" && replay.requirements.some((item) => item.verdict === "BLOCK"));
    }
  }
  assert.equal(finalOutcomes.filter((outcome) => outcome === "PASS").length, 9);
  assert.equal(finalOutcomes.filter((outcome) => outcome === "BLOCK").length, 1);
});

test("a recoverable conflicting command persists one minimal rejection fact across replay", async () => {
  const input = {
    ...command(0),
    trace: { provider: "LANGSMITH" as const, traceId: "trace-1" },
    observabilityReferences: [{ provider: "OPENTELEMETRY" as const, traceId: "trace-2" }],
  };
  const service = createAiProcessTestRunService();
  const first = await service.handle(input);
  assert.deepEqual(first.status, "REJECTED");
  assert.equal(first.rejectionCode, "REQUEST_INVALID");
  const receipt = await remember(input.data.testRunId);
  assert.equal(receipt.processId, null);
  assert.equal(receipt.processDefinitionHash, null);
  const beforeReplay = await prisma.aiProcessFactOutbox.findMany({ where: { attemptId: receipt.factAttemptId } });
  assert.equal(beforeReplay.length, 1);
  const rejection = EventV1Schema.parse(beforeReplay[0].payload);
  assert.equal(rejection.type, "dev.aiprocess.event.test-run.rejected.v1");
  assert.equal(rejection.metadata?.processId, undefined);
  assert.equal(rejection.metadata?.attemptId, undefined);
  assert.equal(rejection.metadata?.caseId, undefined);
  assert.equal(rejection.metadata?.operationId, undefined);
  const replay = await service.handle(input);
  assert.equal(replay.replayed, true);
  assert.equal(await prisma.aiProcessFactOutbox.count({ where: { attemptId: receipt.factAttemptId } }), 1);
});

test("guardrail block emits no selected transition after the block", async () => {
  const input = command(1);
  const result = await createAiProcessTestRunService().handle(input);
  assert.equal(result.status, "FAILED");
  assert.equal(result.failureCode, "TRANSITION_GUARDRAIL_BLOCK");
  const receipt = await remember(input.data.testRunId);
  const facts = await prisma.aiProcessFactOutbox.findMany({ where: { attemptId: receipt.factAttemptId }, orderBy: { sequence: "asc" } });
  const payloads = facts.map((row) => EventV1Schema.parse(row.payload));
  const failed = payloads.find((event) => event.type === "dev.aiprocess.event.attempt.failed.v1")!;
  const blockingEvaluation = payloads.findLast((event) => event.type === "dev.aiprocess.event.evidence.evaluated.v1" || event.type === "dev.aiprocess.event.transition.evaluated.v1")!;
  const testRunCompleted = payloads.find((event) => event.type === "dev.aiprocess.event.test-run.completed.v1")!;
  assert.equal(failed.causationId, blockingEvaluation.id);
  assert.equal("resultArtifact" in failed.data, false);
  assert.equal(testRunCompleted.causationId, failed.id);
  assert.equal(payloads.some((event) => event.type === "dev.aiprocess.event.transition.selected.v1" && event.data.transitionId === "brief-draft"), false);
});

test("deterministic node failure is terminal and delivery exceptions do not change its receipt", async () => {
  const input = command(2);
  let requests = 0;
  const transport = createHttpAiProcessFactTransport({
    destinationUrl: new URL("https://console.example.test/facts"), outboundHmacSecret: "o".repeat(32), timeoutMs: 3000,
    fetch: async () => { requests += 1; throw new Error("offline"); },
  });
  const result = await createAiProcessTestRunService({ transport }).handle(input);
  assert.equal(result.status, "FAILED");
  const receipt = await remember(input.data.testRunId);
  assert.equal(receipt.status, "FAILED");
  const facts = await prisma.aiProcessFactOutbox.findMany({ where: { attemptId: receipt.factAttemptId }, orderBy: { sequence: "asc" } });
  assert.ok(facts.some((row) => row.eventType === "dev.aiprocess.event.node.execution.failed.v1"));
  const failedPayloads = facts.map((row) => EventV1Schema.parse(row.payload));
  const nodeFailed = failedPayloads.find((event) => event.type === "dev.aiprocess.event.node.execution.failed.v1")!;
  const attemptFailed = failedPayloads.find((event) => event.type === "dev.aiprocess.event.attempt.failed.v1")!;
  const testRunCompleted = failedPayloads.find((event) => event.type === "dev.aiprocess.event.test-run.completed.v1")!;
  assert.equal(attemptFailed.causationId, nodeFailed.id);
  assert.equal("resultArtifact" in attemptFailed.data, false);
  assert.equal(testRunCompleted.causationId, attemptFailed.id);
  assert.ok(facts.some((row) => row.deliveryState === "PENDING" && row.attemptCount > 0));
  assert.ok(requests > 0);
});

test("definition and fixture rejections create safe terminal receipts without a fixture workspace", async () => {
  const invalidDefinition = command(0);
  const definitionResult = await createAiProcessTestRunService().handle({ ...invalidDefinition, data: { ...invalidDefinition.data, processDefinition: { ...invalidDefinition.data.processDefinition, sha256: "0".repeat(64) } } });
  assert.deepEqual(definitionResult.status, "REJECTED");
  const definitionReceipt = await remember(invalidDefinition.data.testRunId);
  assert.equal(definitionReceipt.processId, null);

  const invalidFixture = command(0);
  const fixtureResult = await createAiProcessTestRunService().handle({ ...invalidFixture, data: { ...invalidFixture.data, fixture: { ...invalidFixture.data.fixture, sha256: "0".repeat(64) } } });
  assert.equal(fixtureResult.status, "REJECTED");
  const fixtureReceipt = await remember(invalidFixture.data.testRunId);
  assert.equal(fixtureReceipt.rejectionCode, "FIXTURE_NOT_FOUND");
  const fixtureFacts = await prisma.aiProcessFactOutbox.findMany({ where: { attemptId: fixtureReceipt.factAttemptId } });
  assert.equal(fixtureFacts.length, 1);
  const fixtureRejection = EventV1Schema.parse(fixtureFacts[0].payload);
  assert.equal(fixtureRejection.metadata?.caseId, invalidFixture.correlationId);
  assert.equal(fixtureRejection.metadata?.operationId, invalidFixture.id);
  assert.equal(fixtureRejection.metadata?.attemptId, fixtureReceipt.factAttemptId);
});

test("authenticated adapter acceptance delivers, reports health, retains facts, and preserves receipt plus watermark", async () => {
  const input = command(0);
  const rawBody = JSON.stringify(input);
  const routeNow = new Date("2030-01-01T00:05:00.000Z");
  const settings = {
    destinationId: "presstuner.ai-process-console.fact-ingest.v1" as const,
    destinationUrl: new URL("https://console.example.test/facts"),
    inboundHmacSecret: "i".repeat(32), outboundHmacSecret: "o".repeat(32), httpTimeoutMs: 3000,
    authMaxSkewSeconds: 300, flushBatchSize: 50, deliveredRetentionDays: 30, retentionBatchSize: 1000, pendingDegradedAfterSeconds: 900,
  };
  const configuration = { status: "VALID" as const, code: "VALID" as const, settings };
  const authentication = signAiProcessRequest({ secret: settings.inboundHmacSecret, timestamp: "1893456300", method: "POST", pathname: "/api/internal/ai-process-console/v1/test-runs", body: rawBody });
  let deliveredRequests = 0;
  const post = createAiProcessTestRunPostHandler({
    loadConfiguration: () => configuration,
    clock: () => routeNow,
    createTransport: () => createHttpAiProcessFactTransport({
      destinationUrl: settings.destinationUrl, outboundHmacSecret: settings.outboundHmacSecret, timeoutMs: settings.httpTimeoutMs, clock: () => routeNow,
      fetch: async () => { deliveredRequests += 1; return new Response(null, { status: 200 }); },
    }),
  });
  const response = await post(new Request("https://app.example.test/api/internal/ai-process-console/v1/test-runs", {
    method: "POST", headers: { "content-type": "application/json", "x-ai-process-timestamp": authentication.timestamp, "x-ai-process-signature": authentication.signature }, body: rawBody,
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "SUCCEEDED");
  const receipt = await remember(input.data.testRunId);
  assert.ok(deliveredRequests > 0);
  assert.equal(await prisma.aiProcessFactOutbox.count({ where: { attemptId: receipt.factAttemptId, deliveryState: "DELIVERED" } }), deliveredRequests);
  const healthy = await readAiProcessProducerHealth({ configuration, now: routeNow });
  assert.equal(healthy.readiness, "READY");
  assert.notEqual(healthy.lastSuccessfulDeliveryAt, null);
  const watermark = await prisma.aiProcessProducerDeliveryWatermark.findUniqueOrThrow({ where: { source: AI_PROCESS_CONSOLE_SOURCE } });

  await prisma.aiProcessFactOutbox.updateMany({ where: { attemptId: receipt.factAttemptId, deliveryState: "DELIVERED" }, data: { deliveredAt: new Date("2029-01-01T00:00:00.000Z") } });
  const retained = await retainDeliveredAiProcessFacts({ retentionDays: 30, batchSize: 1000, now: routeNow });
  assert.ok(retained.deletedCount > 0);
  assert.equal(await prisma.aiProcessFactOutbox.count({ where: { attemptId: receipt.factAttemptId } }), 0);
  assert.notEqual(await prisma.aiProcessTestRun.findUnique({ where: { id: receipt.id } }), null);
  assert.equal((await prisma.aiProcessProducerDeliveryWatermark.findUniqueOrThrow({ where: { source: AI_PROCESS_CONSOLE_SOURCE } })).lastSuccessfulDeliveryAt.toISOString(), watermark.lastSuccessfulDeliveryAt.toISOString());
});
