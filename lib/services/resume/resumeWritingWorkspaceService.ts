import { BrickSource, QuestionAiMessageKind } from "@prisma/client";

import {
  ExperienceCaptureMetaSchema,
  ExperienceCaptureResolutionMetaSchema,
  type ApplicationId,
  type ExperienceCaptureMeta,
} from "@/domain/resume-writing/schemas";
import { projectResumeWritingWorkspace } from "@/domain/resume-writing/workspace";
import { hashCareerAnswer } from "@/domain/career-memory/answerHash";
import { projectCareerRegistrationReadiness } from "@/domain/career-memory/registrationReadiness";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

type CaptureMessage = {
  readonly id: string;
  readonly kind: QuestionAiMessageKind;
  readonly meta: unknown;
};

export type PendingExperienceCapture = {
  readonly id: string;
  readonly questionId: string;
  readonly summary: string;
  readonly items: ExperienceCaptureMeta["items"];
};

export type DeferredCaptureTask = {
  readonly taskId: string;
  readonly questionId: string;
  readonly status: "retrying" | "needs_attention";
  readonly attemptCount: number;
  readonly nextRetryAt: string | null;
  readonly lastErrorCode: string | null;
  readonly requiresReopen: boolean;
};

function findPendingCaptures(
  questionId: string,
  messages: readonly CaptureMessage[],
): PendingExperienceCapture[] {
  const resolvedCaptureIds = new Set<string>(
    messages.flatMap((message) => {
      if (
        message.kind !== QuestionAiMessageKind.APPLY &&
        message.kind !== QuestionAiMessageKind.DISCARD
      ) {
        return [];
      }

      const parsed = ExperienceCaptureResolutionMetaSchema.safeParse(message.meta);
      return parsed.success ? [parsed.data.captureId] : [];
    }),
  );

  return messages.flatMap((message) => {
    if (
      message.kind !== QuestionAiMessageKind.SUGGESTION ||
      resolvedCaptureIds.has(message.id)
    ) {
      return [];
    }

    const parsed = ExperienceCaptureMetaSchema.safeParse(message.meta);
    if (!parsed.success) return [];

    return [
      {
        id: message.id,
        questionId,
        summary: parsed.data.summary,
        items: parsed.data.items,
      },
    ];
  });
}

