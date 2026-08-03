import { Prisma, QuestionAiMessageKind, QuestionAiMessageRole } from "@prisma/client";

import type {
  ApplicationId,
  QuestionId,
  WritingTurnBody,
} from "@/domain/resume-writing/schemas";
import { ServiceError } from "@/lib/errors";
import { assertAndLogAiPanelUsage } from "@/lib/services/aiPanelUsageService";
import { buildResumeAiContext } from "@/lib/services/resume/resumeAiContextService";
import { planResumeAiMultiAction } from "@/lib/services/resume/resumeAiOrchestrator";
import { createQuestionAiMessages } from "@/lib/services/resume/resumeService";

function toPlanActions(
  actions: Awaited<ReturnType<typeof planResumeAiMultiAction>>["actions"],
): Prisma.InputJsonArray {
  return actions.map((action) => ({
    id: action.id,
    type: action.type,
    questionOrder: action.questionOrder,
    instruction: action.instruction,
    title: action.title,
    description: action.description,
    quotaCost: action.quotaCost,
    estimatedTokens: action.estimatedTokens,
    requiresConfirmation: action.requiresConfirmation,
  }));
}

export async function planResumeWritingTurn(input: {
  readonly applicationId: ApplicationId;
  readonly questionId: QuestionId;
  readonly userId: string;
  readonly teamId: string;
  readonly message: WritingTurnBody["message"];
  readonly recentMessages: WritingTurnBody["recentMessages"];
  readonly selectedFeedbackNotes: WritingTurnBody["selectedFeedbackNotes"];
}) {
  const context = await buildResumeAiContext({
    userId: input.userId,
    teamId: input.teamId,
    applicationId: input.applicationId,
    questionId: input.questionId,
    recentMessages: input.recentMessages
      ? input.recentMessages.map((message) => ({ ...message }))
      : undefined,
    selectedFeedbackNotes: input.selectedFeedbackNotes
      ? input.selectedFeedbackNotes.map((note) => ({ ...note }))
      : undefined,
  });

  if (!context.currentQuestion) {
    throw new ServiceError("QUESTION_NOT_FOUND", 404, "Question not found");
  }

  await assertAndLogAiPanelUsage({
    teamId: input.teamId,
    userId: input.userId,
    scope: "resume:plan",
    meta: {
      applicationId: input.applicationId,
      questionId: input.questionId,
      messageLength: input.message.length,
      surface: "writing_workspace",
    },
  });

  const plan = await planResumeAiMultiAction({
    command: input.message,
    context,
  });
  const meta: Prisma.InputJsonObject = {
    type: "resume_writing_turn_plan_v1",
    schemaVersion: 1,
    applicationId: input.applicationId,
    questionId: input.questionId,
    summary: plan.summary,
    totalQuotaCost: plan.totalQuotaCost,
    totalEstimatedTokens: plan.totalEstimatedTokens,
    actions: toPlanActions(plan.actions),
  };
  const messages = await createQuestionAiMessages({
    userId: input.userId,
    questionId: input.questionId,
    messages: [
      {
        role: QuestionAiMessageRole.USER,
        kind: QuestionAiMessageKind.PROMPT,
        content: input.message,
      },
      {
        role: QuestionAiMessageRole.ASSISTANT,
        kind: QuestionAiMessageKind.SUGGESTION,
        content: plan.summary,
        meta,
      },
    ],
  });

  return {
    plan,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      kind: message.kind,
      content: message.content,
      createdAt: message.createdAt,
    })),
  };
}
