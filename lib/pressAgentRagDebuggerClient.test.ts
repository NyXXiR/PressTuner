import assert from "node:assert/strict";
import test from "node:test";

import { parsePressAgentWorkflowSse } from "./pressAgentRagDebuggerClient";

const event = (sequence: number) => ({
  schemaVersion: "press-agent-workflow-event/v1",
  eventId: `event-${sequence}`,
  dedupeKey: `key-${sequence}`,
  runId: "run-1",
  sequence,
  occurredAt: "2026-08-06T00:00:00.000Z",
  type: "run.started",
  run: { status: "running" },
});

function response(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(encoder.encode(chunk)); controller.close(); } }), { status: 201, headers: { "Content-Type": "text/event-stream" } });
}

test("parses fragmented SSE, ignores comments, and deduplicates public events", async () => {
  const value = JSON.stringify(event(1));
  const received = await parsePressAgentWorkflowSse(response([`: keepalive\n\nevent: workflow\ndata: ${value.slice(0, 20)}`, `${value.slice(20)}\n\nevent: workflow\ndata: ${value}\n\nevent: stream.complete\ndata: {}\n\n`]));
  assert.equal(received.length, 1);
  assert.equal(received[0].sequence, 1);
});

test("fails closed for malformed browser-visible workflow data", async () => {
  await assert.rejects(() => parsePressAgentWorkflowSse(response(["event: workflow\ndata: {\"prompt\":\"secret\"}\n\n"])), /PRESS_AGENT_DEBUG_EVENT_INVALID/);
});