export async function getResumeWritingWorkspace(input: {
  readonly applicationId: ApplicationId;
  readonly userId: string;
  readonly teamId: string;
}) {
  const application = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: {
          relatedBricks: {
            where: {
              isSelected: true,
              brick: { userId: input.userId },
            },
            include: { brick: true },
          },
          aiMessages: {
            where: {
              kind: {
                in: [
                  QuestionAiMessageKind.SUGGESTION,
                  QuestionAiMessageKind.APPLY,
                  QuestionAiMessageKind.DISCARD,
                ],
              },
            },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              kind: true,
              meta: true,
            },
          },
        },
      },
    },
  });

  if (!application) {
    throw new ServiceError("APPLICATION_NOT_FOUND", 404, "Application not found");
  }
  if (application.userId !== input.userId) {
    throw new ServiceError("FORBIDDEN", 403, "Unauthorized");
  }
  if (application.teamId && application.teamId !== input.teamId) {
    throw new ServiceError("FORBIDDEN", 403, "Team access denied");
  }

  const [
    availableBrickCount,
    capturedFromWritingCount,
    trustedFactCount,
    pendingCandidateCount,
    processingSourceCount,
    failedSourceCount,
    captureTasks,
  ] = await Promise.all([
    prisma.experienceBrick.count({
      where: { userId: input.userId, memoryStatus: "CONFIRMED" },
    }),
    prisma.experienceBrick.count({
      where: {
        userId: input.userId,
        memoryStatus: "CONFIRMED",
        source: BrickSource.AI_EXTRACT,
      },
    }),
    prisma.careerFact.count({
      where: {
        userId: input.userId,
        active: true,
        trustStatus: "TRUSTED",
      },
    }),
    prisma.careerExperienceCandidate.count({
      where: { userId: input.userId, status: "PENDING" },
    }),
    prisma.careerSource.count({
      where: {
        userId: input.userId,
        deletedAt: null,
        status: { in: ["QUEUED", "PARSING", "INDEXING", "EXTRACTING"] },
      },
    }),
    prisma.careerSource.count({
      where: {
        userId: input.userId,
        deletedAt: null,
        status: "FAILED",
      },
    }),
    prisma.careerFinalAnswerCaptureTask.findMany({
      where: {
        userId: input.userId,
        applicationId: application.id,
        status: { in: ["PENDING", "PROCESSING", "FAILED"] },
      },
      select: {
        id: true,
        questionId: true,
        status: true,
        attemptCount: true,
        nextAttemptAt: true,
        lastErrorCode: true,
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const legacyPendingCaptures = application.questions.flatMap((question) =>
    findPendingCaptures(question.id, question.aiMessages),
  );
  const firstClassCandidates = await prisma.careerExperienceCandidate.findMany({
    where: {
      userId: input.userId,
      status: "PENDING",
      captureProposalId: null,
      question: { applicationId: application.id },
    },
    orderBy: { createdAt: "asc" },
  });
  const currentQuestionState = new Map(
    application.questions.map((question) => [
      question.id,
      {
        answerHash: hashCareerAnswer(question.answer ?? ""),
        answerRevision: question.answerRevision,
      },
    ]),
  );
  const pendingProposals = await prisma.careerCaptureProposal.findMany({
    where: {
      userId: input.userId,
      status: "PENDING",
      question: { applicationId: application.id },
    },
    include: {
      candidates: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const staleProposalIds = pendingProposals
    .filter((proposal) => {
      const current = currentQuestionState.get(proposal.questionId);
      return (
        !current ||
        proposal.answerHash !== current.answerHash ||
        proposal.answerRevision !== current.answerRevision
      );
    })
    .map((proposal) => proposal.id);
  if (staleProposalIds.length > 0) {
    await prisma.careerCaptureProposal.updateMany({
      where: {
        id: { in: staleProposalIds },
        userId: input.userId,
        status: "PENDING",
      },
      data: { status: "SUPERSEDED", resolvedAt: new Date() },
    });
  }
  const pendingCaptures: PendingExperienceCapture[] = [
    ...legacyPendingCaptures,
    ...firstClassCandidates.map((candidate) => ({
      id: candidate.id,
      questionId: candidate.questionId!,
      summary: "검토할 경력 기억 후보가 있습니다.",
      items: [
        {
          previewId: candidate.id,
          mode: candidate.mode.toLocaleLowerCase("en-US") as
            | "create"
            | "link"
            | "augment",
          title: candidate.title,
          content: candidate.content,
          originalText: candidate.originalText ?? candidate.content,
          period: candidate.period,
          tags: candidate.tags,
          matchedBrickId: candidate.targetExperienceId,
          matchedBrickTitle: null,
          reason: "검토 후 경력 기억에 반영",
          existingContent: null,
          existingOriginalText: null,
        },
      ],
    })),
    ...pendingProposals
      .filter((proposal) => !staleProposalIds.includes(proposal.id))
      .map((proposal) => ({
        id: proposal.id,
        questionId: proposal.questionId,
        summary: proposal.summary ?? "검토할 경력 기억 후보가 있습니다.",
        items: proposal.candidates.map((candidate) => ({
          previewId: candidate.id,
          mode: candidate.mode.toLocaleLowerCase("en-US") as
            | "create"
            | "link"
            | "augment",
          title: candidate.title,
          content: candidate.content,
          originalText: candidate.originalText ?? candidate.content,
          period: candidate.period,
          tags: candidate.tags,
          matchedBrickId: candidate.targetExperienceId,
          matchedBrickTitle: null,
          reason: "검토 후 경력 기억에 반영",
          existingContent: null,
          existingOriginalText: null,
        })),
      })),
  ];
  const pendingCountByQuestion = new Map<string, number>();
  for (const capture of pendingCaptures) {
    const currentCount = pendingCountByQuestion.get(capture.questionId) ?? 0;
    pendingCountByQuestion.set(
      capture.questionId,
      currentCount + capture.items.length,
    );
  }

  const workspace = projectResumeWritingWorkspace({
    application: {
      id: application.id,
      companyName: application.companyName,
      jobTitle: application.jobTitle,
      status: application.status,
    },
    questions: application.questions.map((question) => ({
      id: question.id,
      order: question.order,
      questionText: question.questionText,
      charLimit: question.charLimit,
      answer: question.answer,
      isCompleted: question.isCompleted,
      selectedBricks: question.relatedBricks.map((link) => ({
        id: link.brick.id,
        source: link.brick.source,
      })),
      pendingCaptureCount: pendingCountByQuestion.get(question.id) ?? 0,
    })),
    memory: {
      availableBrickCount,
      capturedFromWritingCount,
    },
    pendingCaptureTaskCount: captureTasks.length,
  });
  const registration = projectCareerRegistrationReadiness({
    confirmedExperienceCount: availableBrickCount,
    trustedFactCount,
    pendingCandidateCount,
    processingSourceCount,
    failedSourceCount,
  });

  return {
    ...workspace,
    pendingCaptures,
    deferredCaptures: captureTasks.map(
      (task): DeferredCaptureTask => ({
        taskId: task.id,
        questionId: task.questionId,
        status: task.status === "FAILED" ? "needs_attention" : "retrying",
        attemptCount: task.attemptCount,
        nextRetryAt: task.nextAttemptAt?.toISOString() ?? null,
        lastErrorCode: task.lastErrorCode,
        requiresReopen: application.status === "DONE",
      }),
    ),
    memoryReadiness: {
      ...registration,
      status: registration.registrationStatus,
      confirmedExperienceCount: availableBrickCount,
      trustedFactCount,
      pendingCandidateCount,
      processingSourceCount,
      failedSourceCount,
      recoveryHref: "/resume/bricks" as const,
    },
  };
}
