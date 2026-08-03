import { randomUUID } from "node:crypto";
import {
  ApplicationStatus,
  CareerCaptureTaskStatus,
  type CareerFinalAnswerCaptureTask,
} from "@prisma/client";

import { hashCareerAnswer } from "@/domain/career-memory/answerHash";
import {
  CAREER_CAPTURE_LEASE_MS,
  CAREER_CAPTURE_MAX_AUTOMATIC_ATTEMPTS,
  nextCareerCaptureAttemptAt,
} from "@/domain/career-memory/captureRetryPolicy";
import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";
import { captureFinalAnswerProposals } from "./careerFinalAnswerCaptureService";

const MAX_STORED_ERROR_LENGTH = 240;
const EXTRACTION_ERROR_CODE = "EXTRACTION_UNAVAILABLE";

function boundedErrorMessage(error: unknown): string {
  const safe =
    error instanceof Error && error.name
      ? `${error.name}: career capture extraction failed`
      : "Career capture extraction failed";
  return safe.slice(0, MAX_STORED_ERROR_LENGTH);
}

export type DeferredCareerCapture = {
  kind: "deferred";
  reason: typeof EXTRACTION_ERROR_CODE;
  taskId: string;
  status: "retrying" | "needs_attention";
  attemptCount: number;
  nextRetryAt: string | null;
};

export function projectSuccessfulCareerCaptureProposal(
  proposal: Awaited<ReturnType<typeof captureFinalAnswerProposals>>,
) {
  const items = proposal.candidates.map((candidate) => ({
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
    reason: "완성 답변에서 추출",
    existingContent: null,
    existingOriginalText: null,
  }));
  return items.length > 0
    ? {
        kind: "pending_approval" as const,
        captureId: proposal.id,
        summary:
          proposal.summary ?? "완성 답변에서 검토할 경력 기억 후보를 찾았습니다.",
        items,
      }
    : {
        kind: "none" as const,
        summary: proposal.summary ?? "새로 저장할 경력 기억이 없습니다.",
      };
}

export function projectDeferredCareerCaptureTask(
  task: Pick<
    CareerFinalAnswerCaptureTask,
    "id" | "status" | "attemptCount" | "nextAttemptAt"
  >,
): DeferredCareerCapture {
  const needsAttention = task.status === CareerCaptureTaskStatus.FAILED;
  return {
    kind: "deferred",
    reason: EXTRACTION_ERROR_CODE,
    taskId: task.id,
    status: needsAttention ? "needs_attention" : "retrying",
    attemptCount: task.attemptCount,
    nextRetryAt: needsAttention ? null : task.nextAttemptAt?.toISOString() ?? null,
  };
}

type CaptureTaskAttemptResult =
  | { kind: "claimed"; task: CareerFinalAnswerCaptureTask; proposal: Awaited<ReturnType<typeof captureFinalAnswerProposals>> }
  | { kind: "deferred"; task: CareerFinalAnswerCaptureTask }
  | { kind: "superseded"; task: CareerFinalAnswerCaptureTask }
  | { kind: "in_progress"; task: CareerFinalAnswerCaptureTask }
  | { kind: "not_claimed"; task: CareerFinalAnswerCaptureTask };

async function markSuperseded(taskId: string, processingToken: string, now: Date) {
  await prisma.careerFinalAnswerCaptureTask.updateMany({
    where: { id: taskId, processingToken, status: CareerCaptureTaskStatus.PROCESSING },
    data: {
      status: CareerCaptureTaskStatus.SUPERSEDED,
      processingToken: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
      completedAt: now,
    },
  });
  return prisma.careerFinalAnswerCaptureTask.findUniqueOrThrow({ where: { id: taskId } });
}

