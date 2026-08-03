import { ApplicationStatus, Prisma } from "@prisma/client";
import {
  ResumeBriefSchema,
  type StartResumeApplicationCommand,
} from "@/domain/resume-writing/contracts";
import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";
import { toValidDateOrNull } from "@/lib/utils/datetime";
import { buildResumeBriefContext, parseResumeBrief } from "./resumeBrief";
import { getCareerMemoryReadiness } from "./careerMemoryReadinessService";
import { generateResumeStrategy } from "./resumeService";

const APPLICATION_LIST_MAX_PAGE_SIZE = 100;
const ACTIVE_APPLICATION_STATUSES = [
  ApplicationStatus.WRITING,
  ApplicationStatus.DONE,
] as const;

export async function listApplications(input: {
  userId: string;
  teamId: string;
  q?: string;
  status?: ApplicationStatus[];
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(
    APPLICATION_LIST_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(input.pageSize ?? 10)),
  );
  const q = input.q?.trim();
  const where: Prisma.ApplicationWhereInput = {
    userId: input.userId,
    teamId: input.teamId,
    status:
      input.status && input.status.length > 0
        ? { in: input.status }
        : { in: [...ACTIVE_APPLICATION_STATUSES] },
    ...(q
      ? {
          OR: [
            { companyName: { contains: q, mode: "insensitive" } },
            { jobTitle: { contains: q, mode: "insensitive" } },
            { jdText: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.application.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        _count: {
          select: { questions: true },
        },
      },
    }),
    prisma.application.count({ where }),
  ]);

  return {
    items,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    page,
    pageSize,
  };
}

export async function createApplication(input: {
  userId: string;
  teamId: string;
  companyName: string;
  jobTitle: string;
  jdText?: string;
  deadline?: string | null;
  questions: Array<{ questionText: string; charLimit?: number }>;
}) {
  const memoryReadiness = await getCareerMemoryReadiness(input.userId);
  if (memoryReadiness.registrationStatus !== "READY") {
    throw serviceError(
      409,
      "CAREER_MEMORY_NOT_READY",
      "Career memory must be reviewed before starting an application",
      {
        registrationStatus: memoryReadiness.registrationStatus,
        pendingCandidateCount: memoryReadiness.pendingCandidateCount,
        nextAction: memoryReadiness.nextAction,
      },
    );
  }
  const parsedDeadline = toValidDateOrNull(input.deadline);
  const parsedLegacyBrief = parseResumeBrief(input.jdText);
  const structuredBrief = ResumeBriefSchema.safeParse({
    companyName: input.companyName,
    jobTitle: input.jobTitle,
    ...parsedLegacyBrief,
    questions: input.questions.map((question) => ({
      questionText: question.questionText,
      charLimit: question.charLimit ?? null,
    })),
  });
  const app = await prisma.application.create({
    data: {
      userId: input.userId,
      teamId: input.teamId,
      companyName: input.companyName,
      jobTitle: input.jobTitle,
      jdText: input.jdText,
      brief: structuredBrief.success
        ? (structuredBrief.data as Prisma.InputJsonValue)
        : undefined,
      deadline: parsedDeadline,
      status: "WRITING",
      questions: {
        create: input.questions.map((q, idx) => ({
          questionText: q.questionText,
          charLimit: q.charLimit,
          order: idx,
        })),
      },
    },
  });

  return app;
}

function strategyFailure(error: unknown): Prisma.InputJsonObject {
  const value = error as { code?: string; message?: string };
  return {
    code: value.code ?? "STRATEGY_GENERATION_FAILED",
    message: value.message ?? "Strategy generation failed",
    retryable: true,
  };
}

