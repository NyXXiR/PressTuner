import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCheckpointAttemptHistory } from "./attemptHistorySummary";

const base = {
  id: "attempt-1",
  processId: "press-creation",
  processVersion: "2.0.0",
  status: "ACTIVE",
  revision: 3,
  articleId: "article-1",
  activeNodeId: "brief-normalization",
  parentAttemptId: null,
  createdAt: new Date("2026-08-08T10:00:00Z"),
  completedAt: null,
};

test("derives a single-line memo excerpt and checkpoint count", () => {
  const [row] = summarizeCheckpointAttemptHistory([
    {
      ...base,
      inputSnapshot: {
        articleId: "article-1",
        rawText: "픽셔널 기업 브리프랩은\n2031년 4월 17일 '루멘 브릿지'를 출시할 예정이다. 비공개 베타에는 20곳이 참여했다.",
        tone: "formal",
      },
      _count: { checkpoints: 2 },
    },
  ]);
  assert.equal(row.checkpointCount, 2);
  assert.ok(row.memoExcerpt.length <= 61);
  assert.ok(row.memoExcerpt.startsWith("픽셔널 기업 브리프랩은 2031년"));
  assert.ok(!row.memoExcerpt.includes("\n"));
  assert.ok(row.memoExcerpt.endsWith("…"));
  // 원본 스냅샷은 응답에 그대로 노출하지 않는다
  assert.equal("inputSnapshot" in row, false);
  assert.equal("_count" in row, false);
});

test("tolerates missing snapshot and count", () => {
  const [row] = summarizeCheckpointAttemptHistory([
    { ...base, inputSnapshot: null, _count: undefined },
  ]);
  assert.equal(row.memoExcerpt, "");
  assert.equal(row.checkpointCount, 0);
  assert.equal(row.id, "attempt-1");
});

test("short memos are passed through without ellipsis", () => {
  const [row] = summarizeCheckpointAttemptHistory([
    { ...base, inputSnapshot: { rawText: "짧은 메모" }, _count: { checkpoints: 5 } },
  ]);
  assert.equal(row.memoExcerpt, "짧은 메모");
});
