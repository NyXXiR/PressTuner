import { CareerVerificationResult } from "@prisma/client";

import {
  canonicalizeCareerAnswer,
  hashCareerAnswer,
} from "@/domain/career-memory/answerHash";
import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";
import { captureFinalAnswerProposals } from "./careerFinalAnswerCaptureService";
import {
  createAndAttemptCareerFinalAnswerCaptureTask,
  projectDeferredCareerCaptureTask,
  projectSuccessfulCareerCaptureProposal,
} from "./careerFinalAnswerCaptureTaskService";
import {
  getCurrentCareerVerification,
  verifyCareerAnswer,
} from "./careerVerificationService";

export async function finalizeCareerAnswer(input: {
  questionId: string;
  userId: string;
  answer: string;
}, dependencies: {
  capture?: typeof captureFinalAnswerProposals;
} = {}) {
  const canonicalAnswer = canonicalizeCareerAnswer(input.answer);
  if (!canonicalAnswer.trim()) {
    throw serviceError(400, "CAREER_ANSWER_REQUIRED", "Answer is required");
  }
  const question = await prisma.$transaction(async (tx) => {
    const current = await tx.question.findFirst({
      where: { id: input.questionId, application: { userId: input.userId } },
      select: { id: true, answer: true, answerRevision: true },
    });
    if (!current) {
      throw serviceError(404, "CAREER_QUESTION_NOT_FOUND", "Question not found");
    }
    const changed =
      hashCareerAnswer(current.answer ?? "") !== hashCareerAnswer(canonicalAnswer);
    if (!changed) {
      if (current.answer !== canonicalAnswer) {
        return tx.question.update({
          where: { id: current.id },
          data: { answer: canonicalAnswer, isCompleted: false },
          select: { id: true, answer: true, answerRevision: true },
        });
      }
      return current;
    }
    return tx.question.update({
      where: { id: current.id },
      data: {
        answer: canonicalAnswer,
        answerRevision: { increment: 1 },
        isCompleted: false,
      },
      select: { id: true, answer: true, answerRevision: true },
    });
  });

  let current = await getCurrentCareerVerification({
    questionId: question.id,
    userId: input.userId,
  });
  const verification =
    current.verification ??
    (await verifyCareerAnswer({ questionId: question.id, userId: input.userId }));
  current = current.verification
    ? current
    : await getCurrentCareerVerification({
        questionId: question.id,
        userId: input.userId,
      });
  const override = verification.override ?? current.verification?.override;
  if (
    verification.result === CareerVerificationResult.BLOCK &&
    !(
      override &&
      override.userId === input.userId &&
      override.answerHash === current.current.answerHash &&
      override.answerRevision === current.current.answerRevision
    )
  ) {
    throw serviceError(
      409,
      "CAREER_VERIFICATION_BLOCKED",
      "Answer contains blocked factual claims",
      {
        verificationId: verification.id,
        result: verification.result,
        findings: verification.findings,
      },
    );
  }

  const completed = await prisma.question.updateMany({
    where: {
      id: question.id,
      answer: canonicalAnswer,
      answerRevision: current.current.answerRevision,
      application: { userId: input.userId },
    },
    data: { isCompleted: true },
  });
  if (completed.count !== 1) {
    throw serviceError(409, "CAREER_ANSWER_CHANGED", "Answer changed during verification");
  }

  const captureAttempt = await createAndAttemptCareerFinalAnswerCaptureTask(
    {
      questionId: question.id,
      userId: input.userId,
      answer: canonicalAnswer,
      answerRevision: current.current.answerRevision,
    },
    { capture: dependencies.capture },
  );
  const proposal =
    captureAttempt.kind === "claimed" ? captureAttempt.proposal : null;
  return {
    completed: true as const,
    verification,
    capture: proposal
      ? projectSuccessfulCareerCaptureProposal(proposal)
      : projectDeferredCareerCaptureTask(captureAttempt.task),
  };
}
