export const BRIEF_NORMALIZATION_VERSION = "grounded-v2";

export const BRIEF_ANNOUNCE_TYPES = [
  "신제품 출시",
  "서비스 업데이트",
  "제휴/파트너십",
  "행사/이벤트 개최",
  "성과 발표",
  "기타",
] as const;

export type BriefEvidenceSource = {
  id: string;
  text: string;
};

type Candidate = {
  value?: unknown;
  sourceId?: unknown;
  evidence?: unknown;
};

type RawGroundedBrief = {
  serviceName?: Candidate;
  announceType?: Candidate;
  oneLiner?: Candidate;
  points?: Candidate[];
  quoteWho?: Candidate;
  quoteMessage?: Candidate;
  eventAt?: Candidate;
  publishAt?: Candidate;
};

export type SafeNormalizedBrief = {
  serviceName: string;
  announceType: string;
  oneLiner: string;
  points: string[];
  quoteWho: string;
  quoteMessage: string;
  eventAt: string;
  publishAt: string;
};

function normalizeEvidence(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[“”‘’"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ko-KR");
}

function supportedCandidate(
  candidate: Candidate | undefined,
  sourceMap: Map<string, string>,
) {
  const value =
    typeof candidate?.value === "string" ? candidate.value.trim() : "";
  const sourceId =
    typeof candidate?.sourceId === "string" ? candidate.sourceId.trim() : "";
  const evidence =
    typeof candidate?.evidence === "string" ? candidate.evidence.trim() : "";
  const source = sourceMap.get(sourceId);
  if (!value || !evidence || !source) return null;
  if (!normalizeEvidence(source).includes(normalizeEvidence(evidence))) {
    return null;
  }
  return { value, evidence };
}

function literalCandidate(
  candidate: Candidate | undefined,
  sourceMap: Map<string, string>,
) {
  const supported = supportedCandidate(candidate, sourceMap);
  if (!supported) return "";
  return normalizeEvidence(supported.evidence).includes(
    normalizeEvidence(supported.value),
  )
    ? supported.value
    : "";
}

function summaryCandidate(
  candidate: Candidate | undefined,
  sourceMap: Map<string, string>,
) {
  const supported = supportedCandidate(candidate, sourceMap);
  if (!supported) return "";

  const valueNumbers = supported.value.match(/\d+(?:[.,]\d+)*(?:%p|%|개|명|건|회|원|시|분)?/g) ?? [];
  const normalizedEvidence = normalizeEvidence(supported.evidence);
  if (
    valueNumbers.some(
      (number) => !normalizedEvidence.includes(normalizeEvidence(number)),
    )
  ) {
    return "";
  }
  return supported.value;
}

function timestampCandidate(
  candidate: Candidate | undefined,
  sourceMap: Map<string, string>,
) {
  const supported = supportedCandidate(candidate, sourceMap);
  if (!supported) return "";
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(supported.value)) return "";
  return normalizeEvidence(supported.evidence).includes(
    normalizeEvidence(supported.value),
  )
    ? supported.value
    : "";
}

export function sanitizeGroundedBrief(
  raw: RawGroundedBrief,
  sources: readonly BriefEvidenceSource[],
): SafeNormalizedBrief {
  const sourceMap = new Map(
    sources
      .filter(({ id, text }) => id.trim() && text.trim())
      .map(({ id, text }) => [id, text]),
  );
  const announce = supportedCandidate(raw.announceType, sourceMap)?.value;
  const quoteWho = literalCandidate(raw.quoteWho, sourceMap);
  const quoteMessage = literalCandidate(raw.quoteMessage, sourceMap);

  return {
    serviceName: literalCandidate(raw.serviceName, sourceMap),
    announceType: BRIEF_ANNOUNCE_TYPES.includes(
      announce as (typeof BRIEF_ANNOUNCE_TYPES)[number],
    )
      ? (announce as string)
      : "기타",
    oneLiner: summaryCandidate(raw.oneLiner, sourceMap),
    points: Array.isArray(raw.points)
      ? raw.points
          .map((point) => summaryCandidate(point, sourceMap))
          .filter(Boolean)
      : [],
    quoteWho: quoteWho && quoteMessage ? quoteWho : "",
    quoteMessage: quoteWho && quoteMessage ? quoteMessage : "",
    eventAt: timestampCandidate(raw.eventAt, sourceMap),
    publishAt: timestampCandidate(raw.publishAt, sourceMap),
  };
}

export function buildGroundedBriefPrompts(args: {
  tone: string;
  sources: readonly BriefEvidenceSource[];
}) {
  const system = `
너는 한국어 보도자료의 브리프를 근거 기반으로 정리한다.
제공된 출처에 문자 그대로 존재하는 근거만 사용하고, 날짜·시간·수치·인물·직책·인용구를 추측하거나 보완하지 마라.
연도, 월, 일, 시각 중 하나라도 빠진 날짜는 완성하지 말고 빈 값으로 둔다.
각 값은 반드시 {"value":"...", "sourceId":"...", "evidence":"출처의 짧은 원문"} 형식으로 반환한다.
한 줄 요약과 핵심 포인트는 evidence의 의미를 벗어나지 않는 범위에서 간결하게 바꿔 쓸 수 있다. 숫자·날짜·고유명사는 evidence에 있는 값을 그대로 유지한다.
측정 기준, 집계 방식, 표본, 적용 조건, 예외, 제한사항처럼 수치나 성과의 의미를 제한하는 문구는 생략하지 말고 별도 핵심 포인트로 보존한다.
핵심 포인트 points만 위 객체의 배열이다. 근거가 없으면 value, sourceId, evidence를 모두 빈 문자열로 둔다.
announceType은 신제품 출시, 서비스 업데이트, 제휴/파트너십, 행사/이벤트 개최, 성과 발표, 기타 중 하나다.
반드시 JSON 객체 하나만 반환한다. 출력 키: serviceName, announceType, oneLiner, points, quoteWho, quoteMessage, eventAt, publishAt.
eventAt과 publishAt의 value는 근거에 전체 시각이 명시된 경우에만 YYYY-MM-DD HH:mm 형식으로 쓴다.
톤: ${args.tone}
`.trim();
  const user = args.sources
    .map(({ id, text }) => `[${id}]\n${text}`)
    .join("\n\n");
  return { system, user };
}

export async function normalizeBriefFromEvidence(args: {
  rawText: string;
  tone: string;
  additionalSources?: readonly BriefEvidenceSource[];
  complete: (prompts: { system: string; user: string }) => Promise<string>;
}) {
  const sources: BriefEvidenceSource[] = [
    { id: "memo", text: args.rawText },
    ...(args.additionalSources ?? []),
  ];
  const prompts = buildGroundedBriefPrompts({ tone: args.tone, sources });
  const content = await args.complete(prompts);
  let parsed: RawGroundedBrief;
  try {
    parsed = JSON.parse(content) as RawGroundedBrief;
  } catch {
    throw new Error("BRIEF_NORMALIZATION_JSON_INVALID");
  }
  return sanitizeGroundedBrief(parsed, sources);
}