export async function startResumeApplication(
  input: {
    userId: string;
    teamId: string;
    command: StartResumeApplicationCommand;
  },
  dependencies: {
    generateStrategy?: typeof generateResumeStrategy;
  } = {},
) {
  const existing = await prisma.application.findUnique({
    where: {
      userId_clientRequestId: {
        userId: input.userId,
        clientRequestId: input.command.clientRequestId,
      },
    },
    select: {
      id: true,
      strategyStatus: true,
      strategyError: true,
    },
  });
  if (existing) {
    return {
      applicationId: existing.id,
      strategyStatus: existing.strategyStatus,
      strategyError: existing.strategyError,
      stage: "PLAN" as const,
      nextAction:
        existing.strategyStatus === "FAILED"
          ? ({ type: "retry_strategy" } as const)
          : ({ type: "review_question_strategy" } as const),
      idempotent: true,
    };
  }

  const memoryReadiness = await getCareerMemoryReadiness(input.userId);
  if (memoryReadiness.registrationStatus !== "READY") {
    throw serviceError(
      409,
      "CAREER_MEMORY_NOT_READY",
      "Career memory must be reviewed before starting an application",
      {
        registrationStatus: memoryReadiness.registrationStatus,
        pendingCandidateCount: memoryReadiness.pendingCandidateCount,
        confirmedExperienceCount: memoryReadiness.confirmedExperienceCount,
        trustedFactCount: memoryReadiness.trustedFactCount,
        nextAction: memoryReadiness.nextAction,
      },
    );
  }

  let application: { id: string };
  try {
    application = await prisma.application.create({
      data: {
        userId: input.userId,
        teamId: input.teamId,
        clientRequestId: input.command.clientRequestId,
        companyName: input.command.brief.companyName,
        jobTitle: input.command.brief.jobTitle,
        jdText: buildResumeBriefContext({
          ...input.command.brief,
        }),
        deadline: toValidDateOrNull(input.command.brief.deadline),
        brief: input.command.brief as Prisma.InputJsonValue,
        commonWritingGuidance: input.command.commonWritingGuidance,
        strategyStatus: "PENDING",
        status: "WRITING",
        questions: {
          create: input.command.brief.questions.map((question, index) => ({
            questionText: question.questionText,
            charLimit: question.charLimit,
            order: index,
          })),
        },
      },
      select: { id: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrent = await prisma.application.findUniqueOrThrow({
        where: {
          userId_clientRequestId: {
            userId: input.userId,
            clientRequestId: input.command.clientRequestId,
          },
        },
        select: {
          id: true,
          strategyStatus: true,
          strategyError: true,
        },
      });
      return {
        applicationId: concurrent.id,
        strategyStatus: concurrent.strategyStatus,
        strategyError: concurrent.strategyError,
        stage: "PLAN" as const,
        nextAction:
          concurrent.strategyStatus === "FAILED"
            ? ({ type: "retry_strategy" } as const)
            : ({ type: "review_question_strategy" } as const),
        idempotent: true,
      };
    }
    throw error;
  }

  try {
    await (dependencies.generateStrategy ?? generateResumeStrategy)({
      applicationId: application.id,
      userId: input.userId,
      teamId: input.teamId,
    });
    await prisma.application.update({
      where: { id: application.id },
      data: {
        strategyStatus: "READY",
        strategyError: Prisma.DbNull,
        strategyUpdatedAt: new Date(),
      },
    });
    return {
      applicationId: application.id,
      strategyStatus: "READY" as const,
      strategyError: null,
      stage: "PLAN" as const,
      nextAction: { type: "review_question_strategy" } as const,
      idempotent: false,
    };
  } catch (error) {
    const failure = strategyFailure(error);
    await prisma.application.update({
      where: { id: application.id },
      data: {
        strategyStatus: "FAILED",
        strategyError: failure,
        strategyUpdatedAt: new Date(),
      },
    });
    return {
      applicationId: application.id,
      strategyStatus: "FAILED" as const,
      strategyError: failure,
      stage: "PLAN" as const,
      nextAction: { type: "retry_strategy" } as const,
      idempotent: false,
    };
  }
}

export async function retryResumeApplicationStrategy(
  input: {
    applicationId: string;
    userId: string;
    teamId: string;
  },
  dependencies: {
    generateStrategy?: typeof generateResumeStrategy;
  } = {},
) {
  const application = await prisma.application.findFirst({
    where: { id: input.applicationId, userId: input.userId },
    select: { id: true, teamId: true },
  });
  if (!application) {
    throw serviceError(404, "NOT_FOUND", "Application not found");
  }
  if (application.teamId && application.teamId !== input.teamId) {
    throw serviceError(403, "FORBIDDEN", "Team access denied");
  }
  await prisma.application.update({
    where: { id: application.id },
    data: {
      strategyStatus: "PENDING",
      strategyError: Prisma.DbNull,
      strategyUpdatedAt: new Date(),
    },
  });
  try {
    const strategy = await (
      dependencies.generateStrategy ?? generateResumeStrategy
    )(input);
    await prisma.application.update({
      where: { id: application.id },
      data: {
        strategyStatus: "READY",
        strategyError: Prisma.DbNull,
        strategyUpdatedAt: new Date(),
      },
    });
    return {
      applicationId: application.id,
      strategyStatus: "READY" as const,
      strategyError: null,
      items: strategy.items,
      nextAction: { type: "review_question_strategy" } as const,
    };
  } catch (error) {
    const failure = strategyFailure(error);
    await prisma.application.update({
      where: { id: application.id },
      data: {
        strategyStatus: "FAILED",
        strategyError: failure,
        strategyUpdatedAt: new Date(),
      },
    });
    return {
      applicationId: application.id,
      strategyStatus: "FAILED" as const,
      strategyError: failure,
      items: [],
      nextAction: { type: "retry_strategy" } as const,
    };
  }
}

export async function updateApplicationDraft(input: {
  userId: string;
  teamId: string;
  applicationId: string;
  companyName?: string;
  jobTitle?: string;
  jdText?: string | null;
  deadline?: string | null;
  questions?: Array<{ id?: string; questionText: string; charLimit?: number }>;
}) {
  const app = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: {
          relatedBricks: true,
          suggestions: true,
        },
      },
    },
  });

  if (!app) {
    throw serviceError(404, "NOT_FOUND", "Not found");
  }

  if (app.userId !== input.userId) {
    throw serviceError(403, "FORBIDDEN", "Unauthorized");
  }

  if (app.teamId && app.teamId !== input.teamId) {
    throw serviceError(403, "FORBIDDEN", "Team access denied");
  }

  const hasQuestionDependencies = app.questions.some(
    (question) =>
      Boolean(question.answer?.trim()) ||
      Boolean(question.aiAdvice?.trim()) ||
      question.relatedBricks.length > 0 ||
      question.suggestions.length > 0,
  );

  return prisma.$transaction(async (tx) => {
    const parsedDeadline =
      input.deadline === undefined ? undefined : toValidDateOrNull(input.deadline);

    const updatedApplication = await tx.application.update({
      where: { id: input.applicationId },
      data: {
        companyName: input.companyName ?? undefined,
        jobTitle: input.jobTitle ?? undefined,
        jdText: input.jdText ?? undefined,
        deadline: parsedDeadline,
      },
    });

    if (!input.questions) {
      return updatedApplication;
    }

    const normalizedQuestions = input.questions
      .map((question) => ({
        id: question.id,
        questionText: question.questionText.trim(),
        charLimit: question.charLimit,
      }))
      .filter((question) => question.questionText.length > 0);

    if (hasQuestionDependencies) {
      const existingById = new Map(app.questions.map((question) => [question.id, question]));
      const incomingIds = new Set(
        normalizedQuestions
          .map((question) => question.id)
          .filter((id): id is string => Boolean(id && existingById.has(id))),
      );

      const removableIds = app.questions
        .filter(
          (question) =>
            !incomingIds.has(question.id) &&
            !question.answer?.trim() &&
            !question.aiAdvice?.trim() &&
            question.relatedBricks.length === 0 &&
            question.suggestions.length === 0,
        )
        .map((question) => question.id);

      if (removableIds.length > 0) {
        await tx.question.deleteMany({
          where: {
            applicationId: input.applicationId,
            id: { in: removableIds },
          },
        });
      }

      for (const [index, question] of normalizedQuestions.entries()) {
        if (question.id && existingById.has(question.id)) {
          await tx.question.update({
            where: { id: question.id },
            data: {
              questionText: question.questionText,
              charLimit: question.charLimit,
              order: index,
            },
          });
          continue;
        }

        await tx.question.create({
          data: {
            applicationId: input.applicationId,
            questionText: question.questionText,
            charLimit: question.charLimit,
            order: index,
          },
        });
      }

      return updatedApplication;
    }

    await tx.question.deleteMany({
      where: { applicationId: input.applicationId },
    });

    if (normalizedQuestions.length > 0) {
      await tx.question.createMany({
        data: normalizedQuestions.map((question, index) => ({
          applicationId: input.applicationId,
          questionText: question.questionText,
          charLimit: question.charLimit,
          order: index,
        })),
      });
    }

    return updatedApplication;
  });
}

