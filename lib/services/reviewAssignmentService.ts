import { prisma } from "@/lib/prisma";
import { ArticleStatus, ArticleType, ReviewAssignmentStatus } from "@prisma/client";
import { serviceError } from "@/lib/services/serviceError";
import {
  projectArticleStatus,
} from "@/domain/press/pressProcess";
import { withLockedPressProcess } from "@/lib/services/press/adapters/pressProcessPrismaAdapter";
import { requirePressTransition } from "@/domain/press/pressProcess";

export async function listReviewAssignmentsForUser(input: {
  userId: string;
  mode: "received" | "sent";
  q?: string;
  type?: (keyof typeof ArticleType)[];
  reviewStatus?: (keyof typeof ReviewAssignmentStatus)[];
  page: number;
  pageSize: number;
}) {
  const statusFilter =
    input.reviewStatus && input.reviewStatus.length > 0
      ? { in: input.reviewStatus.map((s) => ReviewAssignmentStatus[s]) }
      : input.mode === "received"
        ? ReviewAssignmentStatus.PENDING
        : { in: Object.values(ReviewAssignmentStatus) };

  const where: any = {
    status: statusFilter,
    ...(input.mode === "sent"
      ? { assignedById: input.userId }
      : { reviewerId: input.userId }),
    article: input.mode === "received" ? { status: ArticleStatus.IN_PROGRESS } : {},
  };

  if (input.q) {
    where.article = {
      ...(where.article ?? {}),
      title: { contains: input.q },
    };
  }
  if (input.type && input.type.length > 0) {
    where.article = {
      ...(where.article ?? {}),
      type: { in: input.type.map((t) => ArticleType[t]) },
    };
  }

  const [total, items] = await Promise.all([
    prisma.articleReviewAssignment.count({ where }),
    prisma.articleReviewAssignment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
      select: {
        id: true,
        status: true,
        note: true,
        decidedAt: true,
        createdAt: true,
        reviewer: { select: { id: true, label: true, email: true } },
        assignedBy: { select: { id: true, label: true } },
        article: {
          select: {
            id: true,
            title: true,
            status: true,
            type: true,
            teamId: true,
            updatedAt: true,
            createdAt: true,
            team: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  return {
    total,
    items: items.map((it) => ({
      id: it.id,
      articleId: it.article.id,
      title: it.article.title,
      articleStatus: it.article.status,
      type: it.article.type,
      teamId: it.article.teamId,
      teamName: it.article.team?.name ?? null,
      updatedAt: it.article.updatedAt,
      createdAt: it.article.createdAt,
      assignmentStatus: it.status,
      assignedAt: it.createdAt,
      decidedAt: it.decidedAt,
      note: it.note,
      reviewer: it.reviewer,
      requester: it.assignedBy,
    })),
  };
}

export async function listArticleReviewers(input: {
  teamId: string;
  articleId: string;
}) {
  const article = await prisma.article.findFirst({
    where: { id: input.articleId, teamId: input.teamId },
    select: { id: true },
  });

  if (!article) {
    throw serviceError(404, "NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  const assignments = await prisma.articleReviewAssignment.findMany({
    where: { articleId: input.articleId, teamId: input.teamId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      note: true,
      decidedAt: true,
      createdAt: true,
      reviewer: { select: { id: true, label: true, email: true } },
      assignedBy: { select: { id: true, label: true } },
    },
  });

  return assignments;
}

export async function assignReviewers(input: {
  teamId: string;
  articleId: string;
  requesterId: string;
  reviewerIds: string[];
  note?: string;
}) {
  if (!input.reviewerIds || input.reviewerIds.length === 0) {
    throw serviceError(400, "MISSING_REVIEWER_IDS", "reviewerIds가 필요합니다.");
  }

  const article = await prisma.article.findFirst({
    where: { id: input.articleId, teamId: input.teamId },
    select: { id: true, status: true },
  });

  if (!article) {
    throw serviceError(404, "NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  const members = await prisma.teamMember.findMany({
    where: { teamId: input.teamId, userId: { in: input.reviewerIds } },
    select: { userId: true },
  });

  const memberSet = new Set(members.map((m) => m.userId));
  const validReviewerIds = input.reviewerIds.filter((rid) => memberSet.has(rid));

  if (validReviewerIds.length === 0) {
    throw serviceError(
      400,
      "INVALID_REVIEWERS",
      "유효한 팀 멤버 reviewerIds가 없습니다."
    );
  }

  await withLockedPressProcess(
    { articleId: input.articleId, teamId: input.teamId },
    async ({ tx, snapshot }) => {
    const processState = requirePressTransition(snapshot.state, {
      type: "REQUEST_APPROVAL",
    });

    await tx.articleReviewAssignment.createMany({
      data: validReviewerIds.map((rid) => ({
        articleId: input.articleId,
        teamId: input.teamId,
        reviewerId: rid,
        assignedById: input.requesterId,
        status: ReviewAssignmentStatus.PENDING,
        note: input.note ?? null,
      })),
      skipDuplicates: true,
    });

    await tx.article.update({
      where: { id: input.articleId },
      data: { status: projectArticleStatus(processState) },
    });
    },
  );
}

export async function removeReviewer(input: {
  teamId: string;
  articleId: string;
  reviewerId: string;
}) {
  if (!input.reviewerId) {
    throw serviceError(400, "MISSING_REVIEWER_ID", "reviewerId가 필요합니다.");
  }

  await withLockedPressProcess(
    { articleId: input.articleId, teamId: input.teamId },
    async ({ tx, snapshot }) => {
    requirePressTransition(snapshot.state, {
      type: "REVIEW_ASSIGNMENTS_CHANGED",
    });
    await tx.articleReviewAssignment.deleteMany({
      where: {
        articleId: input.articleId,
        teamId: input.teamId,
        reviewerId: input.reviewerId,
      },
    });
    },
  );
}
