import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  createResumeWriteFlowState,
  resumeWriteFlowReducer,
  selectAppliedBrickDelta,
  selectCanFinishFromWriting,
  selectPendingCaptureForQuestion,
  type FlowOrganizedIntake,
  type ResumeWriteFlowAction,
  type ResumeWriteFlowState,
} from "./flowMachine";

function dispatchAll(
  initial: ResumeWriteFlowState,
  actions: readonly ResumeWriteFlowAction[],
): ResumeWriteFlowState {
  return actions.reduce(resumeWriteFlowReducer, initial);
}

const ORGANIZED: FlowOrganizedIntake = {
  company: "모노랩",
  job: "프로덕트 매니저",
  brief: {
    summary: "데이터 기반 제품 개선을 주도할 PM 채용",
    deadline: null,
    employmentType: null,
    location: null,
    coreResponsibilities: [],
    requirements: [],
    preferredQualifications: [],
    keySignals: ["데이터 기반"],
    writingGuidance: ["수치 중심으로 서술"],
  },
  questions: [
    { prompt: "지원 동기를 서술하세요.", charLimit: 700 },
    { prompt: "협업 경험을 서술하세요.", charLimit: 1_000 },
  ],
};

const SERVER_QUESTIONS = [
  {
    id: "q-1",
    prompt: "지원 동기를 서술하세요.",
    charLimit: 700,
    aiAdvice: "회사의 지표 문화와 연결하세요.",
    linkedBrickIds: ["brick-1"],
  },
  {
    id: "q-2",
    prompt: "협업 경험을 서술하세요.",
    charLimit: 1_000,
    aiAdvice: "",
    linkedBrickIds: [],
  },
] as const;

function toWriting(initial: ResumeWriteFlowState): ResumeWriteFlowState {
  return dispatchAll(initial, [
    { type: "update_intake", field: "rawText", value: "모노랩 PM 공고 원문" },
    { type: "organize_started" },
    { type: "organize_succeeded", result: ORGANIZED },
    { type: "start_started" },
    {
      type: "start_succeeded",
      appId: "app-1",
      questions: SERVER_QUESTIONS,
    },
  ]);
}

test("organizes rough intake into an editable review and recovers from failure", () => {
  // Given
  const typed = resumeWriteFlowReducer(createResumeWriteFlowState(), {
    type: "update_intake",
    field: "rawText",
    value: "모노랩 PM 공고 원문",
  });

  // When
  const pending = resumeWriteFlowReducer(typed, { type: "organize_started" });
  const failed = resumeWriteFlowReducer(pending, {
    type: "organize_failed",
    error: "정리에 실패했습니다.",
  });
  const reviewed = dispatchAll(pending, [
    { type: "organize_succeeded", result: ORGANIZED },
  ]);

  // Then
  assert.equal(pending.organize.status, "pending");
  assert.equal(failed.stage, "intake");
  assert.equal(failed.organize.status, "error");
  assert.equal(failed.organize.error, "정리에 실패했습니다.");
  assert.equal(reviewed.stage, "review");
  assert.equal(reviewed.organize.status, "idle");
  assert.equal(reviewed.company, "모노랩");
  assert.equal(reviewed.job, "프로덕트 매니저");
  assert.equal(reviewed.questions.length, 2);
  assert.equal(reviewed.questions[0]?.charLimit, 700);
  assert.ok(reviewed.questions[0]?.id);
});

