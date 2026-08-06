import assert from "node:assert/strict";
import test from "node:test";

import { boundRagDebuggerText, projectPressAgentRagDebuggerDetail, translateRagDebuggerReason } from "./pressAgentRagDebuggerDetails";

const run = { id: "run-1", status: "COMPLETED", createdAt: "2026-08-06T00:00:00Z", completedAt: null, input: { launchSurface: "RAG_DEBUGGER_V1", prompt: "질문", promptPresetId: null, retrievalConfigurationId: "baseline-v1", selectedDocuments: [{ id: "d1", name: "문서", readiness: "READY", pageCount: 1, chunkCount: 2 }] }, output: { summary: "요약", answer: "답", cannotAnswer: false, claims: [], sourceIds: [], preVerificationOutput: { summary: "원본", answer: "원본 답", cannotAnswer: false, claims: [], sourceIds: [] }, claimVerification: { status: "PASS", claims: [] } } };

test("bounds stored text and normalizes unknown reasons", () => {
  assert.deepEqual(boundRagDebuggerText("abcd", 3), { text: "abc", truncated: true });
  assert.equal(translateRagDebuggerReason("provider-secret-code").code, "UNKNOWN_REASON");
});

test("projects intake from the server snapshot without unknown input fields", () => {
  const response = projectPressAgentRagDebuggerDetail({ run: { ...run, input: { ...(run.input as object), operationId: "forbidden", storageKey: "forbidden" } }, stageId: "request-intake", stageState: "succeeded" });
  assert.equal(response.availability, "available");
  assert.equal(JSON.stringify(response).includes("operationId"), false);
  assert.equal(JSON.stringify(response).includes("storageKey"), false);
});

test("caps source rows while reporting the uncapped total", () => {
  const sources = Array.from({ length: 55 }, (_, index) => ({ sourceId: `s${index}`, documentId: "d1", documentName: "문서", pageStart: 1, pageEnd: 1, excerpt: "내용", score: 1 }));
  const response = projectPressAgentRagDebuggerDetail({ run, stageId: "retrieval-execution", stageState: "succeeded", retrievedSources: sources });
  assert.equal(response.detail?.totalRetrievedCount, 55);
  assert.equal((response.detail?.sources as unknown[]).length, 50);
});

test("labels partial and skipped stages explicitly", () => {
  const pending = projectPressAgentRagDebuggerDetail({ run: { ...run, output: null }, stageId: "response-behavior", stageState: "running" });
  assert.equal(pending.availability, "pending");
  const skipped = projectPressAgentRagDebuggerDetail({ run, stageId: "fallback", stageState: "skipped" });
  assert.equal(skipped.availability, "not_applicable");
});

test("does not infer a document mount for legacy debugger runs", () => {
  const legacy = projectPressAgentRagDebuggerDetail({ run: { ...run, input: { launchSurface: "RAG_DEBUGGER_V1", prompt: "질문", retrievalConfigurationId: "baseline-v1" } }, stageId: "request-intake", stageState: "succeeded" });
  assert.equal(legacy.availability, "unavailable");
  assert.match(legacy.message ?? "", /이전 형식/);
});
