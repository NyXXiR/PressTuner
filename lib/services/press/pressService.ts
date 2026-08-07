import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import {
  generateFromBriefUseCase,
  initArticleDraftUseCase,
  saveDraftUseCase,
} from "@/lib/services/article/generationUseCases";
import { getUsageSummaryUseCase } from "@/lib/services/article/usageUseCases";
import { getUsageSummaryForTeam } from "@/lib/services/usageService";
import { consumeAiQuota } from "@/domain/quota/aiQuota";
import { finalizeVerifiedArticle } from "@/lib/services/article/articleFinalizationService";
import { type ArticleType } from "@prisma/client";
import { serviceError } from "@/lib/services/serviceError";
import { normalizeEditedPlainForPersistence } from "@/domain/article/articleCanonicalContent";
import type { PressAiDependencyOverrides } from "@/lib/services/article/pressAiDependencies";

async function getArticleAccessForTeamEdit(
  articleId: string,
  userId: string,
  type: "EDIT" | "FINALIZE"
) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      teamId: true,
      userId: true,
      type: true,
      title: true,
      bodyJson: true,
      status: true,
      updatedAt: true,
      pressExtra: { select: { lead: true, fact: true } },
    },
  });

  if (!article) {
    throw serviceError(404, "NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  if (article.teamId) {
    const membership = await prisma.teamMember.findFirst({
      where: { teamId: article.teamId, userId },
      select: {
        role: true,
        team: { select: { allowMemberEdit: true, allowMemberFinalize: true } },
      },
    });
    if (!membership) {
      throw serviceError(
        403,
        "FORBIDDEN",
        type === "EDIT" ? "수정 권한이 없습니다." : "권한이 없습니다."
      );
    }

    const allowMember =
      type === "EDIT"
        ? membership.team.allowMemberEdit
        : membership.team.allowMemberFinalize;

    if (!isAdmin(membership.role) && !allowMember) {
      throw serviceError(
        403,
        "FORBIDDEN",
        type === "EDIT" ? "수정 권한이 없습니다." : "권한이 없습니다."
      );
    }

    return { article, teamId: article.teamId };
  }

  if (article.userId !== userId) {
    throw serviceError(
      403,
      "FORBIDDEN",
      type === "EDIT" ? "수정 권한이 없습니다." : "권한이 없습니다."
    );
  }

  return { article, teamId: null };
}

export async function assertPressArticleEditAccess(input: {
  articleId: string;
  teamId: string;
  userId: string;
}) {
  const access = await getArticleAccessForTeamEdit(
    input.articleId,
    input.userId,
    "EDIT",
  );
  if (access.teamId !== input.teamId) {
    throw serviceError(403, "FORBIDDEN", "수정 권한이 없습니다.");
  }
  return access.article;
}

export async function initArticleDraft(input: {
  teamId: string;
  userId: string;
  type: ArticleType;
}) {
  return initArticleDraftUseCase({
    teamId: input.teamId,
    userId: input.userId,
    type: input.type,
  });
}

export function normalizePlainDraftForPersistence(plain: string) {
  return normalizeEditedPlainForPersistence(plain);
}

export function canGeneratePressArticleWithUsage(usage: {
  unlimited?: boolean;
  remaining: number;
}) {
  return usage.unlimited === true || usage.remaining > 0;
}

export async function saveArticleDraft(input: {
  teamId: string;
  userId: string;
  articleId: string;
  expectedUpdatedAt?: Date;
  title?: string;
  lead?: string | null;
  paragraphs: Array<{ text: string; importance?: number }>;
  closing?: string;
  plain?: string;
  harnessAction?: {
    type: "apply_pending_rewrite";
    appliedAt?: string;
  };
}) {
  const normalizedPlain =
    input.plain !== undefined
      ? normalizePlainDraftForPersistence(input.plain)
      : null;
  let paragraphsToSave = input.paragraphs ?? [];
  if (normalizedPlain) {
    paragraphsToSave = normalizedPlain.paragraphs;
  }

  return saveDraftUseCase({
    teamId: input.teamId,
    userId: input.userId,
    articleId: input.articleId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    patch: {
      title: input.title,
      pressExtra:
        normalizedPlain
          ? {
              lead: normalizedPlain.lead,
              fact: normalizedPlain.fact,
            }
          : input.lead != null
          ? {
              lead: input.lead,
            }
          : undefined,
      bodyJson: {
        paragraphs: paragraphsToSave,
        closing: normalizedPlain?.closing ?? input.closing ?? "",
      },
      harnessAction: input.harnessAction,
    },
  });
}

