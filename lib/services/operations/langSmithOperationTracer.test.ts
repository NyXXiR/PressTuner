import assert from "node:assert/strict";
import test from "node:test";

import { projectMetadataForVendor } from "@/domain/ai-process-console/v1/vendorMetadataProjection";
import {
  createLangSmithOperationTracer,
  type LangSmithTraceClient,
} from "./langSmithOperationTracer";

const operationId = "10000000-0000-4000-8000-000000000001";
const metadataHmacKey = "canonical-metadata-hmac-key";

function createHarness(overrides?: {
  createError?: Error;
  childCreateError?: Error;
  updateError?: Error;
  feedbackErrors?: ReadonlySet<string>;
  synchronousFeedbackErrors?: ReadonlySet<string>;
  projectId?: string;
}) {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<{ id: string; run: Record<string, unknown> }> = [];
  const feedback: Array<Record<string, unknown>> = [];
  const timeline: string[] = [];
  const client: LangSmithTraceClient = {
    async createRun(run) {
      created.push(run);
      timeline.push(`create:${run.parent_run_id ? "child" : "root"}`);
      if (overrides?.createError) throw overrides.createError;
      if (run.parent_run_id && overrides?.childCreateError) throw overrides.childCreateError;
    },
    async updateRun(id, run) {
      updated.push({ id, run });
      timeline.push(`update:${id}`);
      if (overrides?.updateError) throw overrides.updateError;
    },
    createFeedback(entry) {
      feedback.push(entry);
      timeline.push(`feedback:${entry.key}`);
      if (overrides?.synchronousFeedbackErrors?.has(entry.key)) throw new Error("invalid feedback request");
      if (overrides?.feedbackErrors?.has(entry.key)) throw new Error("feedback offline");
      return Promise.resolve({});
    },
  };
  let uuidSequence = 1;
  const tracer = createLangSmithOperationTracer({
    environment: {
      LANGSMITH_API_KEY: "lsv2_sk_test",
      LANGSMITH_PROJECT: "Ops console",
      LANGSMITH_PROJECT_ID: overrides?.projectId ?? "30000000-0000-4000-8000-000000000003",
      LANGSMITH_ENDPOINT: "https://api.smith.langchain.com",
      LANGSMITH_WORKSPACE_ID: "workspace-1",
      AI_PROCESS_CONSOLE_VENDOR_METADATA_HMAC_KEY: metadataHmacKey,
    },
    randomUUID: () => `20000000-0000-4000-8000-${String(uuidSequence++).padStart(12, "0")}`,
    now: (() => { let tick = 0; return () => 1_754_313_120_000 + tick++; })(),
    createDottedOrder: (epoch, id) => `order:${epoch}:${id}`,
    createClient: (configuration) => {
      assert.equal(configuration.apiKey, "lsv2_sk_test");
      assert.equal(configuration.apiUrl, "https://api.smith.langchain.com");
      assert.equal(configuration.workspaceId, "workspace-1");
      assert.equal(
        configuration.projectId,
        overrides?.projectId === "not-a-uuid"
          ? undefined
          : overrides?.projectId ?? "30000000-0000-4000-8000-000000000003",
      );
      assert.equal(configuration.timeoutMs, 3_000);
      return client;
    },
  });
  return { tracer, created, updated, feedback, timeline };
}

test("records a privacy-safe root run correlated by operation metadata", async () => {
  const { tracer, created, updated } = createHarness();

  const value = await tracer.trace({
    operationId,
    workflowId: "presstuner.press-agent",
    workflowVersion: "press-agent-v2",
    environment: "production",
    phase: "initial",
    execute: async () => ({ privateDraft: "must never leave PressTuner" }),
  });

  assert.deepEqual(value, { privateDraft: "must never leave PressTuner" });
  assert.equal(created.length, 1);
  assert.deepEqual(created[0], {
    id: "20000000-0000-4000-8000-000000000001",
    trace_id: "20000000-0000-4000-8000-000000000001",
    start_time: 1_754_313_120_000,
    dotted_order:
      "order:1754313120000:20000000-0000-4000-8000-000000000001",
    name: "PressTuner Press Agent operation",
    run_type: "chain",
    project_name: "Ops console",
    inputs: { phase: "initial" },
    extra: {
      metadata: projectMetadataForVendor({
        projectId: "presstuner",
        environment: "production",
        serviceName: "presstuner",
        operationId,
        processId: "presstuner.press-agent",
        processVersion: "press-agent-v2",
      }, "langsmith", metadataHmacKey),
    },
  });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, "20000000-0000-4000-8000-000000000001");
  assert.deepEqual(updated[0].run.outputs, { status: "completed" });
  assert.equal(typeof updated[0].run.end_time, "number");
  assert.equal(JSON.stringify({ created, updated }).includes("privateDraft"), false);
});

