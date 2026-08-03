import type {
  ApplicationId,
  QuestionId,
} from "@/domain/resume-writing/schemas";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { finalizeCareerAnswer } from "./careerFinalizationService";

export async function completeResumeWritingQuestionWithServices(input: {
  readonly applicationId: ApplicationId;
  readonly questionId: QuestionId;
  readonly userId: string;
  readonly teamId: string;
  readonly answer: string;
  readonly expectedAnswerRevision: number;
}) {
  const question = await prisma.question.findFirst({
    where: {
      id: input.questionId,
      applicationId: input.applicationId,
      application: { userId: input.userId },
    },
    select: {
      id: true,
      answerRevision: true,
      application: { select: { teamId: true } },
    },
  });
  if (!question) {
    throw new ServiceError("QUESTION_NOT_FOUND", 404, "Question not found");
  }
  if (question.application.teamId && question.application.teamId !== input.teamId) {
    throw new ServiceError("FORBIDDEN", 403, "Team access denied");
  }
  if (question.answerRevision !== input.expectedAnswerRevision) {
    throw new ServiceError(
      "CAREER_ANSWER_REVISION_CONFLICT",
      409,
      "Answer revision changed",
      {
        expectedAnswerRevision: input.expectedAnswerRevision,
        actualAnswerRevision: question.answerRevision,
      },
    );
  }
  return finalizeCareerAnswer({
    questionId: question.id,
    userId: input.userId,
    answer: input.answer,
  });
}
