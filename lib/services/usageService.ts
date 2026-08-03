import { prisma } from "@/lib/prisma";
import { getEffectiveProductSubscription } from "@/domain/billing/productSubscription";
import {
  MembershipStatus,
  PlanType,
  PlanCategory,
  Prisma,
  UsageAction,
  ArticleUsageType,
} from "@prisma/client";
import {
  BILLING_PLANS,
  isPlanId,
  getPlan,
  hasUnlimitedPressUsage,
  type BillingPlan,
  type PlanId,
  type QuotaPeriod,
} from "@/config/billing/plans";
import {
  consumeAiQuota,
  getAiQuotaActionDefinition,
  getAiQuotaStateForSurface,
  type AiQuotaAction,
} from "@/domain/quota/aiQuota";
import {
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  subMonths,
} from "date-fns";

// ------------------------------------------------------------------
// [Error Handling]
// ------------------------------------------------------------------

export { QuotaLimitError } from "@/domain/quota/errors";

export class ArticleUsageLimitError extends Error {
  code = "ARTICLE_USAGE_LIMIT" as const;
  constructor(message: string) {
    super(message);
    this.name = "ArticleUsageLimitError";
  }
}

// ------------------------------------------------------------------
// [Configuration & Helpers]
// ------------------------------------------------------------------

const FREE_FALLBACK: BillingPlan = BILLING_PLANS["free_v1"];

/**
 * 팀 정보를 기반으로 정적 플랜 설정(Config)을 가져옵니다.
 */
function resolvePlan(team: {
  plan: PlanType;
  planId: string | null;
}): BillingPlan {
  if (team.planId && isPlanId(team.planId)) {
    return getPlan(team.planId as PlanId);
  }
  const hit = Object.values(BILLING_PLANS).find(
    (p) => p.planType === team.plan
  );
  return hit ?? FREE_FALLBACK;
}

/**
 * 구독 유효성 판단 (UI 표시용)
 * 실제 차감 여부는 DB의 Limit/Usage 컬럼 값에 의존하지만,
 * 만료된 멤버십인 경우 UI에서 미리 차단을 안내하기 위해 사용합니다.
 */
function isSubscriptionActive(
  team: {
    plan: PlanType;
    membershipStatus: MembershipStatus;
    planExpiresAt: Date | null;
  },
  now = new Date()
): boolean {
  if (team.plan === "FREE") return true;
  if (team.membershipStatus === "EXPIRED") return false;

  // 만료일 체크
  if (team.planExpiresAt && now.getTime() >= team.planExpiresAt.getTime()) {
    return false;
  }

  // 해지(CANCELED) 상태여도 잔여 기간 동안은 사용 가능
  if (team.membershipStatus === "CANCELED") {
    return !!team.planExpiresAt && now.getTime() < team.planExpiresAt.getTime();
  }

  return true;
}

/**
 * 사용량 주기(Start~End) 계산 (UI 표시용)
 */
function getQuotaPeriodRange(
  plan: BillingPlan,
  team: { nextBillingAt: Date | null },
  now = new Date()
): { start: Date; end: Date } {
  if (plan.quotaPeriod === "DAILY") {
    return { start: startOfDay(now), end: endOfDay(now) };
  }
  // MONTHLY
  if (team.nextBillingAt) {
    const cycleEnd = team.nextBillingAt;
    const cycleStart = subMonths(cycleEnd, 1);
    return { start: cycleStart, end: cycleEnd };
  }
  // Fallback
  return { start: startOfMonth(now), end: endOfMonth(now) };
}

// ------------------------------------------------------------------
// [Public Types: Global Usage]
// ------------------------------------------------------------------

export type GlobalQuotaUsage = {
  unlimited?: boolean;
  limit: number;
  usage: number;
  remaining: number;
  resetAt?: string;
  resetLabel?: string;
  status?: "available" | "near_limit" | "limited";
};

export type UsageSummary = {
  effectivePlanType: PlanType;
  effectivePlanId: string | null;
  effectivePlanName: string;
  planCategory: PlanCategory;

  membershipStatus: MembershipStatus;
  planExpiresAt: Date | null;
  isSubscriptionActive: boolean;

  // ✅ [확장] 보도자료(Article)와 자소서(Resume) 사용량 정보
  article: GlobalQuotaUsage;
  resume: GlobalQuotaUsage;

  quotaPeriod: QuotaPeriod | "ROLLING";
  periodStart: Date;
  periodEnd: Date;
  subscriptions: {
    PRESS: ProductSubscriptionUsageSummary;
    CAREER: ProductSubscriptionUsageSummary;
  };
};

