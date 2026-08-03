import { getPlan, type PlanId } from "@/config/billing/plans";
import {
  addKstMonthsKeepingDay,
  dateFromKst,
  getKstYmd,
  nextChargeAtFromExpiresAtExclusive,
} from "@/domain/billing/teamMembership";
import type {
  MembershipStatus,
  PlanType,
  SubscriptionPayProvider,
} from "@prisma/client";

const STALE_RENEWAL_GRACE_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

type TeamBillingPatch = {
  plan?: PlanType;
  planId?: string;
  planCategory?: "PRESS" | "CAREER" | "STANDARD";
  membershipStatus?: MembershipStatus;
  payProvider?: SubscriptionPayProvider | null;
  billingKey?: string | null;
  nextPaymentAmount?: number;
  planExpiresAt?: Date | null;
  nextBillingAt?: Date | null;
  pendingPlan?: PlanType | null;
  pendingPlanId?: string | null;
  pendingPlanStartsAt?: Date | null;
  cancelRequestedAt?: Date | null;
  lastPaymentId?: string | null;
  lastPaidAt?: Date | null;
  limitArticleMonthly?: number;
  limitResumeMonthly?: number;
  usageArticleMonthly?: number;
  usageResumeMonthly?: number;
};

function buildPlanSnapshotPatch(planId: PlanId): TeamBillingPatch {
  const plan = getPlan(planId);
  return {
    plan: plan.planType as PlanType,
    planId: plan.id,
    planCategory: plan.category,
    nextPaymentAmount: plan.monthlyAmountWon,
    limitArticleMonthly: plan.quotaArticle ?? 0,
    limitResumeMonthly: plan.quotaResume ?? 0,
  };
}

function computeNewExpiresAtExclusiveFromTodayKst(now: Date) {
  const { y, m, d } = getKstYmd(now);
  return addKstMonthsKeepingDay(dateFromKst(y, m, d, 0, 0, 0), 1);
}

function computeRecurringCycleDates(args: {
  currentPlanExpiresAt: Date | null;
  now: Date;
}) {
  const { currentPlanExpiresAt, now } = args;
  const staleCutoff = now.getTime() - STALE_RENEWAL_GRACE_DAYS * DAY_MS;
  const planExpiresAt =
    currentPlanExpiresAt && currentPlanExpiresAt.getTime() >= staleCutoff
      ? addKstMonthsKeepingDay(currentPlanExpiresAt, 1)
      : computeNewExpiresAtExclusiveFromTodayKst(now);

  return {
    planExpiresAt,
    nextBillingAt: nextChargeAtFromExpiresAtExclusive(planExpiresAt),
  };
}

function restoreNextBillingAt(
  planExpiresAt: Date | null,
  nextBillingAt: Date | null,
) {
  if (nextBillingAt) return nextBillingAt;
  if (!planExpiresAt) return null;
  return nextChargeAtFromExpiresAtExclusive(planExpiresAt);
}

export function buildCheckoutSubscriptionPatch(args: {
  targetPlanId: PlanId;
  currentPlanExpiresAt: Date | null;
  renewFromCurrentCycle: boolean;
  now: Date;
  payProvider: SubscriptionPayProvider;
  billingKey: string;
  lastPaymentId?: string | null;
  lastPaidAt?: Date | null;
}) {
  const { targetPlanId, renewFromCurrentCycle, currentPlanExpiresAt, now } =
    args;
  const snapshot = buildPlanSnapshotPatch(targetPlanId);
  const planExpiresAt =
    renewFromCurrentCycle && currentPlanExpiresAt
      ? addKstMonthsKeepingDay(currentPlanExpiresAt, 1)
      : computeNewExpiresAtExclusiveFromTodayKst(now);

  return {
    ...snapshot,
    membershipStatus: "ACTIVE" as const,
    payProvider: args.payProvider,
    billingKey: args.billingKey,
    planExpiresAt,
    nextBillingAt: nextChargeAtFromExpiresAtExclusive(planExpiresAt),
    pendingPlan: null,
    pendingPlanId: null,
    pendingPlanStartsAt: null,
    cancelRequestedAt: null,
    usageArticleMonthly: 0,
    usageResumeMonthly: 0,
    lastPaymentId: args.lastPaymentId ?? undefined,
    lastPaidAt: args.lastPaidAt ?? undefined,
  };
}

