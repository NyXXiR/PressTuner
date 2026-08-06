import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";

import { advancePressAiCheckpointEdge, createPressAiCheckpointAttempt, fetchPressAiCheckpointAttemptHistory, fetchPressAiCheckpointComparison, sampleAssetToFile, uploadPressAiKnowledgePdf, mapKnowledgeDocuments, parsePressAiProcessSse, PressAiDebuggerApiError } from "./pressAiProcessDebuggerClient";

test("uploads a direct File as multipart without a manual content type", async () => {
  let request: RequestInit | undefined;
  const file = new File(["%PDF-1.4"], "local.pdf", { type: "application/pdf" });
  const result = await uploadPressAiKnowledgePdf(file as unknown as globalThis.File, async (_url, init) => { request = init; return new Response(JSON.stringify({ document: { id: "d1", originalName: "local.pdf", status: "PROCESSING" }, deduplicated: false, quota: { activeDocumentCount: 1, storedBytes: 8, uploadsInWindow: 1, limits: { documents: 25, storedBytes: 100, uploads: 10, windowSeconds: 3600 }, retryAfterSeconds: 0 } }), { status: 201 }); });
  assert.ok(request?.body instanceof FormData);
  assert.equal((request?.headers as Record<string, string> | undefined)?.["Content-Type"], undefined);
  assert.equal(result.document.id, "d1");
  assert.equal(result.quota.limits.documents, 25);
});

test("maps API errors and deduplicated upload responses", async () => {
  const file = new File(["%PDF-1.4"], "same.pdf", { type: "application/pdf" });
  const deduped = await uploadPressAiKnowledgePdf(file as unknown as globalThis.File, async () => new Response(JSON.stringify({ document: { id: "same", originalName: "same.pdf", status: "READY" }, deduplicated: true, quota: { activeDocumentCount: 1, storedBytes: 8, uploadsInWindow: 0, limits: { documents: 25, storedBytes: 100, uploads: 10, windowSeconds: 3600 }, retryAfterSeconds: 0 } }), { status: 201 }));
  assert.equal(deduped.deduplicated, true);
  await assert.rejects(() => uploadPressAiKnowledgePdf(file as unknown as globalThis.File, async () => new Response(JSON.stringify({ code: "KNOWLEDGE_UPLOAD_RATE_LIMITED", message: "wait" }), { status: 429, headers: { "Retry-After": "42" } })), /KNOWLEDGE_UPLOAD_RATE_LIMITED/);
});

test("converts a bundled asset to the declared upload File", async () => {
  const file = await sampleAssetToFile({ path: "/samples/a.pdf", uploadFilename: "sample-a.pdf" }, async () => new Response("%PDF-1.4", { status: 200, headers: { "Content-Type": "application/pdf" } }));
  assert.equal(file.name, "sample-a.pdf");
  assert.equal(file.type, "application/pdf");
});

test("readiness mapping selects only indexed non-replacement documents", () => {
  const mapped = mapKnowledgeDocuments([{ id: "ready", originalName: "a.pdf", status: "READY", pageCount: 1, chunkCount: 2, activeGenerationId: "g", hasPendingReplacement: false }, { id: "processing", originalName: "b.pdf", status: "PROCESSING", pageCount: null, chunkCount: 0, activeGenerationId: null, hasPendingReplacement: false }]);
  assert.deepEqual(mapped.map((item) => item.selectable), [true, false]);
});

test("stream failures preserve the persisted run and article identities", async () => {
  const encoder = new TextEncoder();
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode('event: stream.error\ndata: {"code":"FAILED","runId":"run-1","articleId":"article-1"}\n\n')); controller.close(); } }), { status: 201 });
  await assert.rejects(() => parsePressAiProcessSse(response), (error: any) => error.message === "FAILED" && error.runId === "run-1" && error.articleId === "article-1");
});

test("checkpoint responses fail closed and preserve structured 409 errors", async () => {
  await assert.rejects(() => createPressAiCheckpointAttempt({}, async () => new Response(JSON.stringify({ attempt: { id: "bad" } }), { status: 201 })), /Invalid input/);
  await assert.rejects(() => advancePressAiCheckpointEdge("a", "e", {}, async () => new Response(JSON.stringify({ code: "PRESS_AI_DEBUG_COMMAND_STALE", expectedRevision: 2 }), { status: 409 })), (error: unknown) => error instanceof PressAiDebuggerApiError && error.status === 409 && error.code === "PRESS_AI_DEBUG_COMMAND_STALE" && (error.details as { expectedRevision: number }).expectedRevision === 2);
});

test("checkpoint history and comparisons read persisted server projections", async () => {
  const history = await fetchPressAiCheckpointAttemptHistory(async () => new Response(JSON.stringify({ attempts: [{ id: "a1", status: "BLOCKED" }] }), { status: 200 }));
  const comparisons = await fetchPressAiCheckpointComparison("a2", async (url) => {
    assert.match(String(url), /a2\/comparison$/);
    return new Response(JSON.stringify({ comparisons: [{ id: "c1", oldVerdict: "BLOCK", newVerdict: "PASS", outputComparison: { changed: true } }] }), { status: 200 });
  });
  assert.equal(history[0]?.id, "a1");
  assert.equal(comparisons[0]?.newVerdict, "PASS");
});
