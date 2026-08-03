import test from "node:test";
import assert from "node:assert/strict";

import {
  applyResumePendingRewrite,
  buildResumePolishGroundingContext,
  buildResumeRepolishPromptBundle,
  createInitialResumeEditHarness,
  mergeResumePendingRewriteIntoHarness,
  mergeResumePolishIntoHarness,
  readLatestResumeEditHarness,
  syncResumeEditHarness,
} from "./resumeEditHarness";

test("createInitialResumeEditHarness stores question, brief, bricks, and answer", () => {
  const harness = createInitialResumeEditHarness({
    question: "우리 회사에 지원한 이유를 작성해주세요.",
    briefContext: "B2B SaaS PM 포지션, 협업과 실행력이 중요함.",
    bricks: [
      {
        id: "brick_1",
        title: "프로젝트 리드",
        content: "사내 자동화 프로젝트를 리드해 30% 시간을 절감했다.",
      },
    ],
    currentAnswer: "저는 협업과 실행을 통해 문제를 해결해왔습니다.",
    generatedAt: "2026-04-28T00:00:00.000Z",
  });

  assert.equal(harness.version, 1);
  assert.equal(harness.grounding.question, "우리 회사에 지원한 이유를 작성해주세요.");
  assert.match(harness.grounding.briefContext, /B2B SaaS PM/);
  assert.equal(harness.grounding.bricks.length, 1);
  assert.equal(
    harness.currentAnswer.text,
    "저는 협업과 실행을 통해 문제를 해결해왔습니다.",
  );
  assert.equal(harness.lineage.at(-1)?.stage, "GENERATE");
});

test("syncResumeEditHarness applies pending rewrite when current answer matches", () => {
  const rewritten = mergeResumePendingRewriteIntoHarness(
    createInitialResumeEditHarness({
      question: "질문",
      briefContext: "",
      bricks: [],
      currentAnswer: "원본 답변",
      generatedAt: "2026-04-28T00:00:00.000Z",
    }),
    {
      userInstruction: "더 구체적으로",
      selectedNotes: [
        {
          quote: "원본 답변",
          note: "성과 수치를 넣어주세요.",
          type: "HINT",
        },
      ],
      revisedText: "수치가 포함된 새 답변",
      generatedAt: "2026-04-28T00:10:00.000Z",
    },
  );

  const synced = syncResumeEditHarness(rewritten, {
    question: "질문",
    briefContext: "",
    bricks: [],
    currentAnswer: "수치가 포함된 새 답변",
    syncedAt: "2026-04-28T00:20:00.000Z",
  });

  assert.equal(synced.pendingRewrite, null);
  assert.equal(synced.currentAnswer.text, "수치가 포함된 새 답변");
  assert.equal(synced.lineage.at(-1)?.stage, "APPLY");
});

test("syncResumeEditHarness clears stale pending rewrite on manual divergence", () => {
  const rewritten = mergeResumePendingRewriteIntoHarness(
    createInitialResumeEditHarness({
      question: "질문",
      briefContext: "",
      bricks: [],
      currentAnswer: "원본 답변",
      generatedAt: "2026-04-28T00:00:00.000Z",
    }),
    {
      userInstruction: "더 구체적으로",
      selectedNotes: [],
      revisedText: "AI 수정 답변",
      generatedAt: "2026-04-28T00:10:00.000Z",
    },
  );

  const synced = syncResumeEditHarness(rewritten, {
    question: "질문",
    briefContext: "",
    bricks: [],
    currentAnswer: "사용자가 직접 고친 답변",
    syncedAt: "2026-04-28T00:20:00.000Z",
  });

  assert.equal(synced.pendingRewrite, null);
  assert.equal(synced.currentAnswer.text, "사용자가 직접 고친 답변");
  assert.equal(synced.lineage.at(-1)?.stage, "SYNC");
});

test("polish and repolish prompt context preserve brief and bricks", () => {
  const polished = mergeResumePolishIntoHarness(
    createInitialResumeEditHarness({
      question: "질문",
      briefContext: "핀테크 기업, 데이터 기반 실행을 선호",
      bricks: [
        {
          id: "brick_1",
          title: "대시보드 개선",
          content: "실험 기반으로 대시보드를 개선했다.",
        },
      ],
      currentAnswer: "초안 답변",
      generatedAt: "2026-04-28T00:00:00.000Z",
    }),
    {
      notes: [
        {
          quote: "초안 답변",
          note: "질문 적합성을 더 선명하게 해주세요.",
          type: "RISK",
        },
      ],
      generatedAt: "2026-04-28T00:05:00.000Z",
    },
  );

  const context = buildResumePolishGroundingContext(polished);
  const prompt = buildResumeRepolishPromptBundle({
    harness: polished,
    userInstruction: "지원 동기를 더 분명하게",
    selectedNotes: polished.lastPolish?.notes ?? [],
    charLimit: 700,
  });

  assert.match(context, /핀테크 기업/);
  assert.match(context, /대시보드 개선/);
  assert.match(prompt.userPrompt, /지원 동기를 더 분명하게/);
  assert.match(prompt.userPrompt, /질문 적합성을 더 선명하게/);
});

test("readLatestResumeEditHarness returns the newest valid snapshot", () => {
  const older = createInitialResumeEditHarness({
    question: "이전 질문",
    briefContext: "",
    bricks: [],
    currentAnswer: "이전 답변",
    generatedAt: "2026-04-28T00:00:00.000Z",
  });
  const newer = applyResumePendingRewrite(
    mergeResumePendingRewriteIntoHarness(older, {
      userInstruction: "최신화",
      selectedNotes: [],
      revisedText: "최신 답변",
      generatedAt: "2026-04-28T00:05:00.000Z",
    }),
    "2026-04-28T00:10:00.000Z",
    "최신 답변",
  );

  const found = readLatestResumeEditHarness([
    { schema: "resume_edit_harness", version: 1, harness: older },
    { schema: "resume_edit_harness", version: 1, harness: newer },
  ]);

  assert.equal(found?.currentAnswer.text, "최신 답변");
});
