import { prisma } from "@/lib/prisma";
import { SignalSource } from "@prisma/client";
import { getOrCreateTeamGuide } from "@/lib/styleCompiler";
import { ServiceError } from "@/lib/errors";

type Vote = "LIKE" | "DISLIKE";

async function createFeedbackSignal(opts: {
  articleId: string;
  teamId: string;
  feedbackId: string;
  vote: Vote;
  comment?: string | null;
}) {
  const { articleId, teamId, feedbackId, vote, comment } = opts;

  const guide = await getOrCreateTeamGuide(teamId);
  if (!guide) return;

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { type: true, status: true },
  });

  await prisma.styleSignal.create({
    data: {
      guideId: guide.id,
      articleId,
      source: "FEEDBACK" as SignalSource,
      weight: vote === "LIKE" ? 1.0 : -1.0,
      payload: {
        kind: "feedback_vote",
        feedbackId,
        vote,
        hasComment: !!(comment && comment.trim()),
        commentSnippet: comment ? comment.slice(0, 120) : null,
        articleType: article?.type ?? null,
        articleStatus: article?.status ?? null,
      },
    },
  });
}

export async function listFeedback(input: {
  articleId: string;
  currentUserId: string;
  mineOnly?: boolean;
  excludeMine?: boolean;
  limit?: number;
  cursor?: string | null;
}) {
  const limit = Math.min(input.limit ?? 20, 50);

  const whereBase: any = { articleId: input.articleId };
  if (input.mineOnly && input.currentUserId) {
    whereBase.userId = input.currentUserId;
  }
  if (input.excludeMine && input.currentUserId) {
    whereBase.NOT = { userId: input.currentUserId };
  }

  const items = await prisma.feedback.findMany({
    where: whereBase,
    include: {
      user: { select: { id: true, label: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(input.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
  });

  let nextCursor: string | null = null;
  if (items.length > limit) {
    nextCursor = items[limit].id;
    items.pop();
  }

  return {
    items: items.map((f) => ({
      id: f.id,
      vote: f.vote,
      comment: f.comment,
      createdAt: f.createdAt,
      userLabel: f.user?.label ?? "팀원",
    })),
    nextCursor,
  };
}

export async function createFeedback(input: {
  currentUserId: string;
  articleId: string;
  vote: Vote;
  comment?: string | null;
}) {
  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: { id: true, teamId: true, status: true },
  });
  if (!article) {
    throw new ServiceError("NOT_FOUND", 404, "문서를 찾을 수 없습니다.");
  }

  if (article.status !== "FINAL") {
    throw new ServiceError(
      "INVALID_STATUS",
      409,
      "피드백은 최종본에서만 제출할 수 있습니다."
    );
  }

  const existing = await prisma.feedback.findFirst({
    where: { articleId: input.articleId, userId: input.currentUserId },
    select: { id: true },
  });
  if (existing) {
    throw new ServiceError(
      "FEEDBACK_ALREADY_EXISTS",
      409,
      "이미 피드백을 남기셨습니다."
    );
  }

  const fb = await prisma.feedback.create({
    data: {
      articleId: input.articleId,
      teamId: article.teamId!,
      userId: input.currentUserId,
      vote: input.vote,
      comment: input.comment?.trim() || null,
    },
    select: { id: true, teamId: true },
  });

  await createFeedbackSignal({
    articleId: input.articleId,
    teamId: fb.teamId,
    feedbackId: fb.id,
    vote: input.vote,
    comment: input.comment,
  });

  return fb;
}

export async function updateFeedback(input: {
  currentUserId: string;
  articleId: string;
  vote: Vote;
  comment?: string | null;
}) {
  const prev = await prisma.feedback.findFirst({
    where: { articleId: input.articleId, userId: input.currentUserId },
    select: { id: true, teamId: true },
  });
  if (!prev) {
    throw new ServiceError("NOT_FOUND", 404, "수정할 피드백이 없습니다.");
  }

  const updated = await prisma.feedback.update({
    where: { id: prev.id },
    data: {
      vote: input.vote,
      comment: typeof input.comment === "string" ? input.comment : null,
    },
    select: {
      id: true,
      vote: true,
      comment: true,
      createdAt: true,
      teamId: true,
    },
  });

  await createFeedbackSignal({
    articleId: input.articleId,
    teamId: updated.teamId,
    feedbackId: updated.id,
    vote: input.vote,
    comment: updated.comment ?? undefined,
  });

  return updated;
}
