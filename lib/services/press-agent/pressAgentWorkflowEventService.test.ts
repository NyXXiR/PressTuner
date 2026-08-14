import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

test("public workflow persistence serializes on the run, dedupes, persists, then observes", () => {
  const source = readFileSync(join(__dirname, "pressAgentWorkflowEventService.ts"), "utf8");
  assert.match(source, /FROM agent_run[\s\S]*FOR UPDATE/);
  assert.match(source, /entry\.dedupeKey === args\.event\.dedupeKey/);
  assert.match(source, /Math\.max\(0,[\s\S]*entry\.sequence/);
  const create = source.indexOf("tx.agentRuntimeAuditEvent.create");
  const observe = source.lastIndexOf("observerStorage.getStore()");
  assert.ok(create >= 0 && observe > create, "observer must run only after the transaction persisted the event");
  assert.match(source, /eventType: PRESS_AGENT_PUBLIC_WORKFLOW_EVENT_TYPE/);
  assert.match(source, /appendCanonicalEvent/);
  assert.match(source, /readPressAgentOperationId\(lockedRun\.input\)/);
  assert.match(source, /buildRagQueryProcessDefinition/);
  assert.match(source, /executionMode: "LIVE"/);
  assert.match(source, /enqueueNextAiProcessFact/);
  assert.match(source, /details: \{ publicEvent: event \}/);
  assert.doesNotMatch(source, /details: \{[^}]*operationId/);
});

test("replay and history enforce team, starter, launch surface, and fail-closed parsing", () => {
  const source = readFileSync(join(__dirname, "pressAgentWorkflowEventService.ts"), "utf8");
  assert.match(source, /teamId: args\.teamId, startedById: args\.userId/);
  assert.match(source, /input\?\.launchSurface !== PRESS_AGENT_RAG_DEBUGGER_LAUNCH_SURFACE/);
  assert.match(source, /entry\.runId === args\.runId/);
  assert.match(source, /catch \{ return null; \}/);
  assert.match(source, /sort\(\(a, b\) => a\.sequence - b\.sequence\)/);
});