export async function attemptCareerFinalAnswerCaptureTask(
  input: {
    taskId: string;
    mode: "synchronous" | "manual" | "automatic";
    now?: Date;
  },
  dependencies: {
    capture?: typeof captureFinalAnswerProposals;
  } = {},
): Promise<CaptureTaskAttemptResult> {
  const now = input.now ?? new Date();
  const processingToken = randomUUID();
  const target = await prisma.careerFinalAnswerCaptureTask.findUniqueOrThrow({
    where: { id: input.taskId },
    select: { applicationId: true },
  });
  const claimWhere =
    input.mode === "manual"
      ? {
          OR: [
            { status: { in: [CareerCaptureTaskStatus.PENDING, CareerCaptureTaskStatus.FAILED] } },
            {
              status: CareerCaptureTaskStatus.PROCESSING,
              leaseExpiresAt: { lte: now },
            },
          ],
        }
      : {
          attemptCount: { lt: CAREER_CAPTURE_MAX_AUTOMATIC_ATTEMPTS },
          OR: [
            {
              status: CareerCaptureTaskStatus.PENDING,
              OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
            },
            {
              status: CareerCaptureTaskStatus.PROCESSING,
              leaseExpiresAt: { lte: now },
            },
          ],
          ...(input.mode === "automatic"
            ? { application: { status: ApplicationStatus.WRITING } }
            : {}),
        };
  const { claimed, claimedTask } = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "application"
      WHERE "id" = ${target.applicationId}
      FOR UPDATE
    `;
    const result = await tx.careerFinalAnswerCaptureTask.updateMany({
      where: { id: input.taskId, ...claimWhere },
      data: {
        status: CareerCaptureTaskStatus.PROCESSING,
        processingToken,
        leaseExpiresAt: new Date(now.getTime() + CAREER_CAPTURE_LEASE_MS),
        nextAttemptAt: null,
        attemptCount: { increment: 1 },
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    return {
      claimed: result,
      claimedTask:
        result.count === 1
          ? await tx.careerFinalAnswerCaptureTask.findUniqueOrThrow({
              where: { id: input.taskId },
            })
          : null,
    };
  });
  if (claimed.count !== 1) {
    const task = await prisma.careerFinalAnswerCaptureTask.findUniqueOrThrow({
      where: { id: input.taskId },
    });
    return task.status === CareerCaptureTaskStatus.PROCESSING
      ? { kind: "in_progress", task }
      : { kind: "not_claimed", task };
  }

  const task = claimedTask!;
  const question = await prisma.question.findFirst({
    where: {
      id: task.questionId,
      applicationId: task.applicationId,
      application: { userId: task.userId },
    },
    select: {
      id: true,
      applicationId: true,
      answer: true,
      answerRevision: true,
      isCompleted: true,
      application: { select: { userId: true } },
    },
  });
  if (
    !question ||
    !question.isCompleted ||
    question.application.userId !== task.userId ||
    question.applicationId !== task.applicationId ||
    question.answerRevision !== task.answerRevision ||
    hashCareerAnswer(question.answer ?? "") !== task.answerHash
  ) {
    return {
      kind: "superseded",
      task: await markSuperseded(task.id, processingToken, now),
    };
  }

  try {
    const proposal = await (dependencies.capture ?? captureFinalAnswerProposals)({
      questionId: task.questionId,
      userId: task.userId,
      answer: question.answer ?? "",
      answerRevision: task.answerRevision,
    });
    const completed = await prisma.careerFinalAnswerCaptureTask.updateMany({
      where: {
        id: task.id,
        processingToken,
        status: CareerCaptureTaskStatus.PROCESSING,
      },
      data: {
        status: CareerCaptureTaskStatus.SUCCEEDED,
        captureProposalId: proposal.id,
        completedAt: now,
        processingToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    if (completed.count !== 1) {
      return {
        kind: "not_claimed",
        task: await prisma.careerFinalAnswerCaptureTask.findUniqueOrThrow({
          where: { id: task.id },
        }),
      };
    }
    return {
      kind: "claimed",
      proposal,
      task: await prisma.careerFinalAnswerCaptureTask.findUniqueOrThrow({
        where: { id: task.id },
      }),
    };
  } catch (error) {
    const current = await prisma.careerFinalAnswerCaptureTask.findUniqueOrThrow({
      where: { id: task.id },
      select: { attemptCount: true },
    });
    const nextAttemptAt = nextCareerCaptureAttemptAt(current.attemptCount, now);
    const status = nextAttemptAt
      ? CareerCaptureTaskStatus.PENDING
      : CareerCaptureTaskStatus.FAILED;
    await prisma.careerFinalAnswerCaptureTask.updateMany({
      where: {
        id: task.id,
        processingToken,
        status: CareerCaptureTaskStatus.PROCESSING,
      },
      data: {
        status,
        nextAttemptAt,
        processingToken: null,
        leaseExpiresAt: null,
        lastErrorCode: EXTRACTION_ERROR_CODE,
        lastErrorMessage: boundedErrorMessage(error),
        completedAt: status === CareerCaptureTaskStatus.FAILED ? now : null,
      },
    });
    return {
      kind: "deferred",
      task: await prisma.careerFinalAnswerCaptureTask.findUniqueOrThrow({
        where: { id: task.id },
      }),
    };
  }
}

export async function createAndAttemptCareerFinalAnswerCaptureTask(
  input: {
    questionId: string;
    userId: string;
    answer: string;
    answerRevision: number;
  },
  dependencies: {
    capture?: typeof captureFinalAnswerProposals;
    now?: Date;
  } = {},
) {
  const question = await prisma.question.findFirst({
    where: {
      id: input.questionId,
      application: { userId: input.userId },
      answerRevision: input.answerRevision,
      isCompleted: true,
    },
    select: { applicationId: true },
  });
  if (!question) {
    throw serviceError(409, "CAPTURE_TASK_SUPERSEDED", "Answer snapshot is no longer current");
  }
  const task = await prisma.careerFinalAnswerCaptureTask.upsert({
    where: {
      userId_questionId_answerHash_answerRevision: {
        userId: input.userId,
        questionId: input.questionId,
        answerHash: hashCareerAnswer(input.answer),
        answerRevision: input.answerRevision,
      },
    },
    create: {
      userId: input.userId,
      applicationId: question.applicationId,
      questionId: input.questionId,
      answerHash: hashCareerAnswer(input.answer),
      answerRevision: input.answerRevision,
    },
    update: {},
  });
  if (task.status === CareerCaptureTaskStatus.SUCCEEDED) {
    const proposal = await prisma.careerCaptureProposal.findUniqueOrThrow({
      where: { id: task.captureProposalId! },
      include: { candidates: { include: { evidence: true } } },
    });
    return { kind: "claimed" as const, task, proposal };
  }
  return attemptCareerFinalAnswerCaptureTask(
    { taskId: task.id, mode: "synchronous", now: dependencies.now },
    { capture: dependencies.capture },
  );
}

export async function retryCareerFinalAnswerCaptureTask(
  input: {
    taskId: string;
    applicationId: string;
    userId: string;
    reopenApplication: boolean;
  },
  dependencies: { capture?: typeof captureFinalAnswerProposals; now?: Date } = {},
) {
  const task = await prisma.careerFinalAnswerCaptureTask.findFirst({
    where: {
      id: input.taskId,
      applicationId: input.applicationId,
      userId: input.userId,
    },
    include: { application: { select: { status: true } } },
  });
  if (!task) throw serviceError(404, "CAPTURE_TASK_NOT_FOUND", "Capture task not found");
  if (task.status === CareerCaptureTaskStatus.SUPERSEDED) {
    throw serviceError(409, "CAPTURE_TASK_SUPERSEDED", "Answer snapshot is no longer current");
  }
  if (task.status === CareerCaptureTaskStatus.SUCCEEDED && task.captureProposalId) {
    return {
      kind: "claimed" as const,
      task,
      proposal: await prisma.careerCaptureProposal.findUniqueOrThrow({
        where: { id: task.captureProposalId },
        include: { candidates: { include: { evidence: true } } },
      }),
    };
  }
  if (task.application.status === ApplicationStatus.DONE) {
    if (!input.reopenApplication) {
      throw serviceError(409, "APPLICATION_REOPEN_REQUIRED", "Reopen the application before retrying");
    }
    await prisma.application.updateMany({
      where: {
        id: input.applicationId,
        userId: input.userId,
        status: ApplicationStatus.DONE,
      },
      data: { status: ApplicationStatus.WRITING },
    });
  }
  const result = await attemptCareerFinalAnswerCaptureTask(
    { taskId: task.id, mode: "manual", now: dependencies.now },
    { capture: dependencies.capture },
  );
  if (result.kind === "in_progress") {
    throw serviceError(409, "CAPTURE_TASK_IN_PROGRESS", "Capture task is already processing");
  }
  if (result.kind === "superseded") {
    throw serviceError(409, "CAPTURE_TASK_SUPERSEDED", "Answer snapshot is no longer current");
  }
  return result;
}

export async function skipCareerFinalAnswerCaptureTask(input: {
  taskId: string;
  applicationId: string;
  userId: string;
  reason: string;
}) {
  const reason = input.reason.trim();
  if (!reason) {
    throw serviceError(
      400,
      "CAPTURE_TASK_SKIP_REASON_REQUIRED",
      "A skip reason is required",
    );
  }
  const result = await prisma.careerFinalAnswerCaptureTask.updateMany({
    where: {
      id: input.taskId,
      applicationId: input.applicationId,
      userId: input.userId,
      status: { in: [CareerCaptureTaskStatus.PENDING, CareerCaptureTaskStatus.FAILED] },
    },
    data: {
      status: CareerCaptureTaskStatus.SKIPPED,
      skippedAt: new Date(),
      skipReason: reason,
      nextAttemptAt: null,
      processingToken: null,
      leaseExpiresAt: null,
    },
  });
  if (result.count !== 1) {
    const task = await prisma.careerFinalAnswerCaptureTask.findFirst({
      where: {
        id: input.taskId,
        applicationId: input.applicationId,
        userId: input.userId,
      },
    });
    if (!task) {
      throw serviceError(404, "CAPTURE_TASK_NOT_FOUND", "Capture task not found");
    }
    if (task.status === CareerCaptureTaskStatus.SKIPPED) {
      return { kind: "skipped" as const, task, idempotent: true };
    }
    throw serviceError(
      409,
      "CAPTURE_TASK_SKIP_CONFLICT",
      "Capture task cannot be skipped in its current state",
    );
  }
  return {
    kind: "skipped" as const,
    task: await prisma.careerFinalAnswerCaptureTask.findUniqueOrThrow({
      where: { id: input.taskId },
    }),
    idempotent: false,
  };
}

export async function processDueCareerFinalAnswerCaptureTasks(
  input: { limit: number; now?: Date },
  dependencies: { capture?: typeof captureFinalAnswerProposals } = {},
) {
  const now = input.now ?? new Date();
  const limit = Math.min(20, Math.max(1, Math.floor(input.limit)));
  const tasks = await prisma.careerFinalAnswerCaptureTask.findMany({
    where: {
      application: { status: ApplicationStatus.WRITING },
      attemptCount: { lt: CAREER_CAPTURE_MAX_AUTOMATIC_ATTEMPTS },
      OR: [
        {
          status: CareerCaptureTaskStatus.PENDING,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        {
          status: CareerCaptureTaskStatus.PROCESSING,
          leaseExpiresAt: { lte: now },
        },
      ],
    },
    select: { id: true },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: limit,
  });
  const counts = {
    scanned: tasks.length,
    claimed: 0,
    succeeded: 0,
    deferred: 0,
    failed: 0,
    superseded: 0,
  };
  for (const task of tasks) {
    const result = await attemptCareerFinalAnswerCaptureTask(
      { taskId: task.id, mode: "automatic", now },
      { capture: dependencies.capture },
    );
    if (result.kind === "claimed") {
      counts.claimed += 1;
      counts.succeeded += 1;
    } else if (result.kind === "deferred") {
      counts.claimed += 1;
      if (result.task.status === CareerCaptureTaskStatus.FAILED) counts.failed += 1;
      else counts.deferred += 1;
    } else if (result.kind === "superseded") {
      counts.claimed += 1;
      counts.superseded += 1;
    }
  }
  return counts;
}
