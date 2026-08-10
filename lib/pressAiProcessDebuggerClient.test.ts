import assert from "node:assert/strict";
import { File } from "node:buffer";
import test from "node:test";

import { advancePressAiCheckpointEdge, createPressAiCheckpointAttempt, deletePressAiKnowledgeDocument, fetchPressAiCheckpointAttempt, fetchPressAiCheckpointAttemptHistory, fetchPressAiCheckpointComparison, fetchPressAiDebugCase, retryPressAiCheckpointAttempt, savePressAiDebugCase, sampleAssetToFile, uploadPressAiKnowledgePdf, mapKnowledgeDocuments, parsePressAiProcessSse, PressAiDebuggerApiError } from "./pressAiProcessDebuggerClient";

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

test("unmounts a demo knowledge document through the team-scoped endpoint", async () => {
  let request = "";
  await deletePressAiKnowledgeDocument("doc-1", async (url, init) => {
    request = `${String(url)}:${init?.method}`;
    return new Response(JSON.stringify({ ok: true, deleted: true }), { status: 200 });
  });
  assert.equal(request, "/api/knowledge/documents/doc-1:DELETE");
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

test("attempt detail parsing preserves persisted metadata and saved input", async () => {
  const attempt = await fetchPressAiCheckpointAttempt(
    "attempt-parent",
    async () =>
      new Response(
        JSON.stringify({
          attempt: {
            id: "attempt-parent",
            processId: "press-creation",
            processVersion: "2.0.0",
            registryHash: "registry",
            executorVersion: "executor",
            status: "COMPLETED",
            revision: 7,
            articleId: "article-1",
            activeNodeId: null,
            startNodeId: "brief-normalization",
            createdAt: "2026-08-10T01:02:03.000Z",
            completedAt: "2026-08-10T01:03:04.000Z",
            parentAttemptId: "attempt-origin",
            inputSnapshot: {
              articleId: "article-1",
              rawText: "저장된 메모",
              tone: "formal",
              reviewInstruction: "검토",
              rewriteInstruction: "수정",
            },
            checkpoints: [],
            transitions: [],
          },
        }),
        { status: 200 },
      ),
  );

  assert.equal(attempt.createdAt, "2026-08-10T01:02:03.000Z");
  assert.equal(attempt.completedAt, "2026-08-10T01:03:04.000Z");
  assert.equal(attempt.parentAttemptId, "attempt-origin");
  assert.equal(attempt.startNodeId, "brief-normalization");
  assert.equal(attempt.revision, 7);
  assert.equal(attempt.inputSnapshot.rawText, "저장된 메모");
  assert.equal(attempt.inputSnapshot.tone, "formal");
});

test("retry sends the exact branch envelope and parses the child receipt", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const result = await retryPressAiCheckpointAttempt(
    "attempt-parent",
    {
      commandId: "command-123",
      expectedRevision: 7,
      retryNodeId: "draft-review",
    },
    async (url, init) => {
      requestUrl = String(url);
      requestInit = init;
      return new Response(
        JSON.stringify({
          replayed: false,
          attemptId: "attempt-child",
          articleId: "article-child",
          revision: 0,
        }),
        { status: 201 },
      );
    },
  );

  assert.equal(
    requestUrl,
    "/api/press/agent/process-debug-attempts/attempt-parent/retry",
  );
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    commandId: "command-123",
    expectedRevision: 7,
    retryNodeId: "draft-review",
  });
  assert.equal(result.attemptId, "attempt-child");

  await assert.rejects(
    retryPressAiCheckpointAttempt("attempt-parent", {}, async () =>
      new Response(JSON.stringify({ attemptId: 42 }), { status: 200 }),
    ),
    /Invalid input/,
  );
});

test("loads typed matcher-v1 case details and parses save receipts", async () => {
  const detail = await fetchPressAiDebugCase("case-1", async (url, init) => {
    assert.equal(String(url), "/api/press/agent/process-debug-cases/case-1"); assert.equal(init?.cache, "no-store");
    return new Response(JSON.stringify({ case: { caseId: "case-1", name: "검증", sourceCheckpoint: { id: "cp-1", nodeId: "draft-review" }, startNodeId: "draft-review", expectations: [{ id: "rule-1", edgeId: "review-rewrite", matcher: { version: 1, subject: "target_payload_selected_note_count", operator: "number_gte", operand: 1 }, verdict: "BLOCK", fingerprint: "abc", validation: { state: "UNTESTED", lastVerdict: null, lastObservationAt: null } }] } }), { status: 200 });
  });
  assert.equal(detail.expectations[0]?.validation.state, "UNTESTED");
  let saveBody: Record<string, unknown> | undefined;
  const expectation = { id: "rule-1", edgeId: "review-rewrite", matcher: { version: 1, subject: "target_payload_selected_note_count", operator: "number_gte", operand: 1 }, verdict: "BLOCK" };
  const receipt = await savePressAiDebugCase({ attemptId: "attempt-1", checkpointId: "cp-1", name: "검증", expectations: [expectation], commandId: "save-command", expectedRevision: 7 }, async (_url, init) => {
    saveBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ replayed: false, response: { caseId: "case-1", revision: 8 } }), { status: 201 });
  });
  assert.deepEqual((saveBody?.expectations as unknown[])[0], expectation);
  assert.equal(receipt.response.revision, 8);
});