test("review edits, direction, and pinned bricks lead into a started workspace", () => {
  // Given
  const review = dispatchAll(createResumeWriteFlowState(), [
    { type: "organize_started" },
    { type: "organize_succeeded", result: ORGANIZED },
    {
      type: "bricks_loaded",
      bricks: [
        { id: "brick-1", title: "지표 개선", content: "가입 전환 42% 개선", tags: ["데이터"] },
        { id: "brick-2", title: "협업 갈등 해결", content: "디자인-개발 협업 조율", tags: ["협업"] },
      ],
    },
  ]);

  // When
  const edited = dispatchAll(review, [
    { type: "update_target", field: "company", value: "모노랩 주식회사" },
    { type: "update_direction", value: "수치를 앞세워 담백하게 써줘" },
    { type: "toggle_pinned_brick", brickId: "brick-2" },
    { type: "add_question" },
    {
      type: "update_question_prompt",
      questionId: review.questions[0]?.id ?? "",
      value: "지원 동기를 회사 관점에서 서술하세요.",
    },
  ]);
  const added = edited.questions.at(-1);
  const trimmed = resumeWriteFlowReducer(edited, {
    type: "remove_question",
    questionId: added?.id ?? "",
  });
  const started = dispatchAll(trimmed, [
    { type: "start_started" },
    { type: "start_succeeded", appId: "app-1", questions: SERVER_QUESTIONS },
  ]);

  // Then
  assert.equal(edited.company, "모노랩 주식회사");
  assert.equal(edited.direction, "수치를 앞세워 담백하게 써줘");
  assert.deepEqual(edited.pinnedBrickIds, ["brick-2"]);
  assert.equal(edited.questions.length, 3);
  assert.equal(trimmed.questions.length, 2);
  assert.equal(started.stage, "writing");
  assert.equal(started.appId, "app-1");
  assert.equal(started.activeQuestionId, "q-1");
  assert.equal(started.questions[0]?.aiAdvice, "회사의 지표 문화와 연결하세요.");
  assert.deepEqual(started.questions[0]?.linkedBrickIds, ["brick-1"]);
});

test("tracks per-question draft generation, failure, and retry", () => {
  // Given
  const writing = toWriting(createResumeWriteFlowState());

  // When
  const generating = dispatchAll(writing, [
    { type: "draft_started", questionId: "q-1" },
    { type: "draft_started", questionId: "q-2" },
  ]);
  const mixed = dispatchAll(generating, [
    { type: "draft_succeeded", questionId: "q-1", text: "저는 가입 전환을 42% 개선했습니다." },
    { type: "draft_failed", questionId: "q-2", error: "한도를 초과했습니다." },
  ]);
  const retried = resumeWriteFlowReducer(mixed, {
    type: "draft_started",
    questionId: "q-2",
  });

  // Then
  assert.equal(generating.questions[0]?.draftStatus, "generating");
  assert.equal(mixed.questions[0]?.draftStatus, "ready");
  assert.equal(mixed.questions[0]?.status, "drafted");
  assert.match(mixed.questions[0]?.answer ?? "", /42%/);
  assert.equal(mixed.questions[0]?.messages.at(-1)?.role, "assistant");
  assert.equal(mixed.questions[1]?.draftStatus, "error");
  assert.equal(mixed.questions[1]?.draftError, "한도를 초과했습니다.");
  assert.equal(retried.questions[1]?.draftStatus, "generating");
  assert.equal(retried.questions[1]?.draftError, null);
});

test("proposes a conversational revision, then applies or discards it", () => {
  // Given
  const drafted = dispatchAll(toWriting(createResumeWriteFlowState()), [
    { type: "draft_succeeded", questionId: "q-1", text: "초안입니다." },
  ]);

  // When
  const asked = resumeWriteFlowReducer(drafted, {
    type: "prompt_sent",
    prompt: "성과 수치를 더 선명하게 보여줘",
  });
  const suggested = resumeWriteFlowReducer(asked, {
    type: "suggestion_received",
    questionId: "q-1",
    revised: "가입 전환 42%, 이탈 31% 개선을 이끌었습니다.",
  });
  const applied = resumeWriteFlowReducer(suggested, { type: "apply_suggestion" });
  const discarded = resumeWriteFlowReducer(suggested, { type: "discard_suggestion" });

  // Then
  assert.equal(asked.questions[0]?.suggestionStatus, "pending");
  assert.equal(asked.questions[0]?.messages.at(-1)?.role, "user");
  assert.equal(suggested.questions[0]?.suggestionStatus, "idle");
  assert.equal(suggested.questions[0]?.pendingSuggestion?.original, "초안입니다.");
  assert.equal(
    suggested.questions[0]?.pendingSuggestion?.instruction,
    "성과 수치를 더 선명하게 보여줘",
  );
  assert.equal(applied.questions[0]?.status, "revised");
  assert.match(applied.questions[0]?.answer ?? "", /42%/);
  assert.equal(applied.questions[0]?.pendingSuggestion, null);
  assert.equal(applied.questions[0]?.revisionCount, 1);
  assert.equal(discarded.questions[0]?.answer, "초안입니다.");
  assert.equal(discarded.questions[0]?.pendingSuggestion, null);
});