export function buildRecurringRenewalPatch(args: {
  targetPlanId: PlanId;
  currentPlanExpiresAt: Date | null;
  now: Date;
}) {
  const snapshot = buildPlanSnapshotPatch(args.targetPlanId);
  const cycle = computeRecurringCycleDates(args);

  return {
    ...snapshot,
    membershipStatus: "ACTIVE" as const,
    planExpiresAt: cycle.planExpiresAt,
    nextBillingAt: cycle.nextBillingAt,
    pendingPlan: null,
    pendingPlanId: null,
    pendingPlanStartsAt: null,
    usageArticleMonthly: 0,
    usageResumeMonthly: 0,
  };
}

export function buildImmediateUpgradePatch(args: {
  targetPlanId: PlanId;
  planExpiresAt: Date | null;
  nextBillingAt: Date | null;
  payProvider: SubscriptionPayProvider;
  billingKey: string;
  lastPaymentId?: string | null;
  lastPaidAt?: Date | null;
}) {
  const snapshot = buildPlanSnapshotPatch(args.targetPlanId);

  return {
    ...snapshot,
    membershipStatus: "ACTIVE" as const,
    payProvider: args.payProvider,
    billingKey: args.billingKey,
    nextBillingAt: restoreNextBillingAt(args.planExpiresAt, args.nextBillingAt),
    pendingPlan: null,
    pendingPlanId: null,
    pendingPlanStartsAt: null,
    cancelRequestedAt: null,
    lastPaymentId: args.lastPaymentId ?? undefined,
    lastPaidAt: args.lastPaidAt ?? undefined,
  };
}

export function buildScheduledDowngradePatch(args: {
  targetPlanId: PlanId;
  planExpiresAt: Date;
}) {
  const plan = getPlan(args.targetPlanId);

  return {
    pendingPlan: plan.planType as PlanType,
    pendingPlanId: plan.id,
    pendingPlanStartsAt: args.planExpiresAt,
    nextPaymentAmount: plan.monthlyAmountWon,
  };
}

export function buildCancelSubscriptionPatch(args: {
  planExpiresAt: Date | null;
  nextBillingAt: Date | null;
  now: Date;
}) {
  return {
    membershipStatus: "CANCELED" as const,
    cancelRequestedAt: args.now,
    pendingPlan: null,
    pendingPlanId: null,
    pendingPlanStartsAt: null,
    nextBillingAt: restoreNextBillingAt(args.planExpiresAt, args.nextBillingAt),
  };
}

export function buildUncancelSubscriptionPatch(args: {
  planExpiresAt: Date | null;
  nextBillingAt: Date | null;
}) {
  return {
    membershipStatus: "ACTIVE" as const,
    cancelRequestedAt: null,
    nextBillingAt: restoreNextBillingAt(args.planExpiresAt, args.nextBillingAt),
  };
}

export function buildPendingPlanActivationPatch(args: { planId: PlanId }) {
  return {
    ...buildPlanSnapshotPatch(args.planId),
    pendingPlan: null,
    pendingPlanId: null,
    pendingPlanStartsAt: null,
  };
}

export function buildExpiredToFreePatch() {
  return {
    ...buildPlanSnapshotPatch("free_v1"),
    membershipStatus: "ACTIVE" as const,
    payProvider: null,
    billingKey: null,
    planExpiresAt: null,
    nextBillingAt: null,
    pendingPlan: null,
    pendingPlanId: null,
    pendingPlanStartsAt: null,
    cancelRequestedAt: null,
    lastPaymentId: null,
    lastPaidAt: null,
    usageArticleMonthly: 0,
    usageResumeMonthly: 0,
  };
}