type ProductSubscriptionUsageSummary = {
  planId: string | null;
  plan: PlanType;
  membershipStatus: MembershipStatus;
  planExpiresAt: Date | null;
  nextBillingAt: Date | null;
  isSubscriptionActive: boolean;
};

// ------------------------------------------------------------------
// [Public Methods: Global Usage (Snapshot Based)]
// ------------------------------------------------------------------

/**
 * [UI용] 팀의 현재 사용량 현황을 조회합니다.
 * DB의 스냅샷 필드(usage/limit)를 직접 반환하므로 가장 정확합니다.
 */
export async function getUsageSummaryForTeam(
  teamId: string
): Promise<UsageSummary> {
  const [press, career, articleQuota, resumeQuota] = await Promise.all([
    getEffectiveProductSubscription(teamId, "PRESS"),
    getEffectiveProductSubscription(teamId, "CAREER"),
    getAiQuotaStateForSurface({ teamId, surface: "PRESS" }),
    getAiQuotaStateForSurface({ teamId, surface: "RESUME" }),
  ]);

  const active = isSubscriptionActive(press);
  const careerActive = isSubscriptionActive(career);
  const planConfig = resolvePlan({
    plan: active ? press.plan : "FREE",
    planId: active ? press.planId : null,
  });

  const { start, end } = getQuotaPeriodRange(planConfig, press);
  const rollingPeriodEnd = new Date(
    Math.min(
      new Date(articleQuota.periodEnd).getTime(),
      new Date(resumeQuota.periodEnd).getTime(),
    ),
  );

  return {
    effectivePlanType: active ? press.plan : "FREE",
    effectivePlanId: active ? press.planId : null,
    effectivePlanName: planConfig.name,
    planCategory: "PRESS",

    membershipStatus: press.membershipStatus,
    planExpiresAt: press.planExpiresAt,
    isSubscriptionActive: active,

    article: {
      unlimited: articleQuota.unlimited,
      limit: articleQuota.limitUnits,
      usage: articleQuota.usedUnits,
      remaining: articleQuota.remainingUnits,
      resetAt: articleQuota.periodEnd,
      resetLabel: articleQuota.resetLabel,
      status: articleQuota.status,
    },
    resume: {
      unlimited: resumeQuota.unlimited,
      limit: resumeQuota.limitUnits,
      usage: resumeQuota.usedUnits,
      remaining: resumeQuota.remainingUnits,
      resetAt: resumeQuota.periodEnd,
      resetLabel: resumeQuota.resetLabel,
      status: resumeQuota.status,
    },

    quotaPeriod: "ROLLING",
    periodStart: start,
    periodEnd: Number.isFinite(rollingPeriodEnd.getTime()) ? rollingPeriodEnd : end,
    subscriptions: {
      PRESS: { ...press, isSubscriptionActive: active },
      CAREER: { ...career, isSubscriptionActive: careerActive },
    },
  };
}

/**
 * ✅ [핵심] 글로벌 쿼터를 확인하고 차감(usage + amount)합니다.
 * - `type`에 따라 Article 또는 Resume 테이블 컬럼을 참조합니다.
 * - `tx` (Prisma Transaction) 내에서 실행되어야 안전합니다.
 * - 한도 초과 시 `QuotaLimitError`를 던져 트랜잭션을 롤백시킵니다.
 */
export async function verifyAndIncrementQuota(
  tx: Prisma.TransactionClient,
  params: {
    teamId: string;
    type: "ARTICLE" | "RESUME"; // ✅ Resume 타입 지원
    amount?: number;
    action?: AiQuotaAction;
    userId?: string | null;
    targetId?: string | null;
  }
) {
  const action =
    params.action ??
    (params.type === "ARTICLE" ? "press_draft_generate" : "resume_generate");
  const multiplier = Math.max(params.amount ?? 1, 1);
  const units = getAiQuotaActionDefinition(action).units * multiplier;

  await consumeAiQuota({
    client: tx,
    teamId: params.teamId,
    userId: params.userId,
    targetId: params.targetId,
    action,
    units,
    meta: {
      legacyType: params.type,
      multiplier,
    },
  });
}

/**
 * ✅ [편의 함수] 트랜잭션 관리 없이 단독으로 차감할 때 사용
 * (내부에서 자체 트랜잭션 생성)
 */
export async function consumeTeamQuota(params: {
  teamId: string;
  type: "ARTICLE" | "RESUME";
  amount?: number;
  action?: AiQuotaAction;
  userId?: string | null;
  targetId?: string | null;
}) {
  return await prisma.$transaction(async (tx) => {
    await verifyAndIncrementQuota(tx, params);
  });
}

