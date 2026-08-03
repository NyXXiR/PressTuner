export type DemoStage = "notes" | "brief" | "draft";

export type RoughNote = Readonly<{
  id: string;
  label: string;
  text: string;
  source: string;
}>;

export type DemoBrief = Readonly<{
  announcement: string;
  audience: string;
  keyMessages: readonly string[];
  proofPoints: readonly string[];
  quoteDirection: string;
}>;

export type DemoPressRelease = Readonly<{
  eyebrow: string;
  title: string;
  subtitle: string;
  lead: string;
  paragraphs: readonly string[];
  quote: string;
  boilerplate: string;
}>;

export const initialDemoStage: DemoStage = "notes";

export const roughNotes: readonly RoughNote[] = [
  {
    id: "launch",
    label: "출시",
    text: "FlowNote 2.0 — 9월 18일 공개",
    source: "제품팀 메모",
  },
  {
    id: "feature",
    label: "핵심 기능",
    text: "팀 지식 검색 + 문장별 근거 연결",
    source: "기능 정리",
  },
  {
    id: "proof",
    label: "성과",
    text: "비공개 베타에서 초안 검토 시간 평균 32% 단축",
    source: "베타 리포트",
  },
  {
    id: "audience",
    label: "대상",
    text: "작은 커뮤니케이션 팀과 빠르게 성장하는 스타트업",
    source: "메시지 워크숍",
  },
] as const;

export const demoBrief: DemoBrief = {
  announcement: "브리프랩이 9월 18일 FlowNote 2.0을 출시한다.",
  audience: "근거 있는 콘텐츠를 빠르게 완성해야 하는 소규모 커뮤니케이션 팀",
  keyMessages: [
    "팀 문서를 검색해 초안에 필요한 사실을 빠르게 찾는다.",
    "문장별 근거 연결로 검토 과정을 단순하게 만든다.",
    "비공개 베타에서 초안 검토 시간을 평균 32% 줄였다.",
  ],
  proofPoints: [
    "출시일 · 9월 18일",
    "핵심 기능 · 팀 지식 검색, 문장별 근거 연결",
    "베타 결과 · 검토 시간 평균 32% 단축",
  ],
  quoteDirection:
    "속도보다 신뢰를 희생하지 않고, 팀이 발표문을 더 빨리 완성하게 돕는다는 메시지",
} as const;

export const demoPressRelease: DemoPressRelease = {
  eyebrow: "2026년 9월 18일 · 서울",
  title: "브리프랩, 근거 중심 협업 도구 ‘FlowNote 2.0’ 출시",
  subtitle:
    "팀 지식 검색과 문장별 근거 연결로 보도자료 초안 검토 시간을 단축",
  lead:
    "AI 문서 워크스페이스를 운영하는 브리프랩은 9월 18일 팀 지식 검색과 문장별 근거 연결 기능을 갖춘 FlowNote 2.0을 출시한다고 밝혔다.",
  paragraphs: [
    "FlowNote 2.0은 여러 문서에 흩어진 제품 정보와 성과 수치를 한곳에서 찾고, 초안의 각 문장을 원문 근거와 함께 검토할 수 있도록 설계됐다. 작은 커뮤니케이션 팀도 자료를 다시 확인하는 시간을 줄이면서 일관된 발표문을 만들 수 있다.",
    "브리프랩이 진행한 비공개 베타에서는 참여 팀의 초안 검토 시간이 평균 32% 단축됐다. 이번 버전은 빠르게 성장하는 스타트업이 제품 소식을 정리하고 배포 준비까지 이어가는 과정에 초점을 맞췄다.",
  ],
  quote:
    "“콘텐츠를 빨리 만드는 것만큼, 팀이 그 내용을 믿고 공개할 수 있어야 합니다. FlowNote 2.0은 초안과 근거 사이의 거리를 줄여 더 빠르고 자신 있는 검토를 돕습니다.”",
  boilerplate:
    "브리프랩은 팀의 거친 메모와 자료를 검토 가능한 브리프와 배포용 문서로 연결하는 AI 워크스페이스를 만든다.",
} as const;

export function advanceDemoStage(stage: DemoStage): DemoStage {
  if (stage === "notes") return "brief";
  if (stage === "brief") return "draft";
  return "draft";
}
