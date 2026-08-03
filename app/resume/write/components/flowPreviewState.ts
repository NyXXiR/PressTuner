import {
  createResumeWriteFlowState,
  type FlowBrick,
  type FlowCapture,
  type FlowQuestion,
  type FlowStage,
  type ResumeWriteFlowState,
} from "@/domain/resume-writing/flowMachine";

const PREVIEW_BRICKS = [
  {
    id: "preview-brick-growth",
    title: "가입 전환율 개선",
    content: "온보딩 이탈 구간을 분석하고 가입 전환율을 42% 개선했습니다.",
    tags: ["데이터", "제품 개선"],
  },
  {
    id: "preview-brick-collaboration",
    title: "개발·디자인 협업 조율",
    content: "공통 우선순위를 정의해 출시 일정을 2주 단축했습니다.",
    tags: ["협업", "리더십"],
  },
] satisfies readonly FlowBrick[];

const PREVIEW_QUESTIONS = [
  {
    id: "preview-question-1",
    prompt: "지원 동기와 입사 후 기여할 수 있는 점을 작성해 주세요.",
    charLimit: 700,
    answer:
      "데이터로 고객의 이탈 지점을 찾고 제품 경험을 개선해 온 역량을 바탕으로, 모노랩의 핵심 지표 성장에 기여하겠습니다.",
    status: "revised",
    aiAdvice: "회사에서 중요하게 보는 제품 지표와 본인의 개선 경험을 연결하세요.",
    draftStatus: "ready",
    draftError: null,
    linkedBrickIds: ["preview-brick-growth"],
    messages: [
      {
        id: "preview-message-1",
        role: "user",
        body: "성과 수치를 조금 더 선명하게 보여줘.",
      },
      {
        id: "preview-message-2",
        role: "assistant",
        body: "요청을 반영한 수정안을 만들었어요. 비교 후 적용해 주세요.",
      },
    ],
    pendingPrompt: null,
    pendingSuggestion: {
      original:
        "고객의 이탈 지점을 찾고 제품 경험을 개선한 경험을 바탕으로 회사에 기여하겠습니다.",
      revised:
        "온보딩 이탈 구간을 분석해 가입 전환율을 42% 개선한 경험을 바탕으로, 모노랩의 핵심 지표 성장에 기여하겠습니다.",
      instruction: "성과 수치를 조금 더 선명하게 보여줘.",
      grounding: null,
    },
    suggestionStatus: "idle",
    suggestionError: null,
    saving: false,
    saveError: null,
    revisionCount: 2,
    deferredCapture: false,
    grounding: null,
    verification: null,
  },
  {
    id: "preview-question-2",
    prompt: "여러 직군과 협업해 목표를 달성한 경험을 작성해 주세요.",
    charLimit: 900,
    answer:
      "개발·디자인과 공통 우선순위를 정의해 의사결정 시간을 줄이고 출시 일정을 2주 단축했습니다.",
    status: "drafted",
    aiAdvice: "갈등보다 합의 기준과 본인의 구체적인 조율 행동을 보여주세요.",
    draftStatus: "ready",
    draftError: null,
    linkedBrickIds: ["preview-brick-collaboration"],
    messages: [],
    pendingPrompt: null,
    pendingSuggestion: null,
    suggestionStatus: "idle",
    suggestionError: null,
    saving: false,
    saveError: null,
    revisionCount: 0,
    deferredCapture: false,
    grounding: null,
    verification: null,
  },
] satisfies readonly FlowQuestion[];

const PREVIEW_CAPTURE = {
  captureId: "preview-capture-1",
  questionId: "preview-question-1",
  summary: "답변에서 다음에 재사용할 수 있는 경험을 발견했어요.",
  items: [
    {
      previewId: "preview-experience-1",
      mode: "create",
      title: "가입 전환율 42% 개선",
      content: "온보딩 이탈 구간을 분석하고 실험해 가입 전환율을 42% 개선했습니다.",
      originalText: "온보딩 이탈 구간을 분석해 가입 전환율을 42% 개선했습니다.",
      period: null,
      tags: ["데이터", "제품 개선"],
      matchedBrickId: null,
      matchedBrickTitle: null,
      reason: null,
      existingContent: null,
      existingOriginalText: null,
    },
  ],
  selectedPreviewIds: ["preview-experience-1"],
  status: "pending",
  error: null,
} satisfies FlowCapture;

class UnexpectedPreviewStageError extends Error {
  constructor(readonly stage: never) {
    super("Unexpected resume write preview stage");
    this.name = "UnexpectedPreviewStageError";
  }
}

export function createResumeWriteFlowTutorialState(): ResumeWriteFlowState {
  return {
    ...createResumeWriteFlowPreviewState("writing"),
    appId: "tutorial",
    notice: "튜토리얼 모드입니다. 화면을 자유롭게 둘러보세요. 실제 지원서는 저장되지 않습니다.",
  };
}

export function createResumeWriteFlowPreviewState(
  stage: FlowStage,
): ResumeWriteFlowState {
  const base: ResumeWriteFlowState = {
    ...createResumeWriteFlowState(),
    intake: {
      rawText: "모노랩 프로덕트 매니저 채용 공고와 자기소개서 문항 원문",
      postingUrl: "https://example.com/jobs/product-manager",
    },
    company: "모노랩",
    job: "프로덕트 매니저",
    brief: {
      summary: "데이터 기반으로 제품 성장을 주도할 프로덕트 매니저 채용",
      deadline: "2026-07-31",
      employmentType: "정규직",
      location: "서울",
      coreResponsibilities: ["핵심 지표 정의", "제품 개선 실험"],
      requirements: ["3년 이상의 제품 운영 경험"],
      preferredQualifications: ["B2B SaaS 경험"],
      keySignals: ["데이터 기반", "직군 간 협업"],
      writingGuidance: ["성과 수치와 본인의 행동을 구체적으로 작성"],
    },
    direction: "성과 수치를 앞에 두고 담백하게 작성해 주세요.",
    userBricks: PREVIEW_BRICKS,
    pinnedBrickIds: ["preview-brick-growth"],
    questions: PREVIEW_QUESTIONS,
    notice: "관리자 프리뷰용 샘플 데이터입니다.",
  };

  switch (stage) {
    case "intake":
      return { ...base, stage, questions: [] };
    case "review":
      return { ...base, stage };
    case "writing":
      return {
        ...base,
        stage,
        appId: "preview-application",
        activeQuestionId: "preview-question-1",
        captures: [PREVIEW_CAPTURE],
      };
    case "capture":
      return {
        ...base,
        stage,
        appId: "preview-application",
        questions: PREVIEW_QUESTIONS.map((question) => ({
          ...question,
          status: "completed",
          pendingSuggestion: null,
        })),
        activeQuestionId: "preview-question-2",
        captures: [PREVIEW_CAPTURE],
      };
    case "done":
      return {
        ...base,
        stage,
        appId: "preview-application",
        questions: PREVIEW_QUESTIONS.map((question) => ({
          ...question,
          status: "completed",
          pendingSuggestion: null,
        })),
        activeQuestionId: "preview-question-2",
        captures: [{ ...PREVIEW_CAPTURE, status: "applied" }],
        productivity: {
          availableBrickCount: 8,
          capturedFromWritingCount: 1,
          reusedBrickCount: 2,
        },
      };
    default:
      throw new UnexpectedPreviewStageError(stage);
  }
}
