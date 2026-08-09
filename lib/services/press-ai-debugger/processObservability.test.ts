import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readProcessOperationId } from "./processPersistence";

test("process operation identity parser accepts only UUID operation IDs", () => {
  assert.equal(readProcessOperationId({ operationId: "10000000-0000-4000-8000-000000000001" }), "10000000-0000-4000-8000-000000000001");
  assert.equal(readProcessOperationId({ operationId: "run-private" }), null);
  assert.equal(readProcessOperationId(null), null);
});

test("success, failure, and cancellation share terminal finalization while waiting stays open", () => {
  const persistence = readFileSync("lib/services/press-ai-debugger/processPersistence.ts", "utf8");
  const creation = readFileSync("lib/services/press-ai-debugger/pressCreationProcessService.ts", "utf8");
  const runtime = readFileSync("lib/services/press-agent/pressAgentRuntime.ts", "utf8");

  assert.match(creation, /finalizeProcessRunObservability\([^;]+status: "succeeded"/);
  assert.match(persistence, /finalizeProcessRunObservability\([^;]+status: "failed"/);
  assert.match(runtime, /finalizeProcessRunObservability\([^;]+status: "cancelled"/);
  const waiting = persistence.slice(persistence.indexOf("export async function setProcessWaiting"), persistence.indexOf("export async function finalizeProcessRunObservability"));
  assert.doesNotMatch(waiting, /completeOperation|exportTelemetry/);
});

test("process observability registers its registry manifest and exports canonical facts before completion", () => {
  const persistence = readFileSync("lib/services/press-ai-debugger/processPersistence.ts", "utf8");

  assert.match(persistence, /buildPressAiWorkflowManifest\(process\.id\)/);
  assert.match(persistence, /workflowManifest/);
  const finalize = persistence.slice(persistence.indexOf("export async function finalizeProcessRunObservability"));
  const factIndex = finalize.indexOf("exportExecutionFacts");
  const completeIndex = finalize.indexOf("completeOperation");
  const otlpIndex = finalize.indexOf("exportTelemetry");
  assert.ok(factIndex >= 0);
  assert.ok(factIndex < completeIndex);
  assert.ok(factIndex < otlpIndex);
});

test("RAG runtime registers the registry manifest and exports facts before operation completion", () => {
  const runtime = readFileSync("lib/services/press-agent/pressAgentRuntime.ts", "utf8");

  assert.match(runtime, /buildManifest\("rag-query"\)/);
  assert.match(runtime, /workflowManifest/);
  const completeHelper = runtime.slice(
    runtime.indexOf("async function completePressAgentOperation"),
    runtime.indexOf("function readVerificationFallbackMode"),
  );
  assert.ok(completeHelper.indexOf("exportRunExecutionFacts") >= 0);
  assert.ok(completeHelper.indexOf("exportRunExecutionFacts") < completeHelper.indexOf("completeOpsConsoleOperation"));
  assert.ok(completeHelper.indexOf("exportRunExecutionFacts") < completeHelper.indexOf("exportRunTelemetry"));
  assert.ok(completeHelper.indexOf("exportRunTelemetry") < completeHelper.indexOf("completeOpsConsoleOperation"));
});
