import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialPressEditHarness,
  mergeReviewIntoHarness,
  mergePendingRewriteIntoHarness,
  applyPendingRewriteToHarness,
  buildPressReviewGroundingContext,
  buildPressRepolishPromptBundle,
  readPressEditHarness,
} from "./pressEditHarness";

test("createInitialPressEditHarness stores grounding and generation lineage", () => {
  const harness = createInitialPressEditHarness({
    title: "새 서비스 출시",
    plain: "리드 문장\n\n본문 문장",
    lead: "리드 문장",
    fact: "2026년 4월 27일 출시",
    rawInput: "4월 27일에 새 서비스를 출시한다. 핵심은 자동화다.",
    brief: {
      serviceName: "PressTuner AI",
      announceType: "서비스 출시",
      oneLiner: "보도자료 작성 자동화",
      points: ["작성 시간 단축", "팀 톤 일관화"],
      quoteWho: "홍길동 대표",
      quoteMessage: "콘텐츠 작성 효율을 높이겠다",
      eventAt: "2026-04-27 09:00",
      publishAt: "2026-04-27 10:00",
      tone: "formal",
    },
    styleGuideId: "guide_1",
    generatedAt: "2026-04-27T00:00:00.000Z",
  });

  assert.equal(harness.version, 2);
  assert.equal(harness.grounding.rawInput, "4월 27일에 새 서비스를 출시한다. 핵심은 자동화다.");
  assert.equal(harness.grounding.brief?.serviceName, "PressTuner AI");
  assert.equal(harness.grounding.style.styleGuideId, "guide_1");
  assert.ok(
    harness.grounding.lockedFacts.some(
      (fact) => fact.label === "서비스명" && fact.value === "PressTuner AI",
    ),
  );
  assert.ok(
    harness.grounding.lockedFacts.some(
      (fact) => fact.label === "팩트 문장" && fact.value === "2026년 4월 27일 출시",
    ),
  );
  assert.equal(harness.generation.title, "새 서비스 출시");
  assert.equal(harness.lineage.at(-1)?.stage, "GENERATE");
});

test("readPressEditHarness upgrades serialized v1 grounding safely", () => {
  const upgraded = readPressEditHarness({
    version: 1,
    grounding: {
      rawInput: "memo",
      brief: null,
      lockedFacts: [],
      style: { styleGuideId: "legacy" },
    },
    generation: {
      generatedAt: "2026-07-24T00:00:00.000Z",
      title: "title",
      lead: null,
      fact: null,
      plain: "body",
    },
    review: null,
    pendingRewrite: null,
    lineage: [],
  });
  assert.equal(upgraded?.version, 2);
  assert.deepEqual(upgraded?.grounding.acceptedFactIds, []);
  assert.equal(upgraded?.grounding.style.policy, "");
});

test("review and pending rewrite preserve prior grounding context", () => {
  const initial = createInitialPressEditHarness({
    title: "초안 제목",
    plain: "초안 본문",
    lead: "초안 리드",
    fact: "초안 팩트",
    rawInput: "원본 메모",
    brief: {
      serviceName: "서비스 A",
      announceType: "업데이트",
      oneLiner: "한 줄 설명",
      points: ["포인트 1"],
      quoteWho: "",
      quoteMessage: "",
      eventAt: "",
      publishAt: "",
      tone: "formal",
    },
    styleGuideId: "guide_a",
    generatedAt: "2026-04-27T00:00:00.000Z",
  });

  const reviewed = mergeReviewIntoHarness(initial, {
    sessionId: "session_1",
    title: "초안 제목",
    plain: "초안 본문",
    notes: [
      {
        id: "note_1",
        quote: "초안 본문",
        note: "표현을 더 기사체로 정리",
        type: "TONE",
      },
    ],
    generatedAt: "2026-04-27T00:10:00.000Z",
  });

  const rewritten = mergePendingRewriteIntoHarness(reviewed, {
    basedOnSessionId: "session_1",
    userInstruction: "기사체로 더 단정하게",
    selectedNoteIds: ["note_1"],
    title: "수정된 제목",
    plain: "수정된 본문",
    generatedAt: "2026-04-27T00:20:00.000Z",
  });

  assert.equal(rewritten.grounding.brief?.serviceName, "서비스 A");
  assert.equal(rewritten.review?.sessionId, "session_1");
  assert.equal(rewritten.pendingRewrite?.title, "수정된 제목");
  assert.equal(rewritten.pendingRewrite?.selectedNoteIds.length, 1);
  assert.equal(rewritten.lineage.at(-1)?.stage, "REWRITE");

  const applied = applyPendingRewriteToHarness(rewritten, "2026-04-27T00:30:00.000Z");
  assert.equal(applied.pendingRewrite, null);
  assert.equal(applied.generation.title, "수정된 제목");
  assert.equal(applied.generation.plain, "수정된 본문");
  assert.equal(applied.lineage.at(-1)?.stage, "APPLY");
});