test("keeps a provided domain trace separate from the LangSmith root identity", async () => {
  const { tracer, created } = createHarness();
  const canonicalTraceId = "123e4567e89b12d3a456426614174000";

  await tracer.trace({
    operationId,
    traceId: canonicalTraceId,
    workflowId: "presstuner.press-agent",
    workflowVersion: "press-agent-v2",
    environment: "production",
    phase: "initial",
    execute: async () => tracer.traceRagStage({
      stageId: "retrieval-execution",
      execute: async () => "result",
      observe: () => ({ selectedSourceCount: 1, eligibleSourceCount: 1, terminalStatus: "COMPLETED" } as never),
    }),
  });

  assert.equal(created.length, 2);
  assert.equal(created[0]!.trace_id, created[0]!.id);
  assert.equal(created[1]!.trace_id, created[0]!.id);
  assert.equal(created[1]!.parent_run_id, created[0]!.id);
  assert.equal(JSON.stringify(created).includes(canonicalTraceId), false);
});

test("never lets LangSmith delivery failure alter the Agent result", async () => {
  const createFailure = createHarness({ createError: new Error("offline") });
  assert.equal(
    await createFailure.tracer.trace({
      operationId,
      workflowId: "presstuner.press-agent",
      workflowVersion: "press-agent-v2",
      environment: "production",
      phase: "initial",
      execute: async () => "agent-result",
    }),
    "agent-result",
  );

  const updateFailure = createHarness({ updateError: new Error("offline") });
  assert.equal(
    await updateFailure.tracer.trace({
      operationId,
      workflowId: "presstuner.press-agent",
      workflowVersion: "press-agent-v2",
      environment: "production",
      phase: "initial",
      execute: async () => "agent-result",
    }),
    "agent-result",
  );
});

test("preserves Agent failures while recording only a safe error class", async () => {
  const { tracer, updated } = createHarness();
  await assert.rejects(
    tracer.trace({
      operationId,
      workflowId: "presstuner.press-agent",
      workflowVersion: "press-agent-v2",
      environment: "production",
      phase: "continuation",
      execute: async () => {
        throw new TypeError("private prompt fragment");
      },
    }),
    /private prompt fragment/,
  );
  assert.equal(updated.length, 1);
  assert.equal(updated[0].run.error, "TypeError");
  assert.deepEqual(updated[0].run.outputs, { status: "failed" });
  assert.equal(JSON.stringify(updated).includes("private prompt fragment"), false);
});

test("bypasses tracing when configuration or operation identity is absent", async () => {
  let clientsCreated = 0;
  const tracer = createLangSmithOperationTracer({
    environment: {},
    createClient: () => {
      clientsCreated += 1;
      throw new Error("must not create a client");
    },
  });
  assert.equal(
    await tracer.trace({
      operationId: null,
      workflowId: "presstuner.press-agent",
      workflowVersion: "press-agent-v2",
      environment: "production",
      phase: "initial",
      execute: async () => "untraced",
    }),
    "untraced",
  );
  assert.equal(clientsCreated, 0);
});

test("creates correctly parented privacy-safe child runs without serializing callback results", async () => {
  const { tracer, created, updated } = createHarness();
  const value = await tracer.trace({
    operationId,
    workflowId: "presstuner.press-agent",
    workflowVersion: "press-agent-v2",
    environment: "production",
    phase: "initial",
    execute: () => tracer.traceRagStage({
      stageId: "retrieval-execution",
      execute: async () => ({ context: "private source text", query: "private query" }),
      observe: () => ({ selectedSourceCount: 2, eligibleSourceCount: 1, terminalStatus: "COMPLETED", prompt: "private observation extra" } as never),
    }),
  });

  assert.equal(value.context, "private source text");
  assert.equal(created.length, 2);
  const [root, child] = created;
  assert.equal(child!.trace_id, root!.id);
  assert.equal(child!.parent_run_id, root!.id);
  assert.equal(child!.project_name, root!.project_name);
  assert.match(String(child!.dotted_order), new RegExp(`^${String(root!.dotted_order).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`));
  assert.equal(child!.run_type, "retriever");
  assert.deepEqual((child!.extra as { metadata: unknown }).metadata, projectMetadataForVendor({
    projectId: "presstuner",
    environment: "production",
    serviceName: "presstuner",
    operationId,
    processId: "presstuner.press-agent",
    processVersion: "press-agent-v2",
    nodeId: "retrieval-execution",
  }, "langsmith", metadataHmacKey));
  assert.equal(JSON.stringify({ created, updated }).includes("private source text"), false);
  assert.equal(JSON.stringify({ created, updated }).includes("private query"), false);
  assert.equal(JSON.stringify({ created, updated }).includes("private observation extra"), false);
});

