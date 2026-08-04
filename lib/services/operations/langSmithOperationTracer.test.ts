import assert from "node:assert/strict";
import test from "node:test";

import {
  createLangSmithOperationTracer,
  type LangSmithTraceClient,
} from "./langSmithOperationTracer";

const operationId = "10000000-0000-4000-8000-000000000001";

function createHarness(overrides?: {
  createError?: Error;
  updateError?: Error;
}) {
  const created: Array<Record<string, unknown>> = [];
  const updated: Array<{ id: string; run: Record<string, unknown> }> = [];
  const client: LangSmithTraceClient = {
    async createRun(run) {
      created.push(run);
      if (overrides?.createError) throw overrides.createError;
    },
    async updateRun(id, run) {
      updated.push({ id, run });
      if (overrides?.updateError) throw overrides.updateError;
    },
  };
  const tracer = createLangSmithOperationTracer({
    environment: {
      LANGSMITH_API_KEY: "lsv2_sk_test",
      LANGSMITH_PROJECT: "Ops console",
      LANGSMITH_ENDPOINT: "https://api.smith.langchain.com",
      LANGSMITH_WORKSPACE_ID: "workspace-1",
    },
    randomUUID: () => "20000000-0000-4000-8000-000000000002",
    now: () => 1_754_313_120_000,
    createDottedOrder: (epoch, id) => `order:${epoch}:${id}`,
    createClient: (configuration) => {
      assert.equal(configuration.apiKey, "lsv2_sk_test");
      assert.equal(configuration.apiUrl, "https://api.smith.langchain.com");
      assert.equal(configuration.workspaceId, "workspace-1");
      assert.equal(configuration.timeoutMs, 3_000);
      return client;
    },
  });
  return { tracer, created, updated };
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
    id: "20000000-0000-4000-8000-000000000002",
    trace_id: "20000000-0000-4000-8000-000000000002",
    start_time: 1_754_313_120_000,
    dotted_order:
      "order:1754313120000:20000000-0000-4000-8000-000000000002",
    name: "PressTuner Press Agent operation",
    run_type: "chain",
    project_name: "Ops console",
    inputs: { phase: "initial" },
    extra: {
      metadata: {
        operation_id: operationId,
        workflow_id: "presstuner.press-agent",
        workflow_version: "press-agent-v2",
        environment: "production",
        phase: "initial",
      },
    },
  });
  assert.equal(updated.length, 1);
  assert.equal(updated[0].id, "20000000-0000-4000-8000-000000000002");
  assert.deepEqual(updated[0].run.outputs, { status: "completed" });
  assert.equal(typeof updated[0].run.end_time, "number");
  assert.equal(JSON.stringify({ created, updated }).includes("privateDraft"), false);
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
