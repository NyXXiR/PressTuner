import { Prisma } from "@prisma/client";

import {
  getPlan,
  type AiQuotaSurface,
  type PlanId,
} from "@/config/billing/plans";
import {
  addKstMonthsKeepingDay,
  kstMidnight,
} from "@/domain/billing/teamMembership";
import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";
import {
  getEffectiveProductSubscription,
  persistLegacyProductSubscription,
  productForSurface,
} from "@/domain/billing/productSubscription";

const TRIAL_BY_SURFACE: Record<
  AiQuotaSurface,
  { code: string; planId: PlanId; name: string }
> = {
  PRESS: {
    code: "SYSTEM_TRIAL_PRESS_PRO_V1",
    planId: "pro_monthly_v1",
    name: "Press Pro 1개월 체험",
  },
  RESUME: {
    code: "SYSTEM_TRIAL_RESUME_PRO_V1",
    planId: "career_pro_v1",
    name: "Career Pro 1개월 체험",
  },
};

function isActivePaidPlan(team: {
  plan: string;
  membershipStatus: string;
  planExpiresAt: Date | null;
}, now: Date) {
  if (team.plan === "FREE" || team.membershipStatus === "EXPIRED") {
    return false;
  }
  return !team.planExpiresAt || now.getTime() < team.planExpiresAt.getTime();
}

async function ensureTrialCoupon(
  tx: Prisma.TransactionClient,
  surface: AiQuotaSurface,
) {
  const trial = TRIAL_BY_SURFACE[surface];
  const plan = getPlan(trial.planId);
  const meta = {
    kind: "pro_trial",
    surface,
    version: 1,
    autoRenew: false,
  };

  return tx.coupon.upsert({
    where: { code: trial.code },
    create: {
      code: trial.code,
      name: trial.name,
      description: "신규 사용자용 1개월 Pro 체험. 자동 갱신 없음.",
      status: "ACTIVE",
      benefitType: "PLAN_GRANT",
      grantPlanId: plan.id,
      grantPlanType: plan.planType,
      grantPlanCategory: plan.category,
      grantMonths: 1,
      applicablePlanIds: [plan.id],
      applicablePlanTypes: [plan.planType],
      applicablePlanCategories: [plan.category],
      maxRedemptionsPerUser: 1,
      meta,
    },
    update: {
      status: "ACTIVE",
      benefitType: "PLAN_GRANT",
      grantPlanId: plan.id,
      grantPlanType: plan.planType,
      grantPlanCategory: plan.category,
      grantMonths: 1,
      applicablePlanIds: [plan.id],
      applicablePlanTypes: [plan.planType],
      applicablePlanCategories: [plan.category],
      maxRedemptionsPerUser: 1,
      meta,
    },
  });
}

export async function claimProTrialForTeam(input: {
  teamId: string;
  userId: string;
  surface: AiQuotaSurface;
}) {
  const trial = TRIAL_BY_SURFACE[input.surface];
  const plan = getPlan(trial.planId);
  const product = productForSurface(input.surface);
  const now = new Date();

  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: {
      id: true,
      plan: true,
      planId: true,
      membershipStatus: true,
      planExpiresAt: true,
    },
  });

  if (!team) {
    throw serviceError(404, "TEAM_NOT_FOUND", "TEAM_NOT_FOUND");
  }

  await persistLegacyProductSubscription(input.teamId);
  const currentSubscription = await getEffectiveProductSubscription(
    input.teamId,
    product,
  );

  const previousTrial = await prisma.couponRedemption.findFirst({
    where: {
      userId: input.userId,
      coupon: { code: trial.code },
    },
    select: { id: true },
  });
  if (previousTrial) {
    throw serviceError(
      409,
      "TRIAL_ALREADY_CLAIMED",
      "이미 체험 플랜을 사용했습니다.",
    );
  }

  if (isActivePaidPlan(currentSubscription, now)) {
    throw serviceError(
      409,
      "TRIAL_ACTIVE_PLAN_EXISTS",
      "이미 활성화된 유료 플랜이 있습니다.",
    );
  }

  const baseDate = kstMidnight(now);
  const expiresAt = addKstMonthsKeepingDay(baseDate, 1);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const coupon = await ensureTrialCoupon(tx, input.surface);
      const existing = await tx.couponRedemption.findUnique({
        where: {
          couponId_userId: {
            couponId: coupon.id,
            userId: input.userId,
          },
        },
      });

      if (existing) {
        throw serviceError(
          409,
          "TRIAL_ALREADY_CLAIMED",
          "이미 체험 플랜을 사용했습니다.",
        );
      }

      await tx.couponRedemption.create({
        data: {
          couponId: coupon.id,
          userId: input.userId,
          teamId: input.teamId,
          status: "REDEEMED",
          redeemedAt: now,
          meta: {
            kind: "pro_trial",
            surface: input.surface,
            grantPlanId: plan.id,
            grantMonths: 1,
            autoRenew: false,
          },
        },
      });

      const teamAfter = await tx.team.update({
        where: { id: input.teamId },
        data: {
          plan: plan.planType,
          planId: plan.id,
          planCategory: plan.category,
          membershipStatus: "ACTIVE",
          planExpiresAt: expiresAt,
          nextBillingAt: null,
          nextPaymentAmount: 0,
          payProvider: null,
          billingKey: null,
          pendingPlan: null,
          pendingPlanId: null,
          pendingPlanStartsAt: null,
          cancelRequestedAt: null,
          limitArticleMonthly: plan.quotaArticle,
          limitResumeMonthly: plan.quotaResume,
          usageArticleMonthly: 0,
          usageResumeMonthly: 0,
        },
        select: {
          id: true,
          plan: true,
          planId: true,
          planCategory: true,
          membershipStatus: true,
          planExpiresAt: true,
          nextBillingAt: true,
        },
      });

      await tx.teamProductSubscription.upsert({
        where: { teamId_product: { teamId: input.teamId, product } },
        create: {
          teamId: input.teamId,
          product,
          plan: plan.planType,
          planId: plan.id,
          membershipStatus: "ACTIVE",
          planExpiresAt: expiresAt,
          nextBillingAt: null,
          nextPaymentAmount: 0,
          payProvider: null,
          billingKey: null,
        },
        update: {
          plan: plan.planType,
          planId: plan.id,
          membershipStatus: "ACTIVE",
          planExpiresAt: expiresAt,
          nextBillingAt: null,
          nextPaymentAmount: 0,
          payProvider: null,
          billingKey: null,
          pendingPlan: null,
          pendingPlanId: null,
          pendingPlanStartsAt: null,
          cancelRequestedAt: null,
        },
      });

      await tx.teamBillingHistory.create({
        data: {
          teamId: input.teamId,
          userId: input.userId,
          type: "PAYMENT",
          status: "SUCCESS",
          plan: plan.planType,
          planId: plan.id,
          amount: 0,
          externalId: `${trial.code}:${input.teamId}:${input.userId}`,
          meta: {
            kind: "pro_trial",
            surface: input.surface,
            product,
            couponCode: coupon.code,
            autoRenew: false,
          },
          occurredAt: now,
        },
      });

      return teamAfter;
    });

    return {
      team: updated,
      trial: {
        surface: input.surface,
        planId: plan.id,
        planName: plan.name,
        expiresAt,
      },
    };
  } catch (error: any) {
    if (error?.code === "P2002") {
      throw serviceError(
        409,
        "TRIAL_ALREADY_CLAIMED",
        "이미 체험 플랜을 사용했습니다.",
      );
    }
    throw error;
  }
}
