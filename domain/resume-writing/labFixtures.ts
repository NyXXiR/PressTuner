import type {
  LabExperienceBrick,
  LabQuestion,
  ResumeWritingLabState,
} from "./labTypes";

export const SAMPLE_RAW_INPUT = `회사: 모노랩
직무: 프로덕트 매니저
마감일: 2026-08-15

주요 업무
- 고객 행동을 분석해 제품 문제를 정의합니다.
- 디자인·개발과 함께 실험을 설계하고 실행합니다.

자기소개서 문항
1. 지원 동기와 입사 후 기여할 수 있는 점을 작성해 주세요. (700자)
2. 도전적인 목표를 세우고 끝까지 달성한 경험을 작성해 주세요. (700자)`;

const INITIAL_BRICKS = [
  {
    id: "brick-onboarding",
    title: "가입 흐름 이탈 구간 개선",
    content:
      "행동 로그와 인터뷰를 함께 분석해 가입 흐름의 이탈 구간을 찾고, 디자인·개발과 개선안을 출시했습니다.",
    tags: ["문제 정의", "고객 행동", "협업"],
    sourceQuestionId: null,
  },
  {
    id: "brick-experiment",
    title: "전환율 개선 실험",
    content:
      "정보 과부하 가설을 세 단계로 나눠 검증하고 핵심 행동 전환율을 31% 높였습니다.",
    tags: ["실험", "데이터", "성과"],
    sourceQuestionId: null,
  },
] as const satisfies readonly LabExperienceBrick[];

function valueAfterPrefix(lines: readonly string[], prefix: string): string {
  const line = lines.find((item) => item.startsWith(`${prefix}:`));
  return line?.slice(prefix.length + 1).trim() ?? "";
}

function parsedQuestions(rawText: string): readonly LabQuestion[] {
  const matches = [...rawText.matchAll(/^\s*\d+[.)]\s*(.+?)\s*\((\d+)자\)\s*$/gm)];
  const prompts = matches.length > 0
    ? matches.map((match) => ({
        prompt: match[1]?.trim() ?? "",
        charLimit: Number(match[2] ?? 700),
      }))
    : [
        {
          prompt: "지원 동기와 입사 후 기여할 수 있는 점을 작성해 주세요.",
          charLimit: 700,
        },
        {
          prompt: "도전적인 목표를 세우고 끝까지 달성한 경험을 작성해 주세요.",
          charLimit: 700,
        },
      ];

  return prompts.map((item, index) => ({
    id: `question-${index + 1}`,
    prompt: item.prompt,
    charLimit: item.charLimit,
    answer: "",
    status: "ready",
    revisionCount: 0,
    messages: [],
    pendingSuggestion: null,
    linkedBrickIds: [INITIAL_BRICKS[index % INITIAL_BRICKS.length]?.id ?? INITIAL_BRICKS[0].id],
  }));
}

export function organizeLabIntake(
  state: ResumeWritingLabState,
): ResumeWritingLabState {
  const lines = state.intake.rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const company = valueAfterPrefix(lines, "회사") || "입력한 회사";
  const role = valueAfterPrefix(lines, "직무") || "지원 직무";
  const questions = parsedQuestions(state.intake.rawText);

  return {
    ...state,
    stage: "review",
    target: {
      company,
      role,
      deadline: valueAfterPrefix(lines, "마감일"),
      summary: `${company}의 ${role}는 고객 행동에서 문제를 찾고 여러 직군과 실행 가능한 실험을 만드는 역할입니다.`,
      employmentType: "정규직",
      location: "서울",
      keySignals: ["고객 문제 정의", "데이터 기반 실험", "직군 간 협업"],
      writingGuidance: ["행동과 결과를 수치로 연결", "지원 직무 기여로 마무리"],
    },
    questions,
    activeQuestionId: questions[0]?.id ?? null,
    notice: "붙여넣은 내용을 샘플 AI가 정리했습니다. 아래 내용이 맞는지 확인해 주세요.",
  };
}

export function draftFor(
  question: LabQuestion,
  state: ResumeWritingLabState,
): string {
  const linked = state.bricks.filter((brick) =>
    question.linkedBrickIds.includes(brick.id),
  );
  const experience = linked.map((brick) => brick.content).join(" ");

  if (question.prompt.includes("지원 동기")) {
    return `${state.target.company}의 ${state.target.role}는 고객의 행동에서 문제를 발견하고 실행 가능한 실험으로 바꾸는 역할이라고 생각합니다. ${experience} 이 경험을 바탕으로 고객이 막히는 순간을 빠르게 찾고 팀이 실행할 수 있는 문제로 구체화하겠습니다.`;
  }

  return `높은 목표를 세웠지만 초기 실험은 유의미한 차이를 만들지 못했습니다. ${experience} 가설을 작게 나누어 매주 검증한 결과를 팀의 공통 지표로 남겼고, 끝까지 개선을 이어가는 실행 방식을 배웠습니다.`;
}

export function suggestionFor(
  question: LabQuestion,
  prompt: string,
  state: ResumeWritingLabState,
) {
  const linkedContext = state.bricks
    .filter((brick) => question.linkedBrickIds.includes(brick.id))
    .map((brick) => brick.content)
    .join(" ");
  return {
    original: question.answer,
    revised: `${question.answer}\n\n연결 경험 반영: ${linkedContext}\n\n그 과정에서 핵심 구간의 이탈률을 42% 낮췄고, 공통 지표를 만들어 팀의 의사결정 시간을 3일에서 하루로 줄였습니다.`,
    instruction: prompt.trim(),
  };
}

export function createResumeWritingLabState(): ResumeWritingLabState {
  return {
    schemaVersion: 2,
    stage: "intake",
    intake: { rawText: SAMPLE_RAW_INPUT, postingUrl: "" },
    target: {
      company: "",
      role: "",
      deadline: "",
      summary: "",
      employmentType: "",
      location: "",
      keySignals: [],
      writingGuidance: [],
    },
    questions: [],
    activeQuestionId: null,
    bricks: INITIAL_BRICKS,
    inlineCandidate: null,
    captureCandidates: [],
    sessionSavedBrickIds: [],
    notice: null,
  };
}
