import type { Brick, QuestionState, TargetInfo } from "@/stores/useResumeWriteStore";

export const tutorialRawInputText = `브리프랩 / Product Manager

[B2C SaaS의 신규 사용자 활성화를 담당하는 프로덕트 매니저]

마감일: 2025-06-30까지

주요 업무:
- 신규 사용자 온보딩 퍼널 분석 및 개선
- 제품 활성화 지표 정의와 실험 설계
- 디자인, 개발, 마케팅 팀과의 협업

자격요건:
- 사용자 문제를 데이터와 인터뷰로 정의한 경험
- 웹 서비스 개선 프로젝트를 주도한 경험

우대사항:
- AI 기반 생산성 도구 또는 SaaS 제품 경험
- 초기 제품의 온보딩 개선 경험

자기소개서 문항:
1. 신규 사용자의 문제를 발견하고 제품 경험을 개선했던 사례를 작성해 주세요. (700자)
2. 여러 직군과 협업하며 목표를 달성했던 경험과 본인의 역할을 설명해 주세요. (700자)
3. briefflow의 온보딩을 개선한다면 어떤 순서로 문제를 검증하고 실행하겠습니까? (700자)`;

export const tutorialBricks: Brick[] = [
  {
    id: "tutorial-brick-1",
    title: "신규 사용자 온보딩 개선",
    content:
      "첫 방문 사용자가 핵심 기능을 이해하지 못하고 이탈하는 문제를 발견해, 가입 직후 필요한 행동을 3단계로 재구성하고 샘플 데이터 체험 흐름을 설계했습니다.",
    originalText:
      "신규 사용자의 첫 세션 데이터를 확인하니 대시보드 진입 후 다음 행동을 찾지 못해 이탈하는 비율이 높았습니다. 이력서 등록, 문항 입력, 초안 생성 순서를 명확히 보여주는 온보딩과 샘플 체험을 제안했습니다.",
    tags: ["온보딩", "UX", "전환율"],
    isAiSuggested: true,
    isSelected: true,
  },
  {
    id: "tutorial-brick-2",
    title: "자소서 문항 자동 정리 기능",
    content:
      "채용 공고와 자기소개서 문항을 한 번에 붙여넣으면 회사명, 직무, 문항, 글자 수를 구조화해 작성 단계로 넘기는 기능을 기획하고 검증했습니다.",
    originalText:
      "사용자가 공고 URL과 문항 목록을 따로 정리해야 하는 부담을 줄이기 위해, 원문을 붙여넣으면 AI가 핵심 정보를 추출하고 문항별 글자 수를 정리하는 흐름을 만들었습니다.",
    tags: ["AI", "문항정리", "제품기획"],
    isAiSuggested: true,
    isSelected: true,
  },
  {
    id: "tutorial-brick-3",
    title: "반복 작성 업무 자동화",
    content:
      "운영자가 반복해서 작성하던 안내 문구와 상태 메시지를 템플릿화하고, 상황별 추천 문구를 제공해 작성 시간을 줄였습니다.",
    originalText:
      "동일한 안내 문구를 매번 새로 작성하는 비효율을 발견했습니다. 자주 쓰는 문구를 템플릿으로 정리하고 상황별 추천 문구를 제공해 운영 업무 시간을 단축했습니다.",
    tags: ["자동화", "운영개선", "생산성"],
    isAiSuggested: true,
    isSelected: true,
  },
];

export const tutorialTargetInfo: TargetInfo = {
  company: "브리프랩",
  job: "Product Manager",
  brief: {
    summary:
      "B2C SaaS의 신규 사용자 활성화를 담당하는 프로덕트 매니저 포지션입니다. 사용자의 첫 경험을 개선하고, 핵심 행동 전환율을 높이는 실험 설계와 실행 경험을 중요하게 봅니다.",
    deadline: "2025-06-30",
    employmentType: "정규직",
    location: "서울 또는 원격",
    coreResponsibilities: [
      "신규 사용자 온보딩 퍼널 분석 및 개선",
      "제품 활성화 지표 정의와 실험 설계",
      "디자인, 개발, 마케팅 팀과의 협업",
    ],
    requirements: [
      "사용자 문제를 데이터와 인터뷰로 정의한 경험",
      "웹 서비스 개선 프로젝트를 주도한 경험",
    ],
    preferredQualifications: [
      "AI 기반 생산성 도구 또는 SaaS 제품 경험",
      "초기 제품의 온보딩 개선 경험",
    ],
    keySignals: ["문제 정의", "사용자 관점", "실험 설계", "협업"],
    writingGuidance: [
      "온보딩 문제를 발견한 계기와 실제로 바꾼 흐름을 구체적으로 설명하세요.",
      "정량 지표가 없으면 사용자의 행동 변화나 팀의 의사결정 변화를 중심으로 쓰세요.",
    ],
  },
};

