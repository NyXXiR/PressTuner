import assert from "node:assert/strict";
import test from "node:test";

import { completeResumeWritingQuestion } from "./completion";

test("completeResumeWritingQuestion preserves completion when experience extraction fails", async () => {
  // Given
  const calls: string[] = [];

  // When
  const result = await completeResumeWritingQuestion(
    {
      applicationId: "application-1",
      questionId: "question-1",
      userId: "user-1",
      teamId: "team-1",
      questionText: "문제를 해결한 경험을 작성해 주세요.",
      answer: "고객 이탈 원인을 분석해 전환율을 12% 높였습니다.",
    },
    {
      saveCompletion: async () => {
        calls.push("save");
      },
      previewExperience: async () => {
        calls.push("preview");
        throw new Error("AI unavailable");
      },
      saveCaptureProposal: async () => {
        calls.push("proposal");
        return { captureId: "capture-1" };
      },
    },
  );

  // Then
  assert.deepEqual(calls, ["save", "preview"]);
  assert.equal(result.completed, true);
  assert.deepEqual(result.capture, {
    kind: "deferred",
    reason: "EXTRACTION_UNAVAILABLE",
  });
});

test("completeResumeWritingQuestion persists an approval-first capture proposal", async () => {
  // Given
  const calls: string[] = [];
  const candidate = {
    previewId: "preview-1",
    mode: "create" as const,
    title: "전환율 개선 실험",
    content: "고객 이탈 원인을 분석해 전환율을 12% 높였다.",
    originalText: "고객 이탈 원인을 분석해 전환율을 12% 높였습니다.",
    period: null,
    tags: ["데이터 분석", "전환율"],
    matchedBrickId: null,
    matchedBrickTitle: null,
    reason: "새로운 성과 경험",
    existingContent: null,
    existingOriginalText: null,
  };

  // When
  const result = await completeResumeWritingQuestion(
    {
      applicationId: "application-1",
      questionId: "question-1",
      userId: "user-1",
      teamId: "team-1",
      questionText: "문제를 해결한 경험을 작성해 주세요.",
      answer: "고객 이탈 원인을 분석해 전환율을 12% 높였습니다.",
    },
    {
      saveCompletion: async () => {
        calls.push("save");
      },
      previewExperience: async () => {
        calls.push("preview");
        return {
          summary: "새 경험 1개를 찾았습니다.",
          items: [candidate],
        };
      },
      saveCaptureProposal: async (proposal) => {
        calls.push(`proposal:${proposal.items.length}`);
        return { captureId: "capture-1" };
      },
    },
  );

  // Then
  assert.deepEqual(calls, ["save", "preview", "proposal:1"]);
  assert.equal(result.completed, true);
  assert.deepEqual(result.capture, {
    kind: "pending_approval",
    captureId: "capture-1",
    summary: "새 경험 1개를 찾았습니다.",
    items: [candidate],
  });
});
