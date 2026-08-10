import assert from "node:assert/strict";
import test from "node:test";
import { buildOpsConsoleWorkflowManifest } from "@/domain/press-ai-debugger/opsConsoleWorkflowManifest";
import { OPS_CONSOLE_EXECUTION_FACTS_BATCH_VERSION, OPS_CONSOLE_EXECUTION_FACT_VERSION, OPS_CONSOLE_PROTOCOL_VERSION, OPS_CONSOLE_PRODUCER, OpsConsoleExecutionFactBatchSchema, OpsConsoleWorkflowManifestSchema, assertOpsConsoleRequestSize } from "./opsConsoleProducerContracts";

const operationId = "10000000-0000-4000-8000-000000000001";

test("v2 producer contracts are strict, bounded, and receiver-compatible", () => {
  const manifest = buildOpsConsoleWorkflowManifest("press-creation");
  assert.equal(OpsConsoleWorkflowManifestSchema.parse(manifest).schemaVersion, "ops-console/workflow-manifest/v2");
  assert.throws(() => OpsConsoleWorkflowManifestSchema.parse({ ...manifest, prompt: "private prompt" }));
  assert.match(manifest.definitionHash, /^sha256:[0-9a-f]{64}$/);

  const fact = {
    schemaVersion: OPS_CONSOLE_EXECUTION_FACT_VERSION, protocolVersion: OPS_CONSOLE_PROTOCOL_VERSION,
    factId: "20000000-0000-4000-8000-000000000001", operationId,
    workflow: { ...manifest.workflow, definitionHash: manifest.definitionHash }, sequence: 1,
    occurredAt: "2026-08-10T00:00:00.000Z", kind: "node.lifecycle", occurrenceId: "30000000-0000-4000-8000-000000000001",
    stageId: "article-initialization", state: "STARTED", reasonCode: null,
  } as const;
  const batch = OpsConsoleExecutionFactBatchSchema.parse({ schemaVersion: OPS_CONSOLE_EXECUTION_FACTS_BATCH_VERSION, producer: OPS_CONSOLE_PRODUCER, facts: [fact] });
  assertOpsConsoleRequestSize(batch);
  assert.throws(() => OpsConsoleExecutionFactBatchSchema.parse({ ...batch, facts: [{ ...fact, generatedText: "private article" }] }));
  assert.throws(() => OpsConsoleExecutionFactBatchSchema.parse({ ...batch, facts: Array.from({ length: 101 }, (_, index) => ({ ...fact, factId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, occurrenceId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, sequence: index + 1 })) }));
  assert.throws(() => OpsConsoleExecutionFactBatchSchema.parse({ ...batch, facts: [fact, { ...fact, factId: "20000000-0000-4000-8000-000000000002", occurrenceId: "30000000-0000-4000-8000-000000000002", sequence: 1 }] }));
});
