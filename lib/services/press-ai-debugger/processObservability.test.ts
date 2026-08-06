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