test("completes questions, queues pending captures, and reaches the recap", () => {
  // Given
  const drafted = dispatchAll(toWriting(createResumeWriteFlowState()), [
    { type: "draft_succeeded", questionId: "q-1", text: "첫 답변" },
    { type: "draft_succeeded", questionId: "q-2", text: "둘째 답변" },
  ]);

  // When
  const oneDone = dispatchAll(drafted, [
    { type: "complete_started", questionId: "q-1" },
    {
      type: "complete_succeeded",
      questionId: "q-1",
      capture: {
        kind: "pending_approval",
        captureId: "cap-1",
        summary: "새 경험 1개를 발견했어요.",
        items: [
          {
            previewId: "preview-1",
            mode: "create",
            title: "가입 전환 개선",
            content: "가입 전환 42% 개선",
            originalText: "첫 답변",
            period: null,
            tags: ["데이터"],
            matchedBrickId: null,
            matchedBrickTitle: null,
            reason: null,
            existingContent: null,
            existingOriginalText: null,
          },
        ],
      },
    },
  ]);
  const blocked = resumeWriteFlowReducer(oneDone, { type: "goto_capture" });
  const allDone = dispatchAll(oneDone, [
    { type: "complete_started", questionId: "q-2" },
    {
      type: "complete_succeeded",
      questionId: "q-2",
      capture: { kind: "deferred", reason: "EXTRACTION_UNAVAILABLE" },
    },
  ]);
  const capture = resumeWriteFlowReducer(allDone, { type: "goto_capture" });
  const resolved = dispatchAll(capture, [
    { type: "toggle_capture_item", captureId: "cap-1", previewId: "preview-1" },
    { type: "toggle_capture_item", captureId: "cap-1", previewId: "preview-1" },
    { type: "capture_apply_started", captureId: "cap-1" },
    { type: "capture_resolved", captureId: "cap-1", action: "apply" },
  ]);
  const done = resumeWriteFlowReducer(resolved, {
    type: "finish_succeeded",
    productivity: {
      availableBrickCount: 5,
      capturedFromWritingCount: 1,
      reusedBrickCount: 2,
    },
  });

  // Then
  assert.equal(oneDone.questions[0]?.status, "completed");
  assert.equal(oneDone.activeQuestionId, "q-2");
  assert.equal(oneDone.captures.length, 1);
  assert.deepEqual(oneDone.captures[0]?.selectedPreviewIds, ["preview-1"]);
  assert.equal(blocked.stage, "writing");
  assert.equal(allDone.questions[1]?.deferredCapture, true);
  assert.equal(capture.stage, "capture");
  assert.deepEqual(resolved.captures[0]?.selectedPreviewIds, ["preview-1"]);
  assert.equal(resolved.captures[0]?.status, "applied");
  assert.equal(done.stage, "done");
  assert.equal(done.productivity?.capturedFromWritingCount, 1);
});