test("applyPendingRewriteToHarness prefers applied draft override when provided", () => {
  const rewritten = mergePendingRewriteIntoHarness(
    createInitialPressEditHarness({
      title: "원제목",
      plain: "원본문",
      lead: null,
      fact: null,
      rawInput: "원메모",
      brief: null,
      styleGuideId: null,
      generatedAt: "2026-04-27T00:00:00.000Z",
    }),
    {
      basedOnSessionId: "session_override",
      userInstruction: "조금 더 단정하게",
      selectedNoteIds: [],
      title: "AI 수정 제목",
      plain: "AI 수정 본문",
      generatedAt: "2026-04-27T00:10:00.000Z",
    },
  );

  const applied = applyPendingRewriteToHarness(
    rewritten,
    "2026-04-27T00:20:00.000Z",
    {
      title: "사용자 저장 제목",
      plain: "사용자 저장 본문",
    },
  );

  assert.equal(applied.generation.title, "사용자 저장 제목");
  assert.equal(applied.generation.plain, "사용자 저장 본문");
});

test("review grounding context includes locked facts, brief, and source memo", () => {
  const harness = createInitialPressEditHarness({
    title: "초안 제목",
    plain: "초안 본문",
    lead: "초안 리드",
    fact: "초안 팩트",
    rawInput: "원본 메모 문장",
    brief: {
      serviceName: "서비스 B",
      announceType: "행사",
      oneLiner: "행사 한 줄 소개",
      points: ["포인트 A", "포인트 B"],
      quoteWho: "대표",
      quoteMessage: "행사 기대감",
      eventAt: "2026-05-01 14:00",
      publishAt: "2026-05-01 09:00",
      tone: "neutral",
    },
    styleGuideId: null,
    generatedAt: "2026-04-27T00:00:00.000Z",
  });

  const context = buildPressReviewGroundingContext(harness);

  assert.match(context, /Locked Facts/);
  assert.match(context, /서비스명: 서비스 B/);
  assert.match(context, /Normalized Brief/);
  assert.match(context, /Source Memo/);
  assert.match(context, /원본 메모 문장/);
});

test("repolish prompt bundle prioritizes user instruction while keeping grounding", () => {
  const harness = mergeReviewIntoHarness(
    createInitialPressEditHarness({
      title: "초안 제목",
      plain: "초안 본문",
      lead: "초안 리드",
      fact: "초안 팩트",
      rawInput: "원본 메모",
      brief: {
        serviceName: "서비스 C",
        announceType: "출시",
        oneLiner: "한 줄 소개",
        points: ["핵심 1"],
        quoteWho: "",
        quoteMessage: "",
        eventAt: "",
        publishAt: "",
        tone: "formal",
      },
      styleGuideId: "guide_c",
      generatedAt: "2026-04-27T00:00:00.000Z",
    }),
    {
      sessionId: "session_2",
      title: "초안 제목",
      plain: "초안 본문",
      notes: [
        {
          id: "note_2",
          quote: "초안 본문",
          note: "핵심 메시지를 앞에 배치",
          type: "HINT",
        },
      ],
      generatedAt: "2026-04-27T00:10:00.000Z",
    },
  );

  const bundle = buildPressRepolishPromptBundle({
    harness,
    baseTitle: "초안 제목",
    basePlain: "초안 본문",
    selectedNotes: harness.review?.notes ?? [],
    userInstruction: "두괄식으로 더 날카롭게 다듬어줘.",
    stylePrompt: "- 기사체 유지\n- 과장 금지",
  });

  assert.match(bundle.systemPrompt, /사용자의 최신 지시를 최우선으로 반영/);
  assert.match(bundle.systemPrompt, /서울 기반/);
  assert.match(bundle.systemPrompt, /측정 기준, 집계 방식/);
  assert.match(bundle.userPrompt, /두괄식으로 더 날카롭게 다듬어줘/);
  assert.match(bundle.userPrompt, /서비스명: 서비스 C/);
  assert.match(bundle.userPrompt, /핵심 메시지를 앞에 배치/);
  assert.match(bundle.userPrompt, /초안 본문/);
});
