import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.PT_BRIEF_MODEL ?? "gpt-4.1-mini";

const PressGuideSchema = z.object({
  answer: z.string(),
  links: z
    .array(
      z.object({
        label: z.string(),
        href: z.string(),
      }),
    )
    .max(4),
});

const PressPlanActionSchema = z.object({
  type: z.enum([
    "analyze_article",
    "rewrite_article",
    "apply_pending_result",
    "save_article",
    "finalize_article",
  ]),
  instruction: z.string().nullable(),
  title: z.string(),
  description: z.string(),
});

const PressPlanSchema = z.object({
  summary: z.string(),
  actions: z.array(PressPlanActionSchema).max(5),
});

export type PressGuideResult = z.infer<typeof PressGuideSchema>;
type RawPressPlanAction = z.infer<typeof PressPlanActionSchema>;

export type PressPlanAction = z.infer<typeof PressPlanActionSchema> & {
  id: string;
  quotaCost: number;
  estimatedTokens: number;
  requiresConfirmation: boolean;
};

export type PressCommandPlan = {
  summary: string;
  totalQuotaCost: number;
  totalEstimatedTokens: number;
  actions: PressPlanAction[];
};

type PressCommandContext = {
  title: string;
  plainLength: number;
  noteCount: number;
  selectedNoteCount: number;
  pendingResult: boolean;
  saveState: string;
};

const PRESS_DOMAIN_KEYWORDS = [
  "보도자료",
  "기사",
  "원고",
  "초안",
  "문안",
  "제목",
  "본문",
  "검토",
  "승인",
  "발행",
  "수정",
  "작성",
  "핵심내용",
  "press",
];

const PRESS_EDIT_ACTION_KEYWORDS = [
  "분석",
  "검토",
  "수정",
  "다듬",
  "고쳐",
  "바꿔",
  "줄여",
  "늘려",
  "요약",
  "정리",
  "반영",
  "적용",
  "작성",
  "재작성",
  "rewrite",
  "polish",
];

const PRESS_CONTEXT_REFERENCE_KEYWORDS = [
  "이 문장",
  "이 문단",
  "이 원고",
  "지금 원고",
  "지금 내용",
  "현재 내용",
  "현재 원고",
  "제목",
  "본문",
  "리드문",
];

const GENERAL_OFFTOPIC_KEYWORDS = [
  "날씨",
  "주식",
  "주식시장",
  "증시",
  "코딩",
  "파이썬",
  "번역",
  "영어로",
  "수학",
  "게임",
  "맛집",
  "여행",
  "뉴스",
  "비트코인",
  "연애",
];

