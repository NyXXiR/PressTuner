import { prisma } from "@/lib/prisma";
import { ArticleStatus, ReviewAssignmentStatus } from "@prisma/client";
import { ServiceError } from "@/lib/errors";

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

  const result = await prisma.$transaction(async (tx) => {
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

      let nextArticleStatus: ArticleStatus | null = null;
      if (dismissedCount > 0) {
        nextArticleStatus = ArticleStatus.DECLINED;
      } else if (changesCount > 0) {
        nextArticleStatus = ArticleStatus.DRAFT;
      } else if (approvedCount > 0) {
        nextArticleStatus = ArticleStatus.IN_PROGRESS;
      }

      if (nextArticleStatus) {
        await tx.article.update({
          where: { id: assignment.articleId },
          data: { status: nextArticleStatus },
        });
      }
    }

    return updated;
  });

  return result;
}
