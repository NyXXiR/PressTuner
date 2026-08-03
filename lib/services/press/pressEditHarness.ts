export type PressBriefSnapshot = {
  serviceName: string;
  announceType: string;
  oneLiner?: string;
  points: string[];
  quoteWho?: string;
  quoteMessage?: string;
  eventAt?: string;
  publishAt?: string;
  tone?: string;
};

export type PressLockedFact = {
  id: string;
  label: string;
  value: string;
  source: "brief" | "raw_input" | "press_extra" | "user";
  required: boolean;
};

export type PressHarnessReviewNote = {
  id: string;
  quote: string;
  note: string;
  type: "HINT" | "TERM" | "TONE" | "RISK";
  sourceFactIds?: string[];
};

type PressHarnessReview = {
  sessionId: string;
  generatedAt: string;
  baseTitle: string;
  basePlain: string;
  notes: PressHarnessReviewNote[];
};

type PressHarnessPendingRewrite = {
  basedOnSessionId: string;
  userInstruction: string;
  selectedNoteIds: string[];
  title: string;
  plain: string;
  generatedAt: string;
};

type PressHarnessLineageItem = {
  at: string;
  stage: "GENERATE" | "REVIEW" | "REWRITE" | "APPLY";
  summary: string;
};

export type PressEditHarness = {
  version: 2;
  grounding: {
    rawInput: string | null;
    brief: PressBriefSnapshot | null;
    lockedFacts: PressLockedFact[];
    style: {
      styleGuideId: string | null;
      policy: string;
      examples: string;
    };
    acceptedFactIds: string[];
  };
  generation: {
    generatedAt: string;
    title: string;
    lead: string | null;
    fact: string | null;
    plain: string;
  };
  review: PressHarnessReview | null;
  pendingRewrite: PressHarnessPendingRewrite | null;
  lineage: PressHarnessLineageItem[];
};

type InitialHarnessInput = {
  title: string;
  plain: string;
  lead?: string | null;
  fact?: string | null;
  rawInput?: string | null;
  brief?: PressBriefSnapshot | null;
  styleGuideId?: string | null;
  acceptedFactIds?: string[];
  stylePolicy?: string;
  styleExamples?: string;
  generatedAt: string;
};

type MergeReviewInput = {
  sessionId: string;
  title: string;
  plain: string;
  notes: PressHarnessReviewNote[];
  generatedAt: string;
};

type MergePendingRewriteInput = {
  basedOnSessionId: string;
  userInstruction: string;
  selectedNoteIds: string[];
  title: string;
  plain: string;
  generatedAt: string;
};

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function pushLockedFact(
  list: PressLockedFact[],
  input: {
    id: string;
    label: string;
    value: string | null | undefined;
    source: PressLockedFact["source"];
    required?: boolean;
  },
) {
  const value = normalizeText(input.value);
  if (!value) return;
  list.push({
    id: input.id,
    label: input.label,
    value,
    source: input.source,
    required: input.required ?? true,
  });
}

export function buildLockedFacts(input: {
  brief?: PressBriefSnapshot | null;
  lead?: string | null;
  fact?: string | null;
  rawInput?: string | null;
}): PressLockedFact[] {
  const lockedFacts: PressLockedFact[] = [];
  const brief = input.brief ?? null;

  if (brief) {
    pushLockedFact(lockedFacts, {
      id: "brief_service_name",
      label: "서비스명",
      value: brief.serviceName,
      source: "brief",
    });
    pushLockedFact(lockedFacts, {
      id: "brief_announce_type",
      label: "발표 유형",
      value: brief.announceType,
      source: "brief",
    });
    pushLockedFact(lockedFacts, {
      id: "brief_one_liner",
      label: "핵심 한 줄",
      value: brief.oneLiner,
      source: "brief",
      required: false,
    });
    brief.points.forEach((point, index) => {
      pushLockedFact(lockedFacts, {
        id: `brief_point_${index + 1}`,
        label: `핵심 포인트 ${index + 1}`,
        value: point,
        source: "brief",
        required: false,
      });
    });
    pushLockedFact(lockedFacts, {
      id: "brief_quote_who",
      label: "인용 화자",
      value: brief.quoteWho,
      source: "brief",
      required: false,
    });
    pushLockedFact(lockedFacts, {
      id: "brief_quote_message",
      label: "인용 메시지",
      value: brief.quoteMessage,
      source: "brief",
      required: false,
    });
    pushLockedFact(lockedFacts, {
      id: "brief_event_at",
      label: "행사 시점",
      value: brief.eventAt,
      source: "brief",
      required: false,
    });
    pushLockedFact(lockedFacts, {
      id: "brief_publish_at",
      label: "배포 시점",
      value: brief.publishAt,
      source: "brief",
      required: false,
    });
    pushLockedFact(lockedFacts, {
      id: "brief_tone",
      label: "톤",
      value: brief.tone,
      source: "brief",
      required: false,
    });
  }

  pushLockedFact(lockedFacts, {
    id: "press_lead",
    label: "리드 문장",
    value: input.lead,
    source: "press_extra",
    required: false,
  });
  pushLockedFact(lockedFacts, {
    id: "press_fact",
    label: "팩트 문장",
    value: input.fact,
    source: "press_extra",
  });
  pushLockedFact(lockedFacts, {
    id: "raw_input_anchor",
    label: "원문 메모 핵심",
    value: input.rawInput,
    source: "raw_input",
    required: false,
  });

  return lockedFacts;
}