export const tutorialQuestions: QuestionState[] = [
  {
    id: "tutorial-question-1",
    questionText:
      "신규 사용자의 문제를 발견하고 제품 경험을 개선했던 사례를 작성해 주세요.",
    charLimit: 700,
    answer: "",
    relatedBricks: [tutorialBricks[0], tutorialBricks[1]],
    isSaved: true,
    isCompleted: false,
    draftStatus: "idle",
    draftError: null,
  },
  {
    id: "tutorial-question-2",
    questionText:
      "여러 직군과 협업하며 목표를 달성했던 경험과 본인의 역할을 설명해 주세요.",
    charLimit: 700,
    answer: "",
    relatedBricks: [tutorialBricks[0], tutorialBricks[2]],
    isSaved: true,
    isCompleted: false,
    draftStatus: "idle",
    draftError: null,
  },
  {
    id: "tutorial-question-3",
    questionText:
      "briefflow의 온보딩을 개선한다면 어떤 순서로 문제를 검증하고 실행하겠습니까?",
    charLimit: 700,
    answer: "",
    relatedBricks: [tutorialBricks[0]],
    isSaved: true,
    isCompleted: false,
    draftStatus: "idle",
    draftError: null,
  },
];

export const tutorialDraftAnswers = [
  "첫 방문 사용자가 대시보드에 들어온 뒤 다음 행동을 찾지 못하고 이탈하는 문제를 발견했습니다. 저는 사용자 행동 로그와 첫 세션 녹화 내용을 함께 확인해, 사용자가 이력서 등록과 문항 입력의 선후관계를 이해하지 못한다는 점을 문제로 정의했습니다. 이후 핵심 행동을 이력서 등록, 문항 가져오기, 초안 생성의 3단계로 재구성하고 샘플 데이터 체험 흐름을 추가했습니다. 이 과정에서 디자이너와는 첫 화면의 정보 구조를, 개발자와는 실제 데이터와 샘플 데이터가 섞이지 않는 상태 관리를 논의했습니다. 결과적으로 사용자는 입력 부담 없이 제품의 핵심 가치를 먼저 확인할 수 있게 되었고, 팀은 온보딩 개선 방향을 더 빠르게 검증할 수 있었습니다.",
  "온보딩 개선 프로젝트에서는 디자인, 개발, 마케팅 담당자와 함께 사용자의 첫 경험을 다시 설계했습니다. 저는 먼저 각 팀이 바라보는 문제를 하나의 퍼널로 정리했습니다. 마케팅은 가입 이후 활성화율을, 디자인은 첫 화면의 인지 부담을, 개발은 실제 데이터 생성 시점을 중요하게 보고 있었습니다. 저는 이 관점을 연결해 실제 계정 데이터에는 영향을 주지 않는 샘플 체험 흐름을 제안했고, 팀이 같은 목표를 보도록 단계별 지표를 정의했습니다. 협업 과정에서는 구현 범위를 작게 유지하기 위해 대시보드 버튼, 읽기 전용 샘플 입력, 작성 흐름 진입만 우선 만들었습니다. 덕분에 팀은 큰 리스크 없이 아이디어를 빠르게 검증할 수 있었습니다.",
  "briefflow의 온보딩을 개선한다면 먼저 신규 사용자가 첫 화면에서 멈추는 지점을 확인하겠습니다. 이후 사용자가 실제 이력서와 자소서 문항을 준비하지 않아도 핵심 가치를 이해할 수 있도록 샘플 데이터 기반 튜토리얼을 제공합니다. 이때 샘플 데이터는 실제 API 저장을 거치지 않고 클라이언트 상태로만 유지해 사용자의 계정 데이터와 분리하겠습니다. 다음으로 튜토리얼 안에서는 입력값을 읽기 전용으로 두고, 사용자가 어떤 순서로 브릭과 문항이 연결되는지만 볼 수 있게 만듭니다. 마지막으로 튜토리얼 완료 후에는 내 이력서로 시작하는 버튼을 제공해 실제 작업으로 자연스럽게 전환시키겠습니다.",
];

export function createTutorialQuestions(withDrafts = false): QuestionState[] {
  return tutorialQuestions.map((question, index) => ({
    ...question,
    answer: withDrafts ? tutorialDraftAnswers[index] ?? "" : "",
    relatedBricks: question.relatedBricks.map((brick) => ({ ...brick })),
    draftStatus: withDrafts ? "ready" : "idle",
  }));
}
