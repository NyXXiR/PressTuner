import {
  ArticleUsageType,
  MembershipStatus,
  PlanType,
  Prisma,
} from "@prisma/client";

import {
  BILLING_PLANS,
  hasUnlimitedPressUsage,
  type BillingPlan,
  isPlanId,
  type QuotaPeriod,
} from "@/config/billing/plans";
import { PRESS_PRODUCT } from "@/domain/products/press/policy";
import { consumeAiQuota, type AiQuotaAction } from "@/domain/quota/aiQuota";
import { getEffectiveProductSubscription } from "@/domain/billing/productSubscription";
import { prisma } from "@/lib/prisma";
import { formatISO } from "@/lib/utils/datetime";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type PressSubscriptionSnapshot = {
  id: string;
  planId: string | null;
  plan: PlanType;
  membershipStatus: MembershipStatus;
  planExpiresAt: Date | null;
};

export type ArticleUsageSummary = {
  plan: {
    effectivePlanType: PlanType;
    effectivePlanId: string | null;
    effectivePlanName: string;
    perBrief: number;
    perPolish: number;
    membershipStatus: MembershipStatus;
    planExpiresAt: string | null;
    isSubscriptionActive: boolean;
    unlimited: boolean;
  };
  article: {
    unlimited: boolean;
    briefUsed: number;
    briefLimit: number;
    briefRemaining: number;
    polishUsed: number;
    polishLimit: number;
    polishRemaining: number;
    lastBriefAt: string | null;
    lastPolishAt: string | null;
  };
};

export type UsagePayload = {
  plan: {
    planId: string | null;
    plan: PlanType;
    membershipStatus: MembershipStatus;
    planExpiresAt: Date | null;
  };
  limits: { briefLimit: number; polishLimit: number; unlimited: boolean };
  used: { briefUsed: number; polishUsed: number };
  remaining: { briefRemaining: number; polishRemaining: number };
  lastAt: { lastBriefAt: Date | null; lastPolishAt: Date | null };
};

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
  } catch {
    return {} as Prisma.InputJsonValue;
  }
}

export function resolveArticleLimits(subscription: PressSubscriptionSnapshot): {
  briefLimit: number;
  polishLimit: number;
  quotaLimit: number;
  quotaPeriod: QuotaPeriod;
  unlimited: boolean;
} {
  const freePlan = BILLING_PLANS.free_v1;
  const expired = subscription.planExpiresAt
    ? new Date() >= subscription.planExpiresAt
    : false;
  if (subscription.membershipStatus !== "ACTIVE" || expired) {
    return {
      briefLimit: 0,
      polishLimit: 0,
      quotaLimit: 0,
      quotaPeriod: "MONTHLY",
      unlimited: false,
    };
  }

  let config: BillingPlan | undefined;
  if (subscription.planId && isPlanId(subscription.planId)) {
    config = BILLING_PLANS[subscription.planId];
  } else {
    config = Object.values(BILLING_PLANS).find(
      (plan) => plan.planType === subscription.plan,
    );
  }
  const activeConfig = config ?? freePlan;
  return {
    briefLimit: activeConfig.perBrief,
    polishLimit: activeConfig.perPolish,
    quotaLimit: activeConfig.quotaArticleGenerates,
    quotaPeriod: activeConfig.quotaPeriod,
    unlimited: hasUnlimitedPressUsage(activeConfig),
  };
}

export function resolvePressRewriteLimit(
  subscription: PressSubscriptionSnapshot,
  defaultLimit: number,
) {
  return resolveArticleLimits(subscription).unlimited ? null : defaultLimit;
}