test("surfaces inline capture, brick delta, and finish-from-writing readiness", () => {
  // Given
  const drafted = dispatchAll(toWriting(createResumeWriteFlowState()), [
    { type: "draft_succeeded", questionId: "q-1", text: "첫 답변" },
    { type: "draft_succeeded", questionId: "q-2", text: "둘째 답변" },
  ]);
  const capture = {
    kind: "pending_approval",
    captureId: "cap-1",
    summary: "새 경험 2개를 발견했어요.",
    items: [
      {
        previewId: "preview-1",
        mode: "create",
        title: "가입 전환 개선",
        content: "가입 전환 42% 개선",
        originalText: "첫 답변",
        period: null,
        tags: ["데이터"],
        matchedBrickId: null,
        matchedBrickTitle: null,
        reason: null,
        existingContent: null,
        existingOriginalText: null,
      },
      {
        previewId: "preview-2",
        mode: "augment",
        title: "지표 개선",
        content: "이탈 31% 개선 근거 보강",
        originalText: "첫 답변",
        period: null,
        tags: ["데이터"],
        matchedBrickId: "brick-1",
        matchedBrickTitle: "지표 개선",
        reason: null,
        existingContent: null,
        existingOriginalText: null,
      },
    ],
  } as const;

  // When
  const oneDone = dispatchAll(drafted, [
    { type: "complete_started", questionId: "q-1" },
    { type: "complete_succeeded", questionId: "q-1", capture },
  ]);
  const applied = dispatchAll(oneDone, [
    { type: "capture_apply_started", captureId: "cap-1" },
    { type: "capture_resolved", captureId: "cap-1", action: "apply" },
  ]);
  const allDone = dispatchAll(applied, [
    { type: "complete_started", questionId: "q-2" },
    {
      type: "complete_succeeded",
      questionId: "q-2",
      capture: { kind: "none", summary: "새 경험이 없습니다." },
    },
  ]);

  // Then
  assert.equal(
    selectPendingCaptureForQuestion(oneDone, "q-1")?.captureId,
    "cap-1",
  );
  assert.equal(selectPendingCaptureForQuestion(oneDone, "q-2"), null);
  assert.equal(selectPendingCaptureForQuestion(applied, "q-1"), null);
  assert.equal(selectAppliedBrickDelta(oneDone), 0);
  assert.equal(selectAppliedBrickDelta(applied), 2);
  assert.equal(selectCanFinishFromWriting(oneDone), false);
  assert.equal(selectCanFinishFromWriting(allDone), true);
  assert.equal(
    selectCanFinishFromWriting(
      resumeWriteFlowReducer(allDone, { type: "goto_capture" }),
    ),
    false,
  );
});

test("blocks finish-from-writing while a capture decision is pending", () => {
  // Given
  const drafted = dispatchAll(toWriting(createResumeWriteFlowState()), [
    { type: "draft_succeeded", questionId: "q-1", text: "첫 답변" },
    { type: "draft_succeeded", questionId: "q-2", text: "둘째 답변" },
  ]);

  // When
  const allDone = dispatchAll(drafted, [
    {
      type: "complete_succeeded",
      questionId: "q-1",
      capture: {
        kind: "pending_approval",
        captureId: "cap-1",
        summary: "새 경험 1개를 발견했어요.",
        items: [
          {
            previewId: "preview-1",
            mode: "create",
            title: "가입 전환 개선",
            content: "가입 전환 42% 개선",
            originalText: "첫 답변",
            period: null,
            tags: [],
            matchedBrickId: null,
            matchedBrickTitle: null,
            reason: null,
            existingContent: null,
            existingOriginalText: null,
          },
        ],
      },
    },
    {
      type: "complete_succeeded",
      questionId: "q-2",
      capture: { kind: "none", summary: "새 경험이 없습니다." },
    },
  ]);
  const dismissed = dispatchAll(allDone, [
    { type: "capture_apply_started", captureId: "cap-1" },
    { type: "capture_resolved", captureId: "cap-1", action: "dismiss" },
  ]);

  // Then
  assert.equal(selectCanFinishFromWriting(allDone), false);
  assert.equal(selectCanFinishFromWriting(dismissed), true);
  assert.equal(selectAppliedBrickDelta(dismissed), 0);
});

test("guards completed answers, reopen, and reset", () => {
  // Given
  const completed = dispatchAll(toWriting(createResumeWriteFlowState()), [
    { type: "draft_succeeded", questionId: "q-1", text: "첫 답변" },
    {
      type: "complete_succeeded",
      questionId: "q-1",
      capture: { kind: "none", summary: "새 경험이 없습니다." },
    },
  ]);

  // When
  const editBlocked = dispatchAll(completed, [
    { type: "select_question", questionId: "q-1" },
    { type: "update_answer", value: "몰래 고친 답변" },
  ]);
  const reopened = resumeWriteFlowReducer(completed, {
    type: "reopen_question",
    questionId: "q-1",
  });
  const reset = resumeWriteFlowReducer(completed, { type: "reset" });

  // Then
  assert.equal(editBlocked.questions[0]?.answer, "첫 답변");
  assert.equal(reopened.questions[0]?.status, "saved");
  assert.equal(reopened.activeQuestionId, "q-1");
  assert.equal(reset.stage, "intake");
  assert.equal(reset.questions.length, 0);
  assert.equal(reset.appId, null);
});

