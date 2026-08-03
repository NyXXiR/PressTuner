export type ResumeHarnessBrick = {
  id: string;
  title: string;
  content: string;
  originalText?: string;
};

export type ResumeHarnessNote = {
  quote: string;
  note: string;
  type?: string;
};

type ResumeHarnessLineageItem = {
  at: string;
  stage: "GENERATE" | "POLISH" | "REWRITE" | "APPLY" | "SYNC";
  summary: string;
};

type ResumeHarnessPolish = {
  generatedAt: string;
  notes: ResumeHarnessNote[];
};

type ResumeHarnessPendingRewrite = {
  generatedAt: string;
  userInstruction: string;
  selectedNotes: ResumeHarnessNote[];
  revisedText: string;
};

export type ResumeEditHarness = {
  version: 1;
  grounding: {
    question: string;
    briefContext: string;
    bricks: ResumeHarnessBrick[];
  };
  currentAnswer: {
    text: string;
    updatedAt: string;
  };
  lastPolish: ResumeHarnessPolish | null;
  pendingRewrite: ResumeHarnessPendingRewrite | null;
  lineage: ResumeHarnessLineageItem[];
};

export type ResumeEditHarnessMeta = {
  schema: "resume_edit_harness";
  version: 1;
  harness: ResumeEditHarness;
};

function normalizeText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBricks(
  bricks: Array<{
    id?: string | null;
    title?: string | null;
    content?: string | null;
    originalText?: string | null;
  }>,
): ResumeHarnessBrick[] {
  return bricks
    .map((brick) => ({
      id: normalizeText(brick.id),
      title: normalizeText(brick.title),
      content: normalizeText(brick.content),
      originalText: normalizeText(brick.originalText) || undefined,
    }))
    .filter((brick) => brick.id && brick.title && brick.content);
}

function summarizeInstruction(value: string) {
  const normalized = normalizeText(value);
  return normalized || "사용자 지시를 반영해 재작성";
}

export function createInitialResumeEditHarness(input: {
  question: string;
  briefContext?: string;
  bricks?: Array<{
    id?: string | null;
    title?: string | null;
    content?: string | null;
    originalText?: string | null;
  }>;
  currentAnswer: string;
  generatedAt: string;
}): ResumeEditHarness {
  return {
    version: 1,
    grounding: {
      question: normalizeText(input.question),
      briefContext: normalizeText(input.briefContext),
      bricks: normalizeBricks(input.bricks ?? []),
    },
    currentAnswer: {
      text: normalizeText(input.currentAnswer),
      updatedAt: input.generatedAt,
    },
    lastPolish: null,
    pendingRewrite: null,
    lineage: [
      {
        at: input.generatedAt,
        stage: "GENERATE",
        summary: "문항 편집 기준 맥락 생성",
      },
    ],
  };
}

export function mergeResumePolishIntoHarness(
  harness: ResumeEditHarness,
  input: {
    notes: ResumeHarnessNote[];
    generatedAt: string;
  },
): ResumeEditHarness {
  return {
    ...harness,
    lastPolish: {
      generatedAt: input.generatedAt,
      notes: input.notes.map((note) => ({
        quote: normalizeText(note.quote),
        note: normalizeText(note.note),
        type: normalizeText(note.type),
      })),
    },
    pendingRewrite: null,
    lineage: [
      ...harness.lineage,
      {
        at: input.generatedAt,
        stage: "POLISH",
        summary: `첨삭 포인트 ${input.notes.length}개 생성`,
      },
    ],
  };
}

export function mergeResumePendingRewriteIntoHarness(
  harness: ResumeEditHarness,
  input: {
    userInstruction: string;
    selectedNotes: ResumeHarnessNote[];
    revisedText: string;
    generatedAt: string;
  },
): ResumeEditHarness {
  return {
    ...harness,
    pendingRewrite: {
      generatedAt: input.generatedAt,
      userInstruction: normalizeText(input.userInstruction),
      selectedNotes: input.selectedNotes.map((note) => ({
        quote: normalizeText(note.quote),
        note: normalizeText(note.note),
        type: normalizeText(note.type),
      })),
      revisedText: normalizeText(input.revisedText),
    },
    lineage: [
      ...harness.lineage,
      {
        at: input.generatedAt,
        stage: "REWRITE",
        summary: summarizeInstruction(input.userInstruction),
      },
    ],
  };
}

export function applyResumePendingRewrite(
  harness: ResumeEditHarness,
  appliedAt: string,
  appliedText?: string,
): ResumeEditHarness {
  if (!harness.pendingRewrite) return harness;

  return {
    ...harness,
    currentAnswer: {
      text:
        normalizeText(appliedText) || normalizeText(harness.pendingRewrite.revisedText),
      updatedAt: appliedAt,
    },
    pendingRewrite: null,
    lineage: [
      ...harness.lineage,
      {
        at: appliedAt,
        stage: "APPLY",
        summary: "수정안을 현재 답변에 반영",
      },
    ],
  };
}

