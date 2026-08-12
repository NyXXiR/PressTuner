export const demoStages = ["draft", "evidence", "verification", "complete"] as const;

export type DemoStage = (typeof demoStages)[number];
export type DemoVerdict = "PASS" | "WARN" | "BLOCK";

export type DemoPressRelease = Readonly<{
  eyebrow: string;
  title: string;
  subtitle: string;
  lead: string;
  paragraphs: readonly string[];
  quote: string;
  boilerplate: string;
}>;

export type DemoDocument = Readonly<{
  id: string;
  name: string;
  path: string;
  role: "FACT" | "STYLE";
  pageCount: number;
  description: string;
}>;

export type DemoEvidenceCandidate = Readonly<{
  id: string;
  documentId: string;
  documentPath: string;
  pageStart: number;
  pageEnd: number;
  pageHref: string;
  excerpt: string;
  translatedFact: string;
  canSupportFactualClaim: boolean;
  exclusionReason?: string;
}>;

export type DemoFinding = Readonly<{
  id: string;
  claimId: string;
  claim: string;
  verdict: DemoVerdict;
  explanation: string;
  evidenceCandidateId?: string;
}>;

export type DemoSourceMapEntry = Readonly<{
  claimId: string;
  claim: string;
  documentPath: string;
  documentName: string;
  pageStart: number;
  pageEnd: number;
  pageHref: string;
}>;

export const initialDemoStage: DemoStage = "draft";

const FACT_PDF_PATH = "/samples/press-ai-debugger/basic-multipage-facts.pdf";
const STYLE_PDF_PATH = "/samples/press-ai-debugger/fact-style-guide.pdf";

export const demoDocuments: readonly DemoDocument[] = [
  {
    id: "basic-multipage-facts",
    name: "basic-multipage-facts.pdf",
    path: FACT_PDF_PATH,
    role: "FACT",
    pageCount: 3,
    description: "출시일, 베타 참여 팀, 시간 절감 수치를 담은 사실 문서",
  },
  {
    id: "fact-style-guide",
    name: "fact-style-guide.pdf",
    path: STYLE_PDF_PATH,
    role: "STYLE",
    pageCount: 1,
    description: "간결한 능동태 문장만 안내하는 문체 문서",
  },
] as const;

export const demoEvidenceCandidates: readonly DemoEvidenceCandidate[] = [
  {
    id: "launch-date-p1",
    documentId: "basic-multipage-facts",
    documentPath: FACT_PDF_PATH,
    pageStart: 1,
    pageEnd: 1,
    pageHref: "/samples/press-ai-debugger/basic-multipage-facts.pdf#page=1",
    excerpt: "FICTIONAL-LUMEN-BRIDGE launch date: 2031-04-17.",
    translatedFact: "루멘 브릿지 출시일은 2031년 4월 17일이다.",
    canSupportFactualClaim: true,
  },
  {
    id: "beta-teams-p2",
    documentId: "basic-multipage-facts",
    documentPath: FACT_PDF_PATH,
    pageStart: 2,
    pageEnd: 2,
    pageHref: "/samples/press-ai-debugger/basic-multipage-facts.pdf#page=2",
    excerpt: "FICTIONAL-LUMEN-BRIDGE tested by 27 beta teams.",
    translatedFact: "27개 베타 팀이 루멘 브릿지를 테스트했다.",
    canSupportFactualClaim: true,
  },
  {
    id: "time-reduction-p3",
    documentId: "basic-multipage-facts",
    documentPath: FACT_PDF_PATH,
    pageStart: 3,
    pageEnd: 3,
    pageHref: "/samples/press-ai-debugger/basic-multipage-facts.pdf#page=3",
    excerpt: "FICTIONAL-LUMEN-BRIDGE reports 40 percent time reduction.",
    translatedFact: "루멘 브릿지는 업무 시간을 40% 줄였다.",
    canSupportFactualClaim: true,
  },
  {
    id: "style-only-p1",
    documentId: "fact-style-guide",
    documentPath: STYLE_PDF_PATH,
    pageStart: 1,
    pageEnd: 1,
    pageHref: "/samples/press-ai-debugger/fact-style-guide.pdf#page=1",
    excerpt: "STYLE-ONLY: use concise sentences and active voice. This is not factual evidence.",
    translatedFact: "간결한 능동태 문장을 사용한다.",
    canSupportFactualClaim: false,
    exclusionReason: "STYLE 문서는 표현만 안내하므로 사실 근거로 사용할 수 없습니다.",
  },
] as const;

