import { prisma } from "@/lib/prisma";
import { ReviewAssignmentStatus } from "@prisma/client";
import { ServiceError } from "@/lib/errors";
import {
  projectArticleStatus,
  type PressApprovalState,
} from "@/domain/press/pressProcess";
import { withLockedPressProcess } from "@/lib/services/press/adapters/pressProcessPrismaAdapter";
import { requirePressTransition } from "@/domain/press/pressProcess";

type Action = "APPROVE" | "CHANGES_REQUESTED" | "DISMISS" | "CANCEL";

export async function processReviewAction(input: {
  assignmentId: string;
  userId: string;
  action: Action;
}) {
  const assignment = await prisma.articleReviewAssignment.findUnique({
    where: { id: input.assignmentId },
    select: {
      id: true,
      status: true,
      reviewerId: true,
      assignedById: true,
      articleId: true,
      article: { select: { status: true } },
    },
  });

  if (!assignment) {
    throw new ServiceError("NOT_FOUND", 404, "요청을 찾을 수 없습니다.");
  }

  if (assignment.status !== ReviewAssignmentStatus.PENDING) {
    throw new ServiceError("INVALID_STATUS", 409, "이미 처리된 요청입니다.");
  }

  const isReviewer = assignment.reviewerId === input.userId;
  const isRequester = assignment.assignedById === input.userId;

  if (input.action === "CANCEL") {
    if (!isRequester) {
      throw new ServiceError("FORBIDDEN", 403, "요청을 회수할 권한이 없습니다.");
    }
  } else if (!isReviewer) {
    throw new ServiceError("FORBIDDEN", 403, "검토 권한이 없습니다.");
  }

  const nextStatus =
    input.action === "APPROVE"
      ? ReviewAssignmentStatus.APPROVED
      : input.action === "CHANGES_REQUESTED"
        ? ReviewAssignmentStatus.CHANGES_REQUESTED
        : ReviewAssignmentStatus.DISMISSED;

  const result = await withLockedPressProcess(
    { articleId: assignment.articleId },
    async ({ tx, snapshot: processSnapshot }) => {
    const freshAssignment = await tx.articleReviewAssignment.findUnique({
      where: { id: input.assignmentId },
      select: { id: true, status: true, reviewerId: true, assignedById: true, articleId: true },
    });
    if (!freshAssignment) {
      throw new ServiceError("NOT_FOUND", 404, "요청을 찾을 수 없습니다.");
    }
    if (freshAssignment.status !== ReviewAssignmentStatus.PENDING) {
      throw new ServiceError("INVALID_STATUS", 409, "이미 처리된 요청입니다.");
    }
    const freshIsReviewer = freshAssignment.reviewerId === input.userId;
    const freshIsRequester = freshAssignment.assignedById === input.userId;
    if (input.action === "CANCEL" ? !freshIsRequester : !freshIsReviewer) {
      throw new ServiceError("FORBIDDEN", 403, input.action === "CANCEL" ? "요청을 회수할 권한이 없습니다." : "검토 권한이 없습니다.");
    }
    requirePressTransition(processSnapshot.state, {
      type: "REVIEW_ASSIGNMENTS_CHANGED",
    });

    const updated = await tx.articleReviewAssignment.update({
      where: { id: input.assignmentId },
      data: {
        status: nextStatus,
        decidedAt: new Date(),
      },
      select: { id: true, status: true, articleId: true },
    });

    const remaining = await tx.articleReviewAssignment.count({
      where: {
        articleId: assignment.articleId,
        status: ReviewAssignmentStatus.PENDING,
      },
    });

    if (remaining === 0) {
      const [dismissedCount, changesCount, approvedCount] = await Promise.all([
        tx.articleReviewAssignment.count({
          where: {
            articleId: assignment.articleId,
            status: ReviewAssignmentStatus.DISMISSED,
          },
        }),
        tx.articleReviewAssignment.count({
          where: {
            articleId: assignment.articleId,
            status: ReviewAssignmentStatus.CHANGES_REQUESTED,
          },
        }),
        tx.articleReviewAssignment.count({
          where: {
            articleId: assignment.articleId,
            status: ReviewAssignmentStatus.APPROVED,
          },
        }),
      ]);

      let outcome: PressApprovalState | null = null;
      if (dismissedCount > 0) {
        outcome = "DISMISSED";
      } else if (changesCount > 0) {
        outcome = "CHANGES_REQUESTED";
      } else if (approvedCount > 0) {
        outcome = "APPROVED";
      }

      if (outcome) {
        const processState = requirePressTransition(processSnapshot.state, {
          type: "RECORD_APPROVAL",
          outcome,
        });
        await tx.article.update({
          where: { id: assignment.articleId },
          data: { status: projectArticleStatus(processState) },
        });
      }
    }

    return updated;
    },
  );

  return result;
}