export function syncResumeEditHarness(
  harness: ResumeEditHarness,
  input: {
    question: string;
    briefContext?: string;
    bricks?: Array<{
      id?: string | null;
      title?: string | null;
      content?: string | null;
      originalText?: string | null;
    }>;
    currentAnswer: string;
    syncedAt: string;
  },
): ResumeEditHarness {
  const nextQuestion = normalizeText(input.question);
  const nextBriefContext = normalizeText(input.briefContext);
  const nextBricks = normalizeBricks(input.bricks ?? []);
  const nextAnswer = normalizeText(input.currentAnswer);

  let nextHarness: ResumeEditHarness = {
    ...harness,
    grounding: {
      question: nextQuestion,
      briefContext: nextBriefContext,
      bricks: nextBricks,
    },
  };

  if (
    nextHarness.pendingRewrite &&
    nextAnswer &&
    nextAnswer === normalizeText(nextHarness.pendingRewrite.revisedText)
  ) {
    nextHarness = applyResumePendingRewrite(nextHarness, input.syncedAt, nextAnswer);
  } else if (nextHarness.pendingRewrite && nextAnswer !== nextHarness.currentAnswer.text) {
    nextHarness = {
      ...nextHarness,
      currentAnswer: {
        text: nextAnswer,
        updatedAt: input.syncedAt,
      },
      pendingRewrite: null,
      lineage: [
        ...nextHarness.lineage,
        {
          at: input.syncedAt,
          stage: "SYNC",
          summary: "현재 답변 기준으로 편집 상태 동기화",
        },
      ],
    };
  } else if (nextAnswer !== nextHarness.currentAnswer.text) {
    nextHarness = {
      ...nextHarness,
      currentAnswer: {
        text: nextAnswer,
        updatedAt: input.syncedAt,
      },
    };
  }

  return nextHarness;
}

function formatBricks(bricks: ResumeHarnessBrick[]) {
  if (bricks.length === 0) return "- 없음";
  return bricks
    .map(
      (brick, index) =>
        `- 경험 ${index + 1}: ${brick.title}\n  - Summary: ${brick.content}\n  - Raw: ${brick.originalText || brick.content}`,
    )
    .join("\n");
}

export function buildResumePolishGroundingContext(
  harness: ResumeEditHarness,
): string {
  return [
    "[Question]",
    normalizeText(harness.grounding.question) || "- 없음",
    "",
    "[Hiring Brief]",
    normalizeText(harness.grounding.briefContext) || "- 없음",
    "",
    "[Selected Experience Bricks]",
    formatBricks(harness.grounding.bricks),
  ].join("\n");
}

export function buildResumeRepolishPromptBundle(input: {
  harness: ResumeEditHarness;
  userInstruction: string;
  selectedNotes: ResumeHarnessNote[];
  charLimit?: number;
}) {
  const feedbackContext =
    input.selectedNotes.length > 0
      ? input.selectedNotes
          .map(
            (note, index) =>
              `Issue ${index + 1}: "${note.quote}" -> Feedback: ${note.note}`,
          )
          .join("\n")
      : "Improve overall clarity and professionalism.";

  const systemPrompt = `
너는 한국어 자기소개서 첨삭 전문가다.
사용자의 최신 지시를 최우선으로 반영하되, 아래 원칙을 반드시 지켜라.

- Question, Hiring Brief, Selected Experience Bricks와 모순되는 내용을 쓰지 마라.
- 없는 경험이나 성과를 추가하지 마라.
- 선택된 첨삭 포인트는 최신 지시와 충돌하지 않는 범위에서 반영하라.
- 문항 적합성, 설득력, 구체성을 높이되 분량 제한을 지켜라.
  `.trim();

  const userPrompt = `
[Latest User Instruction]
${normalizeText(input.userInstruction) || "의미는 유지하되 문장을 자연스럽게 다듬어줘."}

[Grounding Context]
${buildResumePolishGroundingContext(input.harness)}

[Current Answer]
${normalizeText(input.harness.currentAnswer.text) || "- 없음"}

[Target Character Limit]
Approx. ${input.charLimit ?? 700} characters.

[Selected Review Notes]
${feedbackContext}
  `.trim();

  return { systemPrompt, userPrompt };
}

export function createResumeEditHarnessMeta(
  harness: ResumeEditHarness,
): ResumeEditHarnessMeta {
  return {
    schema: "resume_edit_harness",
    version: 1,
    harness,
  };
}

export function readResumeEditHarnessMeta(
  value: unknown,
): ResumeEditHarness | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ResumeEditHarnessMeta>;
  if (raw.schema !== "resume_edit_harness" || raw.version !== 1) {
    return null;
  }
  const harness = raw.harness as Partial<ResumeEditHarness> | undefined;
  if (!harness || harness.version !== 1) return null;
  if (!harness.grounding || !harness.currentAnswer || !Array.isArray(harness.lineage)) {
    return null;
  }
  return harness as ResumeEditHarness;
}

export function readLatestResumeEditHarness(values: unknown[]): ResumeEditHarness | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const harness = readResumeEditHarnessMeta(values[index]);
    if (harness) return harness;
  }
  return null;
}
