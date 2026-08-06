import assert from "node:assert/strict";
import test from "node:test";

import { fetchPressAgentRagDebuggerDetail, fetchPressAgentRagDebuggerDocuments, parsePressAgentWorkflowSse, startPressAgentRagDebuggerRun } from "./pressAgentRagDebuggerClient";

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

test("posts the exact mounted setup request", async () => {
  const original = global.fetch;
  let posted = "";
  global.fetch = (async (_input: unknown, init?: RequestInit) => { posted = String(init?.body); return response([]); }) as typeof fetch;
  try {
    await startPressAgentRagDebuggerRun({ prompt: "질문", promptPresetId: null, retrievalConfigurationId: "candidate-v3", documentIds: ["doc-1"], articleId: null, onEvent() {} });
    assert.deepEqual(JSON.parse(posted), { prompt: "질문", promptPresetId: null, retrievalConfigurationId: "candidate-v3", documentIds: ["doc-1"], articleId: null });
  } finally { global.fetch = original; }
});

test("encodes detail URL and rejects stale envelopes", async () => {
  const original = global.fetch;
  let url = "";
  global.fetch = (async (input: string | URL | Request) => { url = String(input); return new Response(JSON.stringify({ schemaVersion: "press-agent-rag-debug-detail/v1", run: { id: "other", status: "RUNNING", createdAt: "2026-08-06T00:00:00.000Z", completedAt: null }, stageId: "request-intake", stageState: "running", availability: "pending", message: null, detail: null }), { status: 200 }); }) as typeof fetch;
  try { await assert.rejects(() => fetchPressAgentRagDebuggerDetail("run/1", "request-intake"), /PRESS_AGENT_DEBUG_DETAIL_STALE/); assert.match(url, /run%2F1\/details\?stageId=request-intake/); } finally { global.fetch = original; }
});

test("maps all knowledge documents while disabling ineffective selections", async () => {
  const original = global.fetch;
  global.fetch = (async () => new Response(JSON.stringify({ documents: [
    { id: "ready", originalName: "ready.pdf", status: "READY", pageCount: 2, chunkCount: 3, activeGenerationId: "generation", hasPendingReplacement: false },
    { id: "empty", originalName: "empty.pdf", status: "READY", pageCount: 1, chunkCount: 0, activeGenerationId: "generation", hasPendingReplacement: false },
    { id: "superseded", originalName: "old.pdf", status: "READY", pageCount: 1, chunkCount: 2, activeGenerationId: "generation", hasPendingReplacement: true },
  ] }), { status: 200 })) as typeof fetch;
  try {
    const documents = await fetchPressAgentRagDebuggerDocuments();
    assert.deepEqual(documents.map((document) => document.selectable), [true, false, false]);
    assert.match(documents[1].readinessReason ?? "", /청크/);
  } finally { global.fetch = original; }
});

test("rejects malformed detail envelopes", async () => {
  const original = global.fetch;
  global.fetch = (async () => new Response(JSON.stringify({ schemaVersion: "press-agent-rag-debug-detail/v1", stageId: "request-intake", rawStep: { secret: true } }), { status: 200 })) as typeof fetch;
  try { await assert.rejects(() => fetchPressAgentRagDebuggerDetail("run-1", "request-intake")); } finally { global.fetch = original; }
});
