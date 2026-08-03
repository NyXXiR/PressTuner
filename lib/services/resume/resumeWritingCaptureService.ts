import { Prisma, QuestionAiMessageKind, QuestionAiMessageRole } from "@prisma/client";

import {
  ExperienceCaptureMetaSchema,
  ExperienceCaptureResolutionMetaSchema,
  type ApplicationId,
  type CaptureActionBody,
  type CaptureId,
} from "@/domain/resume-writing/schemas";
import { ServiceError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { applyResumeQuestionBrickPreview } from "@/lib/services/resume/resumeChatBrickService";
import { decideCareerCandidate } from "@/lib/services/resume/careerCandidateService";

function buildResolutionMeta(input: {
  readonly captureId: CaptureId;
  readonly action: "apply" | "dismiss";
  readonly selectedPreviewIds: readonly string[];
}): Prisma.InputJsonObject {
  return {
    type: "resume_writing_experience_capture_resolution_v1",
    schemaVersion: 1,
    captureId: input.captureId,
    action: input.action,
    selectedPreviewIds: [...input.selectedPreviewIds],
  };
}

export async function resolveResumeWritingCapture(input: {
  readonly applicationId: ApplicationId;
  readonly captureId: CaptureId;
  readonly userId: string;
  readonly teamId: string;
  readonly action: CaptureActionBody;
}) {
  const proposal = await prisma.careerCaptureProposal.findFirst({
    where: {
      id: input.captureId,
      userId: input.userId,
      question: { applicationId: input.applicationId },
    },
    include: {
      question: {
        select: {
          application: { select: { userId: true, teamId: true } },
        },
      },
      candidates: { orderBy: { createdAt: "asc" } },
    },
  });
  if (proposal) {
    if (
      proposal.question.application.userId !== input.userId ||
      (proposal.question.application.teamId &&
        proposal.question.application.teamId !== input.teamId)
    ) {
      throw new ServiceError("FORBIDDEN", 403, "Unauthorized");
    }
    if (proposal.status !== "PENDING") {
      return {
        status: "already_resolved" as const,
        action:
          proposal.status === "APPLIED"
            ? ("apply" as const)
            : ("dismiss" as const),
        appliedCount: 0,
      };
    }
    const candidateIds = new Set(
      proposal.candidates.map((candidate) => candidate.id),
    );
    const selectedIds =
      input.action.action === "apply"
        ? new Set(input.action.selectedPreviewIds)
        : new Set<string>();
    if ([...selectedIds].some((id) => !candidateIds.has(id))) {
      throw new ServiceError(
        "INVALID_CAPTURE_SELECTION",
        400,
        "One or more capture candidates are invalid",
      );
    }
    let appliedCount = 0;
    for (const candidate of proposal.candidates) {
      const approve =
        input.action.action === "apply" && selectedIds.has(candidate.id);
      await decideCareerCandidate({
        candidateId: candidate.id,
        userId: input.userId,
        decision: approve ? "APPROVE" : "REJECT",
        rejectionReason: approve
          ? undefined
          : input.action.action === "dismiss"
            ? "Dismissed from the writing review"
            : "Not selected from the writing review",
      });
      if (approve) appliedCount += 1;
    }
    const resolved = await prisma.careerCaptureProposal.updateMany({
      where: { id: proposal.id, userId: input.userId, status: "PENDING" },
      data: {
        status: input.action.action === "apply" ? "APPLIED" : "DISMISSED",
        resolvedAt: new Date(),
      },
    });
    if (resolved.count === 0) {
      return {
        status: "already_resolved" as const,
        action: input.action.action,
        appliedCount: 0,
      };
    }
    return {
      status:
        input.action.action === "apply"
          ? ("applied" as const)
          : ("dismissed" as const),
      action: input.action.action,
      appliedCount,
    };
  }

  const firstClassCandidate = await prisma.careerExperienceCandidate.findFirst({
    where: {
      id: input.captureId,
      userId: input.userId,
      question: { applicationId: input.applicationId },
    },
    select: { id: true, status: true },
  });
  if (firstClassCandidate) {
    if (firstClassCandidate.status !== "PENDING") {
      return {
        status: "already_resolved" as const,
        action:
          firstClassCandidate.status === "APPROVED"
            ? ("apply" as const)
            : ("dismiss" as const),
        appliedCount: 0,
      };
    }
    if (
      input.action.action === "apply" &&
      !input.action.selectedPreviewIds.includes(firstClassCandidate.id)
    ) {
      throw new ServiceError(
        "INVALID_CAPTURE_SELECTION",
        400,
        "Candidate selection is invalid",
      );
    }
    const decision = await decideCareerCandidate({
      candidateId: firstClassCandidate.id,
      userId: input.userId,
      decision: input.action.action === "apply" ? "APPROVE" : "REJECT",
      rejectionReason:
        input.action.action === "dismiss"
          ? "Dismissed from the writing review"
          : undefined,
    });
    return {
      status:
        input.action.action === "apply"
          ? ("applied" as const)
          : ("dismissed" as const),
      action: input.action.action,
      appliedCount: input.action.action === "apply" ? 1 : 0,
      experienceId: decision.experienceId,
    };
  }

  const capture = await prisma.questionAiMessage.findUnique({
    where: { id: input.captureId },
    include: {
      question: {
        include: {
          application: {
            select: { id: true, userId: true, teamId: true },
          },
        },
      },
    },
  });

  if (
    !capture ||
    capture.kind !== QuestionAiMessageKind.SUGGESTION ||
    capture.question.application.id !== input.applicationId
  ) {
    throw new ServiceError("CAPTURE_NOT_FOUND", 404, "Capture not found");
  }
  if (capture.question.application.userId !== input.userId) {
    throw new ServiceError("FORBIDDEN", 403, "Unauthorized");
  }
  if (
    capture.question.application.teamId &&
    capture.question.application.teamId !== input.teamId
  ) {
    throw new ServiceError("FORBIDDEN", 403, "Team access denied");
  }

  const parsedCapture = ExperienceCaptureMetaSchema.safeParse(capture.meta);
  if (!parsedCapture.success) {
    throw new ServiceError(
      "INVALID_CAPTURE",
      409,
      "Capture data is no longer readable",
    );
  }

  const resolutionMessages = await prisma.questionAiMessage.findMany({
    where: {
      questionId: capture.questionId,
      kind: {
        in: [QuestionAiMessageKind.APPLY, QuestionAiMessageKind.DISCARD],
      },
    },
    select: { meta: true },
  });
  const previousResolution = resolutionMessages
    .map((message) =>
      ExperienceCaptureResolutionMetaSchema.safeParse(message.meta),
    )
    .find(
      (result) =>
        result.success && result.data.captureId === input.captureId,
    );

  if (previousResolution?.success) {
    return {
      status: "already_resolved" as const,
      action: previousResolution.data.action,
      appliedCount: 0,
    };
  }

  if (input.action.action === "dismiss") {
    await prisma.questionAiMessage.create({
      data: {
        questionId: capture.questionId,
        role: QuestionAiMessageRole.USER,
        kind: QuestionAiMessageKind.DISCARD,
        content: "경험 브릭 후보를 제외했습니다.",
        meta: buildResolutionMeta({
          captureId: input.captureId,
          action: "dismiss",
          selectedPreviewIds: [],
        }),
      },
    });
    return {
      status: "dismissed" as const,
      action: "dismiss" as const,
      appliedCount: 0,
    };
  }

  const selectedPreviewIds = new Set(input.action.selectedPreviewIds);
  const selectedItems = parsedCapture.data.items.filter((item) =>
    selectedPreviewIds.has(item.previewId),
  );
  if (selectedItems.length !== selectedPreviewIds.size) {
    throw new ServiceError(
      "INVALID_CAPTURE_SELECTION",
      400,
      "One or more capture candidates are invalid",
    );
  }

  const applied = await applyResumeQuestionBrickPreview({
    applicationId: input.applicationId,
    questionId: capture.questionId,
    userId: input.userId,
    teamId: input.teamId,
    items: selectedItems,
  });
  await prisma.questionAiMessage.create({
    data: {
      questionId: capture.questionId,
      role: QuestionAiMessageRole.USER,
      kind: QuestionAiMessageKind.APPLY,
      content: `${applied.appliedCount}개의 경험 브릭 후보를 반영했습니다.`,
      meta: buildResolutionMeta({
        captureId: input.captureId,
        action: "apply",
        selectedPreviewIds: input.action.selectedPreviewIds,
      }),
    },
  });

  return {
    status: "applied" as const,
    action: "apply" as const,
    appliedCount: applied.appliedCount,
    summary: applied.summary,
    questionBricks: applied.questionBricks,
  };
}
