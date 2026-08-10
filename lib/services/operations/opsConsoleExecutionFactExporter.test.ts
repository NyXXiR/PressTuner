import assert from "node:assert/strict";
import test from "node:test";
import { mapNodeLifecycle, withCanonicalSequence } from "@/domain/ai-telemetry/pressMapper";
import { exportOpsConsoleExecutionFacts } from "./opsConsoleExecutionFactExporter";

const operationId = "10000000-0000-4000-8000-000000000001";
const context = { teamId: "team", runId: "run", attemptId: "attempt", processId: "press-creation", processVersion: "2.0.0", registryHash: "fnv1a32:12345678", occurredAt: "2026-08-10T00:00:00.000Z" };

test("finalized exporter loads bounded canonical details and sends deterministic batches sequentially", async () => {
  const source = mapNodeLifecycle(context, { nodeId: "brief-normalization", commandId: "start", phase: "STARTED" });
  const events = Array.from({ length: 101 }, (_, index) => withCanonicalSequence({ ...source, eventId: `aevt_${String(index).padStart(48, "0")}` }, index + 1));
  const payloads: string[] = [];
  const result = await exportOpsConsoleExecutionFacts({ teamId: "team", runId: "run", processId: "press-creation", operationId }, {
    loadEvents: async (args) => { assert.equal(args.limit, 1001); return events; },
    appendFacts: async (batch) => { payloads.push(JSON.stringify(batch)); return { status: "reported", operationId, environment: "test" }; },
    now: () => 0,
  });
  assert.deepEqual(result, { status: "exported", batches: 2, facts: 101 });
  assert.deepEqual(payloads.map((value) => JSON.parse(value).facts.length), [100, 1]);
  assert.equal(payloads[0], payloads[0]);
});

test("exporter rejects invalid operations before loading and stops at first failed batch", async () => {
  let loaded = false;
  const invalid = await exportOpsConsoleExecutionFacts({ teamId: "team", runId: "run", processId: "press-creation", operationId: "bad" }, { loadEvents: async () => { loaded = true; return []; } });
  assert.equal(invalid.status, "failed"); assert.equal(loaded, false);
  const event = mapNodeLifecycle(context, { nodeId: "brief-normalization", commandId: "start", phase: "STARTED" });
  const failed = await exportOpsConsoleExecutionFacts({ teamId: "team", runId: "run", processId: "press-creation", operationId }, { loadEvents: async () => [event], appendFacts: async () => ({ status: "failed", code: "OPS_CONSOLE_HTTP_ERROR", operationId, environment: "test" }) });
  assert.deepEqual(failed, { status: "failed", code: "OPS_CONSOLE_HTTP_ERROR", batches: 0, facts: 1 });
});
