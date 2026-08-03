import { iso, ymdhm, withoutBillingKey } from "@/domain/billing/subscription/serialize";

export const TEAM_COMPLETION_SELECT = {
  id: true,
  slug: true,
  name: true,
  plan: true,
  planId: true,
  planCategory: true,
  membershipStatus: true,
  payProvider: true,
  billingKey: true,
  planExpiresAt: true,
  nextBillingAt: true,
  nextPaymentAmount: true,
  pendingPlan: true,
  pendingPlanId: true,
  pendingPlanStartsAt: true,
  cancelRequestedAt: true,
  lastPaymentId: true,
  lastPaidAt: true,
  limitArticleMonthly: true,
  limitResumeMonthly: true,
  usageArticleMonthly: true,
  usageResumeMonthly: true,
} as const;

type CompletionTeam = {
  planExpiresAt: Date | null;
  nextBillingAt: Date | null;
  pendingPlanStartsAt: Date | null;
  cancelRequestedAt: Date | null;
  lastPaidAt: Date | null;
  billingKey?: string | null;
  [key: string]: unknown;
};

export function serializeCompletionTeam(team: CompletionTeam) {
  const { safe, hasBillingKey } = withoutBillingKey(team);
  return {
    ...safe,
    planExpiresAt: iso(team.planExpiresAt),
    nextBillingAt: iso(team.nextBillingAt),
    pendingPlanStartsAt: iso(team.pendingPlanStartsAt),
    cancelRequestedAt: iso(team.cancelRequestedAt),
    lastPaidAt: iso(team.lastPaidAt),
    planExpiresAtYmdhm: ymdhm(team.planExpiresAt),
    nextBillingAtYmdhm: ymdhm(team.nextBillingAt),
    pendingPlanStartsAtYmdhm: ymdhm(team.pendingPlanStartsAt),
    cancelRequestedAtYmdhm: ymdhm(team.cancelRequestedAt),
    lastPaidAtYmdhm: ymdhm(team.lastPaidAt),
    hasBillingKey,
  };
}
