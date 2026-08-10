import assert from "node:assert/strict"; import test from "node:test";
import { buildPressTunerDebugRunSnapshot, PRESSTUNER_DEBUG_RUN_V1_SCHEMA_VERSION, type PressTunerDebugRunV1Snapshot } from "@/domain/press-ai-debugger/presstunerDebugRunContract";
import { createPressTunerDebugSnapshotClient } from "./presstunerDebugSnapshotClient";
const date = new Date("2026-08-10T16:00:00Z");
const snapshot = buildPressTunerDebugRunSnapshot({ attempt: { id: "10000000-0000-4000-8000-000000000001", revision: 0, processId: "press-creation", processVersion: "2.0.0", registryHash: "fnv1a32:12345678", status: "ACTIVE", activeNodeId: "article-initialization", parentAttemptId: null, baselineAttemptId: null, createdAt: date, updatedAt: date, completedAt: null }, checkpoints: [], transitions: [] }, { environment: "qa", snapshotRevision: 1 });
test("snapshot client is disabled without configuration", async () => assert.deepEqual(await createPressTunerDebugSnapshotClient({ environment: {} })(snapshot), { status: "pending", code: "OPS_CONSOLE_DISABLED" }));
test("snapshot client classifies replay, contract and conflict responses", async () => { for (const [status, expected] of [[200, { status: "delivered" }], [409, { status: "terminal", code: "OPS_CONSOLE_DELIVERY_CONFLICT" }], [422, { status: "terminal", code: "OPS_CONSOLE_CONTRACT_ERROR" }]] as const) assert.deepEqual(await createPressTunerDebugSnapshotClient({ environment: { OPS_CONSOLE_AI_OPERATIONS_URL: "http://ops.test", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "key" }, fetch: async () => new Response(null, { status }) })(snapshot), expected); });
test("snapshot client still delivers pending v1 outbox payloads", async () => {
  const { workflow: _workflow, domainObservations: _domain, ...execution } = snapshot;
  void _workflow; void _domain;
  const v1 = { ...execution, schemaVersion: PRESSTUNER_DEBUG_RUN_V1_SCHEMA_VERSION, evaluations: [] } as PressTunerDebugRunV1Snapshot;
  let delivered = "";
  const result = await createPressTunerDebugSnapshotClient({ environment: { OPS_CONSOLE_AI_OPERATIONS_URL: "http://ops.test", OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY: "key" }, fetch: async (_url, init) => { delivered = String(init?.body); return new Response(null, { status: 200 }); } })(v1);
  assert.deepEqual(result, { status: "delivered" });
  assert.equal(JSON.parse(delivered).schemaVersion, "presstuner-debug-run/v1");
});