test("nested and concurrent children have unique IDs and deterministic parentage", async () => {
  const { tracer, created } = createHarness();
  await tracer.trace({
    operationId,
    workflowId: "wf",
    workflowVersion: "v1",
    environment: "test",
    phase: "continuation",
    execute: async () => {
      await Promise.all([
        tracer.traceRagStage({
          stageId: "retrieval-execution",
          execute: () => tracer.recordRagObservation("evidence-decision", { action: "ANSWER", code: "EVIDENCE_SUFFICIENT", reasonCodes: [], conflictCount: 0, decisionInputHash: "a".repeat(64) }),
          observe: () => ({ selectedSourceCount: 1, eligibleSourceCount: 1, terminalStatus: "COMPLETED" }),
        }),
        tracer.recordRagObservation("response-behavior", { status: "ANSWER", finalCitationCount: 1, claimCount: 1 }),
      ]);
    },
  });
  assert.equal(new Set(created.map((run) => run.id)).size, 4);
  const root = created[0]!;
  const retrieval = created.find((run) => (run.inputs as { stage?: string }).stage === "retrieval-execution")!;
  const evidence = created.find((run) => (run.inputs as { stage?: string }).stage === "evidence-decision")!;
  const response = created.find((run) => (run.inputs as { stage?: string }).stage === "response-behavior")!;
  assert.equal(retrieval.parent_run_id, root.id);
  assert.equal(evidence.parent_run_id, retrieval.id);
  assert.equal(response.parent_run_id, root.id);
});

test("child failures are fail-open but original runtime exceptions survive", async () => {
  const createFailure = createHarness({ childCreateError: new Error("offline") });
  assert.equal(await createFailure.tracer.trace({ operationId, workflowId: "wf", workflowVersion: "v1", environment: "test", phase: "initial", execute: () => createFailure.tracer.recordRagObservation("verification", { status: "PASS", supportedClaimCount: 1, totalClaimCount: 1 }).then(() => "result") }), "result");

  const updateFailure = createHarness({ updateError: new Error("offline") });
  assert.equal(await updateFailure.tracer.trace({ operationId, workflowId: "wf", workflowVersion: "v1", environment: "test", phase: "initial", execute: () => updateFailure.tracer.recordRagObservation("verification", { status: "PASS", supportedClaimCount: 1, totalClaimCount: 1 }).then(() => "result") }), "result");

  const original = new TypeError("private answer");
  const failure = createHarness();
  await assert.rejects(failure.tracer.trace({ operationId, workflowId: "wf", workflowVersion: "v1", environment: "test", phase: "initial", execute: () => failure.tracer.traceRagStage({ stageId: "verification", execute: async () => { throw original; }, observe: () => ({ status: "PASS", supportedClaimCount: 0, totalClaimCount: 0 }) }) }), (error) => error === original);
  assert.equal(JSON.stringify(failure.updated).includes("private answer"), false);
  assert.ok(failure.updated.some(({ run }) => run.error === "TypeError"));
});

test("attaches only canonical feedback to the root before completion and isolates each failure", async () => {
  const { tracer, feedback, updated, timeline } = createHarness({ feedbackErrors: new Set(["rag.retrieval.evidence_use.v1"]) });
  await tracer.trace({ operationId, workflowId: "wf", workflowVersion: "v1", environment: "test", phase: "initial", execute: async () => {
    await tracer.reportRootFeedback([
      { key: "rag.retrieval.evidence_use.v1", score: 1, direction: "higher_is_better", unit: "score" },
      { key: "arbitrary", score: 1, direction: "higher_is_better", unit: "score" },
      { key: "rag.grounded_answer.claim_verification.v1", score: 0, direction: "higher_is_better", unit: "score" },
    ]);
  } });
  assert.deepEqual(feedback.map((item) => item.key), ["rag.retrieval.evidence_use.v1", "rag.grounded_answer.claim_verification.v1"]);
  assert.ok(feedback.every((item) => item.runId === "20000000-0000-4000-8000-000000000001" && item.sessionId === "30000000-0000-4000-8000-000000000003" && item.feedbackSourceType === "app" && item.extendTraceRetention === false));
  assert.equal((updated.at(-1)!.run.outputs as { status: string }).status, "completed");
  assert.ok(timeline.findIndex((item) => item.startsWith("feedback:")) < timeline.lastIndexOf("update:20000000-0000-4000-8000-000000000001"));
});

test("synchronous feedback client failures remain fail-open per criterion", async () => {
  const { tracer, feedback, updated } = createHarness({
    synchronousFeedbackErrors: new Set(["rag.retrieval.evidence_use.v1"]),
  });
  await tracer.trace({
    operationId,
    workflowId: "wf",
    workflowVersion: "v1",
    environment: "test",
    phase: "initial",
    execute: () => tracer.reportRootFeedback([
      { key: "rag.retrieval.evidence_use.v1", score: 1, direction: "higher_is_better", unit: "score" },
      { key: "rag.grounded_answer.claim_verification.v1", score: 1, direction: "higher_is_better", unit: "score" },
    ]),
  });
  assert.deepEqual(feedback.map((item) => item.key), [
    "rag.retrieval.evidence_use.v1",
    "rag.grounded_answer.claim_verification.v1",
  ]);
  assert.equal((updated.at(-1)!.run.outputs as { status: string }).status, "completed");
});

test("invalid project UUID disables feedback without disabling tracing", async () => {
  const { tracer, created, feedback } = createHarness({ projectId: "not-a-uuid" });
  await tracer.trace({ operationId, workflowId: "wf", workflowVersion: "v1", environment: "test", phase: "initial", execute: () => tracer.reportRootFeedback([{ key: "rag.retrieval.evidence_use.v1", score: 1, direction: "higher_is_better", unit: "score" }]) });
  assert.equal(created.length, 1);
  assert.equal(feedback.length, 0);
});