export const initialDemoPressRelease: DemoPressRelease = {
  eyebrow: "2031년 4월 17일 · 서울",
  title: "‘루멘 브릿지’, 2031년 4월 17일 출시",
  subtitle: "27개 베타 팀이 테스트한 업계 최초의 AI 협업 도구",
  lead:
    "루멘 브릿지는 2031년 4월 17일 출시되며 27개 베타 팀의 테스트를 거쳤다.",
  paragraphs: [
    "루멘 브릿지는 업무 시간을 32% 줄였다고 보고했다.",
    "루멘 브릿지는 업계 최초의 AI 협업 도구다.",
  ],
  quote:
    "“27개 베타 팀의 테스트를 거쳐 4월 17일 공개합니다.”",
  boilerplate:
    "이 보도자료와 회사·제품명은 controlled-synthetic 데모를 위해 구성했습니다.",
} as const;

export const verificationFindings: readonly DemoFinding[] = [
  {
    id: "finding-launch-date",
    claimId: "launch-date",
    claim: "2031년 4월 17일 출시",
    verdict: "PASS",
    explanation: "FACT 문서 p.1의 출시일과 일치합니다.",
    evidenceCandidateId: "launch-date-p1",
  },
  {
    id: "finding-beta-teams",
    claimId: "beta-teams",
    claim: "27개 베타 팀이 테스트",
    verdict: "PASS",
    explanation: "FACT 문서 p.2의 참여 팀 수와 일치합니다.",
    evidenceCandidateId: "beta-teams-p2",
  },
  {
    id: "finding-time-reduction",
    claimId: "time-reduction",
    claim: "업무 시간 32% 단축",
    verdict: "WARN",
    explanation: "FACT 문서 p.3은 40%를 제시합니다. 수치를 수정하고 재검증해야 합니다.",
    evidenceCandidateId: "time-reduction-p3",
  },
  {
    id: "finding-industry-first",
    claimId: "industry-first",
    claim: "업계 최초",
    verdict: "BLOCK",
    explanation: "어느 FACT 페이지에도 없는 최상급 주장입니다. STYLE 문서도 사실 근거가 될 수 없습니다.",
  },
] as const;

export const correctedDemoPressRelease: DemoPressRelease = {
  ...initialDemoPressRelease,
  subtitle: "27개 베타 팀이 테스트한 루멘 브릿지",
  paragraphs: [
    "루멘 브릿지는 업무 시간을 40% 줄였다.",
  ],
} as const;

export const correctedDemoFindings: readonly DemoFinding[] = [
  verificationFindings[0]!,
  verificationFindings[1]!,
  {
    ...verificationFindings[2]!,
    claim: "업무 시간 40% 단축",
    verdict: "PASS",
    explanation: "32%를 40%로 수정해 FACT 문서 p.3과 일치합니다.",
  },
] as const;

export const demoSourceMap: readonly DemoSourceMapEntry[] = [
  {
    claimId: "launch-date",
    claim: "2031년 4월 17일 출시",
    documentPath: FACT_PDF_PATH,
    documentName: "basic-multipage-facts.pdf",
    pageStart: 1,
    pageEnd: 1,
    pageHref: "/samples/press-ai-debugger/basic-multipage-facts.pdf#page=1",
  },
  {
    claimId: "beta-teams",
    claim: "27개 베타 팀이 테스트",
    documentPath: FACT_PDF_PATH,
    documentName: "basic-multipage-facts.pdf",
    pageStart: 2,
    pageEnd: 2,
    pageHref: "/samples/press-ai-debugger/basic-multipage-facts.pdf#page=2",
  },
  {
    claimId: "time-reduction",
    claim: "업무 시간을 40% 줄였다",
    documentPath: FACT_PDF_PATH,
    documentName: "basic-multipage-facts.pdf",
    pageStart: 3,
    pageEnd: 3,
    pageHref: "/samples/press-ai-debugger/basic-multipage-facts.pdf#page=3",
  },
] as const;

export function isDemoFinalizable(findings: readonly DemoFinding[]): boolean {
  return findings.every((finding) => finding.verdict !== "BLOCK");
}

export function advanceDemoStage(
  stage: DemoStage,
  findings: readonly DemoFinding[] = verificationFindings,
): DemoStage {
  if (stage === "draft") return "evidence";
  if (stage === "evidence") return "verification";
  if (stage === "verification") {
    return isDemoFinalizable(findings) ? "complete" : "verification";
  }
  return "complete";
}

export function evidencePageHref(
  documentPath: string,
  pageStart: number,
): string {
  return `${documentPath}#page=${pageStart}`;
}