function summarizeRewriteInstruction(value: string) {
  const normalized = normalizeText(value);
  return normalized || "선택된 포인트를 반영해 재작성";
}

export function createInitialPressEditHarness(
  input: InitialHarnessInput,
): PressEditHarness {
  const brief = input.brief ?? null;
  return {
    version: 2,
    grounding: {
      rawInput: input.rawInput ?? null,
      brief,
      lockedFacts: buildLockedFacts({
        brief,
        lead: input.lead,
        fact: input.fact,
        rawInput: input.rawInput,
      }),
      style: {
        styleGuideId: input.styleGuideId ?? null,
        policy: input.stylePolicy ?? "",
        examples: input.styleExamples ?? "",
      },
      acceptedFactIds: [...(input.acceptedFactIds ?? [])],
    },
    generation: {
      generatedAt: input.generatedAt,
      title: input.title,
      lead: input.lead ?? null,
      fact: input.fact ?? null,
      plain: input.plain,
    },
    review: null,
    pendingRewrite: null,
    lineage: [
      {
        at: input.generatedAt,
        stage: "GENERATE",
        summary: "초안 생성 및 근거 잠금",
      },
    ],
  };
}

export function mergeReviewIntoHarness(
  harness: PressEditHarness,
  input: MergeReviewInput,
): PressEditHarness {
  return {
    ...harness,
    review: {
      sessionId: input.sessionId,
      generatedAt: input.generatedAt,
      baseTitle: input.title,
      basePlain: input.plain,
      notes: input.notes.map((note) => ({
        ...note,
        sourceFactIds: note.sourceFactIds ?? [],
      })),
    },
    pendingRewrite: null,
    lineage: [
      ...harness.lineage,
      {
        at: input.generatedAt,
        stage: "REVIEW",
        summary: `분석 포인트 ${input.notes.length}개 생성`,
      },
    ],
  };
}

export function mergePendingRewriteIntoHarness(
  harness: PressEditHarness,
  input: MergePendingRewriteInput,
): PressEditHarness {
  return {
    ...harness,
    pendingRewrite: {
      basedOnSessionId: input.basedOnSessionId,
      userInstruction: input.userInstruction,
      selectedNoteIds: [...input.selectedNoteIds],
      title: input.title,
      plain: input.plain,
      generatedAt: input.generatedAt,
    },
    lineage: [
      ...harness.lineage,
      {
        at: input.generatedAt,
        stage: "REWRITE",
        summary: summarizeRewriteInstruction(input.userInstruction),
      },
    ],
  };
}

export function applyPendingRewriteToHarness(
  harness: PressEditHarness,
  appliedAt: string,
  appliedDraft?: { title?: string; plain?: string },
): PressEditHarness {
  if (!harness.pendingRewrite) return harness;
  return {
    ...harness,
    generation: {
      ...harness.generation,
      generatedAt: appliedAt,
      title: appliedDraft?.title ?? harness.pendingRewrite.title,
      plain: appliedDraft?.plain ?? harness.pendingRewrite.plain,
    },
    pendingRewrite: null,
    lineage: [
      ...harness.lineage,
      {
        at: appliedAt,
        stage: "APPLY",
        summary: "수정안을 본문에 반영",
      },
    ],
  };
}