export function buildArticleUsageSummary(args: {
  subscription: PressSubscriptionSnapshot;
  limits: { briefLimit: number; polishLimit: number; unlimited: boolean };
  stat: {
    briefUsed: number;
    polishUsed: number;
    lastBriefAt: Date | null;
    lastPolishAt: Date | null;
  };
}): ArticleUsageSummary {
  const { subscription, limits, stat } = args;
  const effectivePlan =
    subscription.planId && isPlanId(subscription.planId)
      ? BILLING_PLANS[subscription.planId]
      : (Object.values(BILLING_PLANS).find(
          (plan) => plan.planType === subscription.plan,
        ) ?? null);
  const expired = subscription.planExpiresAt
    ? new Date() >= subscription.planExpiresAt
    : false;

  return {
    plan: {
      effectivePlanType: subscription.plan,
      effectivePlanId: subscription.planId,
      effectivePlanName: effectivePlan?.name ?? String(subscription.plan),
      perBrief: effectivePlan?.perBrief ?? 0,
      perPolish: effectivePlan?.perPolish ?? 0,
      membershipStatus: subscription.membershipStatus,
      planExpiresAt: subscription.planExpiresAt
        ? formatISO(subscription.planExpiresAt)
        : null,
      isSubscriptionActive:
        subscription.membershipStatus === "ACTIVE" &&
        !expired &&
        subscription.plan !== "FREE",
      unlimited: hasUnlimitedPressUsage(effectivePlan ?? BILLING_PLANS.free_v1),
    },
    article: {
      unlimited: hasUnlimitedPressUsage(effectivePlan ?? BILLING_PLANS.free_v1),
      briefUsed: stat.briefUsed,
      briefLimit: limits.briefLimit,
      briefRemaining: Math.max(0, limits.briefLimit - stat.briefUsed),
      polishUsed: stat.polishUsed,
      polishLimit: limits.polishLimit,
      polishRemaining: Math.max(0, limits.polishLimit - stat.polishUsed),
      lastBriefAt: stat.lastBriefAt ? formatISO(stat.lastBriefAt) : null,
      lastPolishAt: stat.lastPolishAt ? formatISO(stat.lastPolishAt) : null,
    },
  };
}

async function getOrCreateUsageStat(
  tx: Prisma.TransactionClient,
  articleId: string,
) {
  return tx.articleUsageStat.upsert({
    where: { articleId },
    create: { articleId },
    update: {},
    select: {
      briefUsed: true,
      polishUsed: true,
      lastBriefAt: true,
      lastPolishAt: true,
    },
  });
}

export async function getOrCreateArticleUsageStat(articleId: string) {
  const select = {
    briefUsed: true,
    polishUsed: true,
    lastBriefAt: true,
    lastPolishAt: true,
  } as const;
  const found = await prisma.articleUsageStat.findUnique({
    where: { articleId },
    select,
  });
  if (found) return found;
  try {
    return await prisma.articleUsageStat.create({ data: { articleId }, select });
  } catch (error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
    return prisma.articleUsageStat.findUniqueOrThrow({
      where: { articleId },
      select,
    });
  }
}

export async function requirePressSubscription(
  teamId: string,
  db: DbClient = prisma,
): Promise<PressSubscriptionSnapshot> {
  const subscription = await getEffectiveProductSubscription(
    teamId,
    PRESS_PRODUCT,
    db,
  );
  return { id: subscription.teamId, ...subscription };
}

export async function consumeArticleUsageOrThrow(
  tx: Prisma.TransactionClient,
  args: {
    subscription: PressSubscriptionSnapshot;
    articleId: string;
    userId: string;
    type: ArticleUsageType;
    meta?: Record<string, unknown>;
  },
): Promise<ArticleUsageSummary> {
  const { subscription, articleId, userId, type, meta } = args;
  const limits = resolveArticleLimits(subscription);

  const quotaAction: AiQuotaAction | null =
    type === ArticleUsageType.BRIEF
      ? "press_brief_normalize"
      : type === ArticleUsageType.POLISH
        ? "press_review"
        : type === ArticleUsageType.GENERATE
          ? "press_draft_generate"
          : null;
  if (quotaAction) {
    await consumeAiQuota({
      client: tx,
      teamId: subscription.id,
      userId,
      targetId: articleId,
      action: quotaAction,
      meta: { ...(meta ?? {}), articleUsageTelemetryType: type },
    });
  }

  const now = new Date();
  if (type === ArticleUsageType.BRIEF) {
    await tx.articleUsageStat.update({
      where: { articleId },
      data: { briefUsed: { increment: 1 }, lastBriefAt: now },
    });
  } else if (type === ArticleUsageType.POLISH) {
    await tx.articleUsageStat.update({
      where: { articleId },
      data: { polishUsed: { increment: 1 }, lastPolishAt: now },
    });
  }
  await tx.articleUsageEvent.create({
    data: {
      articleId,
      teamId: subscription.id,
      userId,
      type,
      meta: toPrismaJson(meta ?? {}),
    },
  });
  const statAfter = await getOrCreateUsageStat(tx, articleId);
  return buildArticleUsageSummary({ subscription, limits, stat: statAfter });
}
