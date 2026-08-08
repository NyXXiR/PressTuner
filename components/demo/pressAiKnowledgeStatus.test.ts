import assert from "node:assert/strict";
import test from "node:test";
import {
  KNOWLEDGE_BUSY_STATUSES,
  formatIndexingElapsed,
  isKnowledgeDocumentBusy,
  knowledgeErrorMessage,
  knowledgeStatusLabel,
  summarizeKnowledgeDocuments,
} from "./pressAiKnowledgeStatus";

test("busy statuses match the server's delete guard", () => {
  // lib/services/knowledge/knowledgeDocumentService.ts BUSY_STATUSES
  assert.deepEqual([...KNOWLEDGE_BUSY_STATUSES].sort(), [
    "INDEXING",
    "PARSING",
    "QUEUED",
  ]);
  assert.equal(isKnowledgeDocumentBusy("PARSING"), true);
  assert.equal(isKnowledgeDocumentBusy("QUEUED"), true);
  assert.equal(isKnowledgeDocumentBusy("INDEXING"), true);
  assert.equal(isKnowledgeDocumentBusy("READY"), false);
  assert.equal(isKnowledgeDocumentBusy("FAILED"), false);
  assert.equal(isKnowledgeDocumentBusy("UPLOADED"), false);
});

test("every document status has a Korean label", () => {
  for (const status of [
    "UPLOADED",
    "QUEUED",
    "PARSING",
    "INDEXING",
    "READY",
    "FAILED",
  ]) {
    const label = knowledgeStatusLabel(status);
    assert.notEqual(label, status, `missing label: ${status}`);
    assert.ok(label.length > 0);
  }
  // 알 수 없는 값은 원문을 그대로 보여준다
  assert.equal(knowledgeStatusLabel("WAT"), "WAT");
});

test("elapsed time reads as a duration, not a clock time", () => {
  assert.equal(formatIndexingElapsed(0), "0초 경과");
  assert.equal(formatIndexingElapsed(45_000), "45초 경과");
  assert.equal(formatIndexingElapsed(60_000), "1분 경과");
  assert.equal(formatIndexingElapsed(92_000), "1분 32초 경과");
  assert.equal(formatIndexingElapsed(-5_000), "0초 경과");
});

test("known error codes become sentences, unknown codes stay visible", () => {
  assert.match(knowledgeErrorMessage("KNOWLEDGE_DOCUMENT_BUSY"), /인덱싱/);
  assert.ok(!knowledgeErrorMessage("KNOWLEDGE_DOCUMENT_BUSY").includes("KNOWLEDGE_"));
  assert.match(
    knowledgeErrorMessage("KNOWLEDGE_REPLACEMENT_IN_PROGRESS"),
    /교체/,
  );
  assert.equal(knowledgeErrorMessage("SOME_UNMAPPED_CODE"), "SOME_UNMAPPED_CODE");
});

const doc = (id: string, status: string) => ({
  id,
  name: `${id}.pdf`,
  status,
  pageCount: null,
  chunkCount: status === "READY" ? 3 : 0,
  selectable: status === "READY",
  readinessReason: null,
  errorMessage: null,
  createdAt: null,
  updatedAt: null,
});

test("summary line reports readiness and drives auto-expansion", () => {
  assert.deepEqual(summarizeKnowledgeDocuments([]), {
    text: "마운트된 문서 없음",
    needsAttention: false,
    busy: false,
  });

  assert.deepEqual(
    summarizeKnowledgeDocuments([doc("a", "READY"), doc("b", "READY")]),
    { text: "2개 · 모두 준비됨", needsAttention: false, busy: false },
  );

  const indexing = summarizeKnowledgeDocuments([
    doc("a", "READY"),
    doc("b", "PARSING"),
  ]);
  assert.equal(indexing.busy, true);
  assert.equal(indexing.needsAttention, true);
  assert.match(indexing.text, /1개 인덱싱 중/);

  const failed = summarizeKnowledgeDocuments([
    doc("a", "READY"),
    doc("b", "FAILED"),
  ]);
  assert.equal(failed.busy, false, "실패는 폴링 대상이 아니다");
  assert.equal(failed.needsAttention, true);
  assert.match(failed.text, /1개 실패/);
});