function isDraftHelpRequest(message: string) {
  const text = message.toLowerCase();
  const draftKeywords = [
    "초안",
    "예시",
    "샘플",
    "아무렇게",
    "대충",
    "아무거나",
    "작성해",
    "써줘",
    "문안",
    "작성해볼래",
  ];

  return draftKeywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function hasRecentSampleDraft(
  recentMessages: Array<{ role: "user" | "assistant"; body: string }> = [],
) {
  return recentMessages.some(
    (message) =>
      message.role === "assistant" &&
      message.body.includes("[제목]") &&
      message.body.includes("[본문]"),
  );
}

function isSampleUsageQuestion(message: string) {
  const text = message.toLowerCase();
  const usageKeywords = [
    "이거",
    "그거",
    "붙여넣",
    "넣으면",
    "핵심내용",
    "어디에",
    "어떻게 써",
  ];
  return usageKeywords.some((keyword) => text.includes(keyword));
}

function buildPressRuleBasedGuide(input: {
  message: string;
  pathname: string;
  recentMessages?: Array<{ role: "user" | "assistant"; body: string }>;
}): PressGuideResult | null {
  const text = input.message.toLowerCase();
  const recentMessages = input.recentMessages ?? [];

  if (
    isSampleUsageQuestion(input.message) &&
    hasRecentSampleDraft(recentMessages)
  ) {
    return {
      answer:
        "네. 테스트용이라면 제목은 제목 칸에 넣고, 본문은 핵심내용에 붙여넣으면 됩니다. 붙여넣은 뒤 회사명, 날짜, 인용문만 실제 상황에 맞게 바꾸면 작성부터 검토 흐름까지 바로 테스트할 수 있습니다.",
      links: [],
    };
  }

  if (
    text.includes("새로") ||
    text.includes("어디서") ||
    text.includes("어디") ||
    text.includes("목록") ||
    text.includes("리스트") ||
    text.includes("뭐부터") ||
    text.includes("무엇부터") ||
    text.includes("다음") ||
    text.includes("이제")
  ) {
    if (text.includes("새") || text.includes("작성")) {
      return {
        answer: "새 보도자료를 시작하려면 작성 페이지로 가면 됩니다.",
        links: [{ label: "새 보도자료 작성", href: "/press/new" }],
      };
    }

    if (text.includes("팀")) {
      return {
        answer:
          "팀 단위로 작성된 보도자료를 보려면 팀 기사 목록으로 가면 됩니다.",
        links: [{ label: "팀 보도자료 목록", href: "/team/articles" }],
      };
    }

    if (text.includes("내") || text.includes("개인")) {
      return {
        answer:
          "내가 작성 중이거나 저장한 보도자료는 개인 목록에서 확인하면 됩니다.",
        links: [{ label: "개인 보도자료 목록", href: "/press/articles" }],
      };
    }

    if (
      input.pathname === "/press/new" ||
      input.pathname === "/press/simplified"
    ) {
      return {
        answer:
          "지금은 작성 시작 화면입니다. 핵심내용을 먼저 채우거나, 테스트용 초안을 하나 써달라고 요청해도 됩니다.",
        links: [],
      };
    }
  }

  return null;
}

function getActionCost(type: PressPlanAction["type"]) {
  switch (type) {
    case "analyze_article":
      return { quotaCost: 1, estimatedTokens: 1100 };
    case "rewrite_article":
      return { quotaCost: 1, estimatedTokens: 1500 };
    case "apply_pending_result":
    case "save_article":
    case "finalize_article":
    default:
      return { quotaCost: 0, estimatedTokens: 0 };
  }
}

export async function planPressCommand(input: {
  command: string;
  context: PressCommandContext;
  recentMessages?: Array<{ role: "user" | "assistant"; body: string }>;
}): Promise<PressCommandPlan> {
  const completion = await openai.chat.completions.parse({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `
You are an AI planner for a Korean press-release editing workspace.

Convert the user's request into one or more executable actions.

Available actions:
- analyze_article: run AI analysis and produce notes/spans
- rewrite_article: generate a rewritten draft from current notes and instruction
- apply_pending_result: apply the already prepared rewrite result
- save_article: save the current draft
- finalize_article: mark the article as final

Rules:
- Split multi-part requests into multiple actions.
- If the user explicitly asks to rewrite, shorten, tighten tone, or restyle the current article, prefer a single rewrite_article action.
- Use analyze_article first only when the user explicitly asks for analysis/review or when analysis itself is the goal.
- If the request is unrelated to editing the current article, politely refuse in Korean and return an empty actions array.
- If pendingResult is true and the user says apply/reflect/use it, choose apply_pending_result.
- Never mention navigation. This panel should not move the screen by itself.
- summary, title, description must be concise Korean.
- instruction should be the cleaned instruction for rewrite_article. Otherwise use null.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            command: input.command,
            context: input.context,
            recentMessages: input.recentMessages ?? [],
          },
          null,
          2,
        ),
      },
    ],
    response_format: zodResponseFormat(PressPlanSchema, "press_command_plan"),
    temperature: 0.1,
  });

  const parsed = completion.choices[0].message.parsed;
  const rawActions: RawPressPlanAction[] =
    parsed && Array.isArray(parsed.actions)
      ? parsed.actions
      : [
          {
            type:
              input.context.noteCount > 0
                ? "rewrite_article"
                : "analyze_article",
            instruction: input.command,
            title: input.context.noteCount > 0 ? "원고 재작성" : "원고 분석",
            description:
              input.context.noteCount > 0
                ? "현재 원고를 요청사항에 맞게 다시 다듬습니다."
                : "현재 원고를 먼저 분석해 수정 포인트를 찾습니다.",
          },
        ];

  const actions = rawActions.map((action, index) => {
    const cost = getActionCost(action.type);
    return {
      ...action,
      id: `press-plan-action-${index + 1}`,
      quotaCost: cost.quotaCost,
      estimatedTokens: cost.estimatedTokens,
      requiresConfirmation: true,
    };
  });

  return {
    summary: parsed?.summary ?? "요청을 실행 계획으로 정리했습니다.",
    totalQuotaCost: actions.reduce((sum, action) => sum + action.quotaCost, 0),
    totalEstimatedTokens: actions.reduce(
      (sum, action) => sum + action.estimatedTokens,
      0,
    ),
    actions,
  };
}

export async function guidePressWorkspace(input: {
  message: string;
  pathname: string;
  recentMessages?: Array<{ role: "user" | "assistant"; body: string }>;
}): Promise<PressGuideResult> {
  const localResult = buildPressRuleBasedGuide(input);
  if (localResult) {
    return localResult;
  }

  const draftRequested = isDraftHelpRequest(input.message);
  const sampleFollowUp =
    isSampleUsageQuestion(input.message) &&
    hasRecentSampleDraft(input.recentMessages);

  const completion = await openai.chat.completions.parse({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `
You are a workspace assistant for a Korean press-release SaaS.

You do two things:
1. Help the user find where to go next inside the product.
2. If the user asks what to write, provide a practical starter draft or writing scaffold instead of only giving links.

Rules:
- Keep answers short and practical.
- If the user asks for sample copy, draft text, what to write, or asks you to write roughly for testing, give actual draft content first.
- If the user asks a follow-up question about your previous answer, answer the follow-up directly instead of repeating the previous answer.
- Use the provided flags to understand whether this is a draft request or a follow-up about a previously generated sample.
- Only attach links when navigation is genuinely useful.
- Do not default to support/contact unless the user is actually asking for help with the service.

Prefer linking to these pages when relevant:
- /press/new : 새 보도자료 작성
- /press/simplified : 새 보도자료 작성(compat redirect)
- /press/articles : 개인 보도자료 목록
- /team/articles : 팀 보도자료 목록
- /contact : 문의

Return concise Korean answer and 0-3 relevant links.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            message: input.message,
            pathname: input.pathname,
            draftRequested,
            sampleFollowUp,
            recentMessages: input.recentMessages ?? [],
          },
          null,
          2,
        ),
      },
    ],
    response_format: zodResponseFormat(PressGuideSchema, "press_guide_result"),
    temperature: 0.2,
  });

  return (
    completion.choices[0].message.parsed ?? {
      answer: "필요한 작업을 말하면 관련 페이지를 바로 안내하겠습니다.",
      links: [],
    }
  );
}