test("manual edits clear exact grounding and a fresh verification replaces stale UI state", () => {
  const grounding = {
    id: "grounding-1",
    experienceIds: ["experience-1"],
    factIds: ["fact-1"],
    experiences: [
      {
        experienceId: "experience-1",
        title: "Readable experience",
        organization: "Apollo",
        roleTitle: "Engineer",
      },
    ],
    facts: [
      {
        factId: "fact-1",
        kind: "ORGANIZATION",
        fieldPath: "organization",
        value: "Apollo",
        active: true,
        trustStatus: "TRUSTED",
        evidence: [],
      },
    ],
  } as const;
  const grounded = dispatchAll(toWriting(createResumeWriteFlowState()), [
    {
      type: "draft_succeeded",
      questionId: "q-1",
      text: "Grounded answer",
      grounding,
    },
  ]);
  const edited = resumeWriteFlowReducer(grounded, {
    type: "update_answer",
    value: "Manually edited but still verifiable",
  });
  const verified = resumeWriteFlowReducer(edited, {
    type: "complete_failed",
    questionId: "q-1",
    error: "Review the current answer",
    verification: {
      id: "verification-current",
      result: "BLOCK",
      findings: [],
    },
  });

  assert.equal(grounded.questions[0]?.grounding?.id, "grounding-1");
  assert.equal(edited.questions[0]?.grounding, null);
  assert.equal(edited.questions[0]?.verification, null);
  assert.equal(
    verified.questions[0]?.verification?.id,
    "verification-current",
  );
});

test("application finish failure stays retryable and only server success reaches done", () => {
  const writing = toWriting(createResumeWriteFlowState());
  const started = resumeWriteFlowReducer(writing, { type: "finish_started" });
  const failed = resumeWriteFlowReducer(started, {
    type: "finish_failed",
    error: "Server completion failed",
  });
  const retried = resumeWriteFlowReducer(failed, { type: "finish_started" });
  const done = resumeWriteFlowReducer(retried, {
    type: "finish_succeeded",
    productivity: null,
  });

  assert.equal(started.finish.status, "pending");
  assert.equal(failed.stage, "writing");
  assert.equal(failed.finish.status, "error");
  assert.equal(failed.finish.error, "Server completion failed");
  assert.equal(retried.finish.status, "pending");
  assert.equal(done.stage, "done");
  assert.equal(done.finish.error, null);
});

test("deferred capture retry replaces the inbox task with a pending approval", () => {
  const base = {
    ...createResumeWriteFlowState(),
    stage: "done" as const,
    appId: "app-1",
    deferredCaptures: [
      {
        taskId: "task-1",
        questionId: "q-1",
        status: "needs_attention" as const,
        attemptCount: 3,
        nextRetryAt: null,
        lastErrorCode: "EXTRACTION_UNAVAILABLE",
        requiresReopen: true,
        retryStatus: "idle" as const,
        error: null,
      },
    ],
  };
  const retrying = resumeWriteFlowReducer(base, {
    type: "capture_retry_started",
    taskId: "task-1",
  });
  const succeeded = resumeWriteFlowReducer(retrying, {
    type: "capture_retry_succeeded",
    taskId: "task-1",
    questionId: "q-1",
    capture: {
      kind: "pending_approval",
      captureId: "proposal-1",
      summary: "Review",
      items: [],
    },
  });
  assert.equal(retrying.deferredCaptures[0]?.retryStatus, "pending");
  assert.equal(succeeded.deferredCaptures.length, 0);
  assert.equal(succeeded.captures[0]?.captureId, "proposal-1");
  assert.equal(succeeded.stage, "capture");
});
