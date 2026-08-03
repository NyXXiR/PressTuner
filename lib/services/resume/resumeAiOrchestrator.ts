import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ResumeAiContext } from "@/lib/services/resume/resumeAiContextService";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.PT_BRIEF_MODEL ?? "gpt-4.1-mini";

const RESUME_DOMAIN_KEYWORDS = [
  "자소서",
  "자기소개서",
  "이력서",
  "지원서",
  "문항",
  "답변",
  "경험",
  "브릭",
  "첨삭",
  "톤",
  "글자",
  "문장",
  "요약",
  "resume",
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

const RESUME_ACTION_KEYWORDS = [
  "수정",
  "다듬",
  "고쳐",
  "바꿔",
  "줄여",
  "늘려",
  "첨삭",
  "분석",
  "검토",
  "작성",
  "재작성",
  "요약",
  "정리",
  "강조",
  "톤",
  "문체",
];

const RESUME_CONTEXT_REFERENCES = [
  "이 문항",
  "현재 문항",
  "이 답변",
  "현재 답변",
  "이 내용",
  "아까",
  "방금",
];

const ResumeAiCommandPlanSchema = z.object({
  action: z.enum([
    "open_question",
    "refresh_strategy",
    "draft_missing_answers",
    "draft_current_answer",
    "analyze_current_answer",
    "revise_current_answer",
    "manage_current_bricks",
  ]),
  targetQuestionOrder: z.number().int().positive().nullable(),
  instruction: z.string().nullable(),
  assistantMessage: z.string(),
});

export type ResumeAiCommandPlan = z.infer<typeof ResumeAiCommandPlanSchema>;

const ResumeAiPlanActionSchema = z.object({
  type: z.enum([
    "open_question",
    "refresh_strategy",
    "draft_missing_answers",
    "draft_answer",
    "analyze_answer",
    "revise_answer",
    "suggest_bricks",
    "save_question",
    "complete_question",
  ]),
  questionOrder: z.number().int().positive().nullable(),
  instruction: z.string().nullable(),
  title: z.string(),
  description: z.string(),
});

const ResumeAiMultiActionPlanSchema = z.object({
  summary: z.string(),
  actions: z.array(ResumeAiPlanActionSchema).min(1).max(6),
});

type ResumeAiPlanAction = z.infer<typeof ResumeAiPlanActionSchema> & {
  id: string;
  quotaCost: number;
  estimatedTokens: number;
  requiresConfirmation: boolean;
};

export type ResumeAiMultiActionPlan = {
  summary: string;
  totalQuotaCost: number;
  totalEstimatedTokens: number;
  actions: ResumeAiPlanAction[];
};

function isResumeDomainQuestion(command: string) {
  const text = command.toLowerCase();
  return RESUME_DOMAIN_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
}

function isOffTopicQuestion(command: string) {
  const text = command.toLowerCase();
  return GENERAL_OFFTOPIC_KEYWORDS.some((keyword) =>
    text.includes(keyword.toLowerCase()),
  );
}

function assertResumeCommandInScope(command: string) {
  const text = command.toLowerCase();
  const hasAction = RESUME_ACTION_KEYWORDS.some((keyword) =>
    text.includes(keyword.toLowerCase()),
  );
  const hasReference = RESUME_CONTEXT_REFERENCES.some((keyword) =>
    text.includes(keyword.toLowerCase()),
  );
  const hasQuestionNumber = /\d+\s*번/.test(command);
  const inScope =
    isResumeDomainQuestion(command) ||
    hasQuestionNumber ||
    (hasAction && hasReference) ||
    hasAction;

  if (!inScope || (isOffTopicQuestion(command) && !isResumeDomainQuestion(command))) {
    const error = new Error(
      "이 패널은 자기소개서 작성, 첨삭, 경험 연결처럼 현재 지원서 작업과 관련된 요청만 실행 계획으로 만들 수 있습니다.",
    ) as Error & { status?: number; code?: string };
    error.status = 400;
    error.code = "RESUME_COMMAND_OUT_OF_SCOPE";
    throw error;
  }
}

function summarizeContext(context: ResumeAiContext) {
  const currentQuestion = context.currentQuestion;

  return {
    application: {
      companyName: context.application.companyName,
      jobTitle: context.application.jobTitle,
      jdText: context.application.jdText,
      questions: context.application.questions.map((question) => ({
        order: question.order + 1,
        questionText: question.questionText,
        charLimit: question.charLimit,
        hasAnswer: question.hasAnswer,
        selectedBrickCount: question.selectedBrickCount,
      })),
    },
    currentQuestion: currentQuestion
      ? {
          order: currentQuestion.order + 1,
          questionText: currentQuestion.questionText,
          charLimit: currentQuestion.charLimit,
          hasAnswer: !!currentQuestion.answer.trim(),
          selectedBrickTitles: currentQuestion.selectedBricks.map(
            (brick) => brick.title,
          ),
          aiAdvice: currentQuestion.aiAdvice,
          selectedFeedbackNotes: context.conversation.selectedFeedbackNotes,
          recentMessages: context.conversation.recentMessages,
        }
      : null,
    recentMessages: context.conversation.recentMessages,
  };
}

export async function planResumeAiCommand(input: {
  command: string;
  context: ResumeAiContext;
}): Promise<ResumeAiCommandPlan> {
  const completion = await openai.chat.completions.parse({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `
You are an AI command router for a Korean resume-writing workspace.

Choose exactly one action based on the user's command and the current logged-in workspace context.

Action meanings:
- open_question: move to a specific question only
- refresh_strategy: rebuild question-to-brick strategy
- draft_missing_answers: generate drafts for questions without answers
- draft_current_answer: write a draft for the target/current question
- analyze_current_answer: analyze the current question answer and return feedback
- revise_current_answer: rewrite the current question answer based on the instruction
- manage_current_bricks: user wants to change selected experience bricks

Rules:
- If the user mentions a question number, set targetQuestionOrder to that 1-based question number.
- If the user is on a question already and does not mention a number, use the current question.
- If the user says "아까처럼", "방금", "이 문항", infer from currentQuestion.
- Prefer draft_missing_answers only for commands that clearly refer to multiple unanswered questions.
- Prefer open_question if the command is mainly about moving or opening a question.
- assistantMessage must be Korean, short, and tell the UI what will happen.
- instruction should be the cleaned instruction text to pass to the tool. If no extra instruction is needed, use null.
- Recent conversation is available. Use it only to resolve short follow-ups like "아까처럼", "방금 그거", "그 문항".
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            command: input.command,
            context: summarizeContext(input.context),
          },
          null,
          2,
        ),
      },
    ],
    response_format: zodResponseFormat(
      ResumeAiCommandPlanSchema,
      "resume_ai_command_plan",
    ),
    temperature: 0.1,
  });

  const parsed = completion.choices[0].message.parsed;

  return (
    parsed ?? {
      action: input.context.currentQuestion?.answer?.trim()
        ? "revise_current_answer"
        : "draft_current_answer",
      targetQuestionOrder: input.context.currentQuestion
        ? input.context.currentQuestion.order + 1
        : null,
      instruction: input.command,
      assistantMessage: "현재 작업 맥락 기준으로 요청을 실행합니다.",
    }
  );
}

function getActionCost(type: ResumeAiPlanAction["type"]) {
  switch (type) {
    case "draft_answer":
    case "draft_missing_answers":
      return { quotaCost: 1, estimatedTokens: 1800 };
    case "revise_answer":
      return { quotaCost: 1, estimatedTokens: 1400 };
    case "analyze_answer":
      return { quotaCost: 1, estimatedTokens: 1000 };
    case "suggest_bricks":
      return { quotaCost: 1, estimatedTokens: 900 };
    case "refresh_strategy":
      return { quotaCost: 1, estimatedTokens: 1600 };
    case "save_question":
    case "complete_question":
    case "open_question":
    default:
      return { quotaCost: 0, estimatedTokens: 0 };
  }
}

export async function planResumeAiMultiAction(input: {
  command: string;
  context: ResumeAiContext;
}): Promise<ResumeAiMultiActionPlan> {
  assertResumeCommandInScope(input.command);

  const completion = await openai.chat.completions.parse({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `
You are an AI planner for a Korean resume-writing workspace.

Your job is to turn the user's natural-language request into one or more executable actions.

Important rules:
- Split multi-part requests into separate actions whenever the user mentions multiple questions or multiple tasks.
- Prefer workspace actions over navigation. Do NOT use open_question unless the user explicitly asks to open, view, move, or navigate.
- If the user asks to adjust tone, length, structure, wording, or emphasis of an answer, use revise_answer.
- If the user asks to critique, review, or analyze, use analyze_answer.
- If the user asks to newly write or regenerate an answer, use draft_answer.
- If the user asks to reconnect experiences, change examples, or re-pick bricks, use suggest_bricks.
- If the user asks to generate unanswered questions in bulk, use draft_missing_answers.
- If the user asks to save or mark complete, use save_question or complete_question.
- If a question number is mentioned, set questionOrder to that 1-based number.
- If no question number is mentioned and the request is clearly about the current question, use the current question.
- summary must be concise Korean explaining what will be executed.
- title and description for each action must be concise Korean.
- instruction should be the cleaned instruction for the action. If not needed, use null.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            command: input.command,
            context: summarizeContext(input.context),
          },
          null,
          2,
        ),
      },
    ],
    response_format: zodResponseFormat(
      ResumeAiMultiActionPlanSchema,
      "resume_ai_multi_action_plan",
    ),
    temperature: 0.1,
  });

  const parsed = completion.choices[0].message.parsed;

  const fallbackType: ResumeAiPlanAction["type"] =
    input.context.currentQuestion?.answer?.trim() ? "revise_answer" : "draft_answer";
  const fallbackQuestionOrder = input.context.currentQuestion
    ? input.context.currentQuestion.order + 1
    : 1;

  const rawActions: z.infer<typeof ResumeAiPlanActionSchema>[] = parsed?.actions?.length
    ? parsed.actions
    : [
        {
          type: fallbackType,
          questionOrder: fallbackQuestionOrder,
          instruction: input.command,
          title: "현재 문항 처리",
          description: "현재 문맥 기준으로 요청을 실행합니다.",
        },
      ];

  const actions = rawActions.map((action, index) => {
    const cost = getActionCost(action.type);
    return {
      ...action,
      id: `plan-action-${index + 1}`,
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