/**
 * 로그 적재 (UsageLog 테이블)
 * - 메인 로직에 영향을 주지 않도록 try-catch로 감싸져 있습니다.
 */
export async function logUsage(params: {
  teamId: string;
  userId?: string;
  action: UsageAction;
  model: string;
  cost?: number;
  meta?: any;
}) {
  try {
    await prisma.usageLog.create({
      data: {
        teamId: params.teamId,
        userId: params.userId,
        action: params.action,
        model: params.model,
        cost: params.cost ?? 0,
        meta: params.meta ?? Prisma.JsonNull,
      },
    });
  } catch (e) {
    console.error("Usage Log Failed:", e);
  }
}

// ------------------------------------------------------------------
// [Public Methods: Per-Article Limits (Brief/Polish)]
// ------------------------------------------------------------------
// * 이 부분은 문서(Article) 내부의 브리프/윤문 제한 로직입니다. (Resume와 무관)

export type ArticleUsageSummary = {
  planLimits: {
    perBrief: number;
    perPolish: number;
    unlimited: boolean;
  };
  articleUsage: {
    briefUsed: number;
    briefRemaining: number;
    polishUsed: number;
    polishRemaining: number;
  };
};

/**
 * 특정 문서(Article) 내 기능 사용량 조회
 */
export async function getArticleUsageSummary(
  teamId: string,
  articleId: string
): Promise<ArticleUsageSummary> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      plan: true,
      planId: true,
      membershipStatus: true,
      planExpiresAt: true,
    },
  });

  if (!team) throw new Error("Team not found");

  const active = isSubscriptionActive(team);
  const planConfig = resolvePlan({
    plan: active ? team.plan : "FREE",
    planId: active ? team.planId : null,
  });

  // DB에서 사용 통계 조회 (없으면 생성)
  const stat = await prisma.articleUsageStat.upsert({
    where: { articleId },
    create: { articleId },
    update: {},
    select: {
      briefUsed: true,
      polishUsed: true,
    },
  });

  const briefLimit = Math.max(planConfig.perBrief ?? 0, 0);
  const polishLimit = Math.max(planConfig.perPolish ?? 0, 0);

  return {
    planLimits: {
      perBrief: briefLimit,
      perPolish: polishLimit,
      unlimited:
        active &&
        team.plan === "FREE" &&
        hasUnlimitedPressUsage(planConfig),
    },
    articleUsage: {
      briefUsed: stat.briefUsed,
      briefRemaining: Math.max(briefLimit - stat.briefUsed, 0),
      polishUsed: stat.polishUsed,
      polishRemaining: Math.max(polishLimit - stat.polishUsed, 0),
    },
  };
}

/**
 * 문서 내 기능(Brief/Polish) 사용 및 차감
 */
export async function consumeArticleUsage(params: {
  teamId: string;
  articleId: string;
  type: ArticleUsageType;
  userId?: string | null;
  meta?: Record<string, any>;
}) {
  const { teamId, articleId, type, userId, meta } = params;

  // 1. 한도 정보 확인
  const summary = await getArticleUsageSummary(teamId, articleId);
  const limit =
    type === "BRIEF"
      ? summary.planLimits.perBrief
      : summary.planLimits.perPolish;

  const now = new Date();

  // 2. 차감 처리
  await prisma.$transaction(async (tx) => {
    // Lock 확보용 upsert
    await tx.articleUsageStat.upsert({
      where: { articleId },
      create: { articleId },
      update: {},
    });

    const updateQuery =
      type === "BRIEF"
        ? { briefUsed: { increment: 1 }, lastBriefAt: now }
        : { polishUsed: { increment: 1 }, lastPolishAt: now };

    // 조건부 업데이트 (한도 넘으면 업데이트 안 됨)
    const whereQuery = summary.planLimits.unlimited
      ? { articleId }
      : type === "BRIEF"
        ? { articleId, briefUsed: { lt: limit } }
        : { articleId, polishUsed: { lt: limit } };

    const result = await tx.articleUsageStat.updateMany({
      where: whereQuery,
      data: updateQuery,
    });

    if (!summary.planLimits.unlimited && result.count === 0) {
      const label = type === "BRIEF" ? "브리프 생성" : "AI 문장 다듬기";
      throw new ArticleUsageLimitError(
        `${label} 사용 가능 횟수(${limit}회)를 모두 소진했습니다.`
      );
    }

    // 이벤트 로그
    await tx.articleUsageEvent.create({
      data: {
        articleId,
        teamId,
        userId: userId ?? null,
        type,
        meta: meta ?? Prisma.JsonNull,
      },
    });
  });

  return getArticleUsageSummary(teamId, articleId);
}