export async function getApplicationById(input: {
  userId: string;
  teamId: string;
  applicationId: string;
}) {
  const app = await prisma.application.findUnique({
    where: { id: input.applicationId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: {
          relatedBricks: {
            where: { brick: { userId: input.userId } },
            include: { brick: true },
          },
        },
      },
    },
  });

  if (!app) {
    throw serviceError(404, "NOT_FOUND", "Not found");
  }

  if (app.userId !== input.userId) {
    throw serviceError(403, "FORBIDDEN", "Unauthorized");
  }

  if (app.teamId && app.teamId !== input.teamId) {
    throw serviceError(403, "FORBIDDEN", "Team access denied");
  }

  return app;
}

export async function updateApplicationStatus(input: {
  userId: string;
  teamId: string;
  applicationId: string;
  status: ApplicationStatus;
}) {
  const app = await prisma.application.findUnique({
    where: { id: input.applicationId },
    select: { id: true, userId: true, teamId: true },
  });

  if (!app) {
    throw serviceError(404, "NOT_FOUND", "Not found");
  }

  if (app.userId !== input.userId) {
    throw serviceError(403, "FORBIDDEN", "Unauthorized");
  }

  if (app.teamId && app.teamId !== input.teamId) {
    throw serviceError(403, "FORBIDDEN", "Team access denied");
  }

  if (input.status === ApplicationStatus.DONE) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id"
        FROM "application"
        WHERE "id" = ${input.applicationId}
          AND "user_id" = ${input.userId}
        FOR UPDATE
      `;
      const [
        questionCount,
        incompleteCount,
        pendingProposalCount,
        pendingCandidateCount,
        processingCaptureTaskCount,
      ] =
        await Promise.all([
          tx.question.count({
            where: { applicationId: input.applicationId },
          }),
          tx.question.count({
            where: {
              applicationId: input.applicationId,
              isCompleted: false,
            },
          }),
          tx.careerCaptureProposal.count({
            where: {
              userId: input.userId,
              status: "PENDING",
              question: { applicationId: input.applicationId },
            },
          }),
          tx.careerExperienceCandidate.count({
            where: {
              userId: input.userId,
              status: "PENDING",
              captureProposalId: null,
              question: { applicationId: input.applicationId },
            },
          }),
          tx.careerFinalAnswerCaptureTask.count({
            where: {
              applicationId: input.applicationId,
              userId: input.userId,
              status: { in: ["PENDING", "PROCESSING", "FAILED"] },
            },
          }),
        ]);
      if (
        questionCount === 0 ||
        incompleteCount > 0 ||
        pendingProposalCount > 0 ||
        pendingCandidateCount > 0 ||
        processingCaptureTaskCount > 0
      ) {
        throw serviceError(
          409,
          "APPLICATION_COMPLETION_NOT_READY",
          "Every question and capture decision must be completed first",
          {
            questionCount,
            incompleteQuestionCount: incompleteCount,
            pendingCaptureProposalCount: pendingProposalCount,
            pendingCaptureCandidateCount: pendingCandidateCount,
            unresolvedCaptureTaskCount: processingCaptureTaskCount,
            nextAction:
              incompleteCount > 0
                ? { type: "complete_questions" }
                : {
                    type: "resolve_experience_captures",
                    allowedDecisions: [
                      "APPLY",
                      "DISMISS",
                      "RETRY",
                      "SKIP",
                    ],
                  },
          },
        );
      }
      return tx.application.update({
        where: { id: input.applicationId },
        data: { status: ApplicationStatus.DONE },
      });
    });
  }

  return prisma.application.update({
    where: { id: input.applicationId },
    data: { status: input.status },
  });
}

export async function deleteApplication(input: {
  userId: string;
  teamId: string;
  applicationId: string;
}) {
  const result = await prisma.application.deleteMany({
    where: {
      id: input.applicationId,
      userId: input.userId,
      teamId: input.teamId,
    },
  });

  if (result.count === 0) {
    throw serviceError(404, "NOT_FOUND", "Not found or unauthorized");
  }

  return result.count;
}

export async function bulkDeleteApplications(input: {
  userId: string;
  teamId: string;
  ids: string[];
}) {
  if (!Array.isArray(input.ids) || input.ids.length === 0) {
    throw serviceError(400, "MISSING_IDS", "No IDs provided");
  }

  const result = await prisma.application.deleteMany({
    where: {
      id: { in: input.ids },
      userId: input.userId,
      teamId: input.teamId,
    },
  });

  return result.count;
}

export { serviceError };