export async function generateArticleFromBrief(input: {
  teamId: string;
  userId: string;
  articleId: string;
  body: {
    serviceName?: string;
    announceType: string;
    oneLiner?: string;
    points: string[];
    quoteMessage?: string;
    quoteWho?: string;
    tone: "formal" | "neutral" | "friendly";
    rawText?: string;
    eventAt?: string;
    publishAt?: string;
  };
  dependencies?: PressAiDependencyOverrides;
}) {
  const article = await prisma.article.findFirst({
    where: { id: input.articleId, teamId: input.teamId },
    select: { id: true },
  });
  if (!article) {
    throw serviceError(404, "NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  const currentUsage = await getUsageSummaryForTeam(input.teamId);
  if (!canGeneratePressArticleWithUsage(currentUsage.article)) {
    throw serviceError(403, "USAGE_LIMIT_EXCEEDED", "보도자료 생성 가능한 횟수를 모두 사용했습니다.", {
      usage: currentUsage,
    });
  }

  await prisma.$transaction(async (tx) => {
    await consumeAiQuota({
      teamId: input.teamId,
      userId: input.userId,
      targetId: input.articleId,
      action: "press_draft_generate",
      client: tx,
    });
  });

  const result = await generateFromBriefUseCase({
    teamId: input.teamId,
    userId: input.userId,
    articleId: input.articleId,
    serviceName: input.body.serviceName,
    announceType: input.body.announceType,
    oneLiner: input.body.oneLiner,
    points: input.body.points,
    quoteMessage: input.body.quoteMessage,
    quoteWho: input.body.quoteWho,
    tone: input.body.tone,
    rawText: input.body.rawText,
    eventAt: input.body.eventAt,
    publishAt: input.body.publishAt,
    dependencies: input.dependencies,
  });

  const usage = await getUsageSummaryUseCase(input.teamId, input.articleId);

  const { articleId: resultArticleId, ...rest } = result as any;
  const finalArticleId = (resultArticleId ?? input.articleId) as string;

  return {
    id: finalArticleId,
    articleId: finalArticleId,
    ...rest,
    usage,
  };
}

export async function savePressArticle(input: {
  userId: string;
  articleId: string;
  title?: string;
  lead?: string;
  fact?: string;
  paragraphs?: Array<{ text?: string; importance?: number }>;
  closing?: string;
  signals?: unknown[];
}) {
  const { article } = await getArticleAccessForTeamEdit(
    input.articleId,
    input.userId,
    "EDIT"
  );

  await prisma.$transaction(async (tx) => {
    await tx.article.update({
      where: { id: article.id },
      data: {
        title: typeof input.title === "string" ? input.title : undefined,
        bodyJson:
          Array.isArray(input.paragraphs) || typeof input.closing === "string"
            ? {
                ...(Array.isArray(input.paragraphs)
                  ? { paragraphs: input.paragraphs }
                  : {}),
                ...(typeof input.closing === "string"
                  ? { closing: input.closing }
                  : {}),
              }
            : undefined,
      },
    });

    if (
      article.type === "PRESS_RELEASE" &&
      (typeof input.lead === "string" || typeof input.fact === "string")
    ) {
      await tx.pressExtra.upsert({
        where: { articleId: article.id },
        create: {
          articleId: article.id,
          lead: typeof input.lead === "string" ? input.lead : null,
          fact: typeof input.fact === "string" ? input.fact : null,
        },
        update: {
          lead: typeof input.lead === "string" ? input.lead : undefined,
          fact: typeof input.fact === "string" ? input.fact : undefined,
        },
      });
    }
  });

  return { ok: true, articleId: input.articleId, insertedSignals: 0 };
}

export async function finalizePressArticle(input: {
  userId: string;
  articleId: string;
}) {
  const { article, teamId } = await getArticleAccessForTeamEdit(
    input.articleId,
    input.userId,
    "FINALIZE"
  );

  return finalizeVerifiedArticle({ articleId: article.id, teamId });
}

export { serviceError };