function formatBriefContext(brief: PressBriefSnapshot | null) {
  if (!brief) return "- 없음";
  const lines = [
    `- 서비스명: ${normalizeText(brief.serviceName) || "-"}`,
    `- 발표 유형: ${normalizeText(brief.announceType) || "-"}`,
    `- 핵심 한 줄: ${normalizeText(brief.oneLiner) || "-"}`,
    brief.points.length > 0 ? `- 핵심 포인트:\n  - ${brief.points.join("\n  - ")}` : "- 핵심 포인트: -",
    `- 인용 화자: ${normalizeText(brief.quoteWho) || "-"}`,
    `- 인용 메시지: ${normalizeText(brief.quoteMessage) || "-"}`,
    `- 행사 시점: ${normalizeText(brief.eventAt) || "-"}`,
    `- 배포 시점: ${normalizeText(brief.publishAt) || "-"}`,
    `- 톤: ${normalizeText(brief.tone) || "-"}`,
  ];
  return lines.join("\n");
}

export function buildPressReviewGroundingContext(
  harness: PressEditHarness,
): string {
  const lockedFactsSection =
    harness.grounding.lockedFacts.length > 0
      ? harness.grounding.lockedFacts
          .map((fact) => `- ${fact.label}: ${fact.value}`)
          .join("\n")
      : "- 없음";

  return [
    "[Locked Facts]",
    lockedFactsSection,
    "",
    "[Normalized Brief]",
    formatBriefContext(harness.grounding.brief),
    "",
    "[Source Memo]",
    normalizeText(harness.grounding.rawInput) || "- 없음",
  ].join("\n");
}

export function buildPressRepolishPromptBundle(input: {
  harness: PressEditHarness;
  baseTitle: string;
  basePlain: string;
  selectedNotes: PressHarnessReviewNote[];
  userInstruction: string;
  stylePrompt?: string;
  acceptedFacts?: Array<{ id: string; content: string; evidence?: string | null }>;
  styleExamples?: string;
}) {
  const selectedNotesContext =
    input.selectedNotes.length > 0
      ? input.selectedNotes
          .map(
            (note, index) =>
              `Issue ${index + 1}\n- Quote: ${note.quote}\n- Feedback: ${note.note}\n- Type: ${note.type}`,
          )
          .join("\n\n")
      : "선택된 분석 포인트가 없습니다.";

  const systemPrompt = `
너는 한국어 보도자료 전문 편집자다.
사용자의 최신 지시를 최우선으로 반영하되, 아래 조건을 반드시 지켜라.

- Locked Facts와 Normalized Brief에 들어 있는 사실은 유지하라.
- 각 사실의 측정 기준, 집계 방식, 조건, 제한사항까지 빠짐없이 유지하라.
- 없는 사실을 추가하지 마라.
- 근거 표현을 더 강한 의미로 바꾸지 마라. 예: "서울 기반"을 "서울 본사"로 바꾸지 않는다.
- 선택된 분석 포인트는 최신 지시와 충돌하지 않는 범위에서 반영하라.
- 기사체와 논리 흐름을 다듬되, 사실 왜곡이나 과장은 금지한다.
${input.stylePrompt ? `\n[스타일 가이드]\n${input.stylePrompt}` : ""}
- 사실 수정은 아래 Accepted Facts만 사용하고 sourceFactIds로 연결하라.
- STYLE_EXAMPLE은 표현 참고일 뿐 사실 근거가 아니다.

응답 형식: JSON { "title": "...", "plain": "..." }
  `.trim();

  const userPrompt = `
[Latest User Instruction]
${normalizeText(input.userInstruction) || "더 세련되게 다듬어줘."}

[Grounding Context]
${buildPressReviewGroundingContext(input.harness)}

[Accepted Facts]
${(input.acceptedFacts ?? [])
  .map((fact) => `- [${fact.id}] ${fact.content}${fact.evidence ? `\n  Evidence: ${fact.evidence}` : ""}`)
  .join("\n") || "- 없음"}

[STYLE_EXAMPLE - non-evidence]
${input.styleExamples || "- 없음"}

[Current Draft Title]
${input.baseTitle}

[Current Draft Plain]
${input.basePlain}

[Selected Review Notes]
${selectedNotesContext}
  `.trim();

  return {
    systemPrompt,
    userPrompt,
  };
}

export function readPressEditHarness(value: unknown): PressEditHarness | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as any;
  if (raw.version !== 1 && raw.version !== 2) return null;
  if (!raw.grounding || !raw.generation || !Array.isArray(raw.lineage)) {
    return null;
  }
  if (raw.version === 1) {
    return {
      ...raw,
      version: 2,
      grounding: {
        ...raw.grounding,
        acceptedFactIds: [],
        style: {
          styleGuideId: raw.grounding.style?.styleGuideId ?? null,
          policy: "",
          examples: "",
        },
      },
    } as PressEditHarness;
  }
  return raw as PressEditHarness;
}
