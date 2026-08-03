import { prisma } from "@/lib/prisma";
import type {
  MembershipStatus,
  PlanType,
  ProductLine,
  SubscriptionPayProvider,
} from "@prisma/client";
import {
  getPlan,
  type PlanId,
} from "@/config/billing/plans";
import {
  nextChargeAtFromExpiresAtExclusive,
} from "@/domain/billing/teamMembership";
import { evaluateSubscriptionLifecycle } from "@/domain/billing/subscription/lifecycleMatrix";
import {
  buildExpiredToFreePatch,
} from "@/domain/billing/subscription/lifecycle";
import {
  iso,
  ymdhm,
  withoutBillingKey,
} from "@/domain/billing/subscription/serialize";
import {
  cancelProductSubscription,
  scheduleProductPlanChange,
  unscheduleProductPlanChange,
  uncancelProductSubscription,
} from "@/domain/billing/productSubscriptionCommands";
import { getLockedProductSubscriptionSnapshot } from "@/domain/billing/productSubscription";
import { logTeamBillingHistory } from "@/domain/billing/history/log";

function err(status: number, message: string) {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  return e;
}

// ✅ [Helper] Write 작업 시 리턴할 필드 목록 (일관성 유지용)
const TEAM_SELECT_FIELDS = {
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

  // 예약 관련 필드
  pendingPlan: true,
  pendingPlanId: true,
  pendingPlanStartsAt: true,

  cancelRequestedAt: true,

  lastPaymentId: true,
  lastPaidAt: true,

  // ✅ [NEW] UI 갱신을 위해 필수적인 필드들
  nextPaymentAmount: true,
  limitArticleMonthly: true,
  limitResumeMonthly: true,
  usageArticleMonthly: true,
  usageResumeMonthly: true,
} as const;

async function getTeamForWrite(teamId: string) {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: TEAM_SELECT_FIELDS,
  });
  if (!team) throw err(404, "TEAM_NOT_FOUND");
  return team;
}

function requireProduct(product?: ProductLine | null) {
  if (product !== "PRESS" && product !== "CAREER") {
    throw err(400, "PRODUCT_REQUIRED");
  }
  return product;
}

function teamSnapshotFromProductSnapshot(source: {
  plan: PlanType;
  planId: string | null;
  membershipStatus: MembershipStatus;
  payProvider: SubscriptionPayProvider | null;
  billingKey: string | null;
  nextPaymentAmount: number;
  nextBillingAt: Date | null;
  planExpiresAt: Date | null;
  pendingPlan: PlanType | null;
  pendingPlanId: string | null;
  pendingPlanStartsAt: Date | null;
  cancelRequestedAt: Date | null;
  lastPaymentId: string | null;
  lastPaidAt: Date | null;
}) {
  return {
    plan: source.plan,
    planId: source.planId,
    membershipStatus: source.membershipStatus,
    payProvider: source.payProvider,
    billingKey: source.billingKey,
    nextPaymentAmount: source.nextPaymentAmount,
    nextBillingAt: source.nextBillingAt,
    planExpiresAt: source.planExpiresAt,
    pendingPlan: source.pendingPlan,
    pendingPlanId: source.pendingPlanId,
    pendingPlanStartsAt: source.pendingPlanStartsAt,
    cancelRequestedAt: source.cancelRequestedAt,
    lastPaymentId: source.lastPaymentId,
    lastPaidAt: source.lastPaidAt,
  };
}

function serializeTeamState(team: any) {
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

export async function attachPaymentMethod(args: {
  teamId: string;
  provider: SubscriptionPayProvider;
  billingKey: string;
  product: ProductLine;
}) {
  if (!args.billingKey?.trim()) throw err(400, "MISSING_BILLING_KEY");
  const product = requireProduct(args.product);

  const team = await getTeamForWrite(args.teamId);
  const trimmedBillingKey = args.billingKey.trim();

  return prisma.$transaction(async (tx) => {
    const current = await getLockedProductSubscriptionSnapshot(team.id, product, tx);
    const nextBillingAtFix =
      current.nextBillingAt || !current.planExpiresAt
        ? null
        : nextChargeAtFromExpiresAtExclusive(current.planExpiresAt);

    const lifecycle = evaluateSubscriptionLifecycle(
      {
        plan: current.plan,
        membershipStatus: current.membershipStatus,
        payProvider: current.payProvider,
        hasBillingKey: !!current.billingKey,
        planExpiresAt: current.planExpiresAt,
        pendingPlan: current.pendingPlan,
        pendingPlanId: current.pendingPlanId,
        pendingPlanStartsAt: current.pendingPlanStartsAt,
        cancelRequestedAt: current.cancelRequestedAt,
      },
      { isAdmin: true },
    );

    if (!lifecycle.actions.changePaymentMethod.allowed) {
      const reason = lifecycle.actions.changePaymentMethod.reason;
      if (reason === "FREE_PLAN") {
        throw err(409, "FREE_PLAN_CANNOT_ATTACH_PAYMENT_METHOD");
      }
      if (reason === "SUBSCRIPTION_EXPIRED") {
        throw err(409, "SUBSCRIPTION_EXPIRED");
      }
      throw err(409, "PAYMENT_METHOD_CHANGE_NOT_ALLOWED");
    }

    const patch = {
      payProvider: args.provider,
      billingKey: trimmedBillingKey,
      ...(nextBillingAtFix ? { nextBillingAt: nextBillingAtFix } : {}),
    };

    const updatedProduct = await tx.teamProductSubscription.upsert({
      where: { teamId_product: { teamId: team.id, product } },
      create: {
        ...current,
        ...patch,
      },
      update: patch,
    });

    const updatedTeam = await tx.team.update({
      where: { id: team.id },
      data: teamSnapshotFromProductSnapshot(updatedProduct),
      select: TEAM_SELECT_FIELDS,
    });

    return serializeTeamState(updatedTeam);
  });
}

export async function scheduleDowngradeCommand(args: { teamId: string; targetPlanId: PlanId }) {
  const target = getPlan(args.targetPlanId);

  if (!target) {
    throw err(400, "INVALID_TARGET_PLAN");
  }

  await scheduleProductPlanChange(args);

  const updated = await prisma.team.findUnique({
    where: { id: args.teamId },
    select: TEAM_SELECT_FIELDS,
  });
  if (!updated) throw err(404, "TEAM_NOT_FOUND");

  return serializeTeamState(updated);
}

export async function unscheduleDowngradeCommand(args: {
  teamId: string;
  product: ProductLine;
}) {
  const selectedProduct = requireProduct(args.product);

  await unscheduleProductPlanChange({
    teamId: args.teamId,
    product: selectedProduct,
  });

  const updated = await getTeamForWrite(args.teamId);

  return serializeTeamState(updated);
}

export async function cancelSubscriptionCommand(args: {
  teamId: string;
  userId: string;
  product: ProductLine;
}) {
  const selectedProduct = requireProduct(args.product);

  await cancelProductSubscription({
    teamId: args.teamId,
    userId: args.userId,
    product: selectedProduct,
  });

  const updated = await getTeamForWrite(args.teamId);

  return serializeTeamState(updated);
}

export async function uncancelSubscriptionCommand(args: {
  teamId: string;
  product: ProductLine;
}) {
  const selectedProduct = requireProduct(args.product);

  await uncancelProductSubscription({
    teamId: args.teamId,
    product: selectedProduct,
  });

  const updated = await getTeamForWrite(args.teamId);

  return serializeTeamState(updated);
}

const FREE_PRODUCT_PATCH = {
  plan: "FREE" as const,
  planId: "free_v1" as const,
  membershipStatus: "ACTIVE" as const,
  payProvider: null,
  billingKey: null,
  nextPaymentAmount: 0,
  nextBillingAt: null as Date | null,
  planExpiresAt: null as Date | null,
  pendingPlan: null as PlanType | null,
  pendingPlanId: null as string | null,
  pendingPlanStartsAt: null as Date | null,
  cancelRequestedAt: null as Date | null,
  lastPaymentId: null as string | null,
  lastPaidAt: null as Date | null,
};

export async function resetFreeCommand(args: {
  teamId: string;
  userId: string;
  confirm: string;
}) {
  if (args.confirm !== "RESET_FREE") throw err(400, "CONFIRM_REQUIRED");

  await getTeamForWrite(args.teamId);

  const updated = await prisma.$transaction(async (tx) => {
    const subscriptions = await tx.teamProductSubscription.findMany({
      where: { teamId: args.teamId },
      select: { id: true, product: true },
    });
    const t = await tx.team.update({
      where: { id: args.teamId },
      data: buildExpiredToFreePatch(),
      select: TEAM_SELECT_FIELDS,
    });

    const occurredAt = new Date();
    for (const subscription of subscriptions) {
      await tx.teamProductSubscription.update({
        where: { id: subscription.id },
        data: FREE_PRODUCT_PATCH,
      });
      await logTeamBillingHistory(
        {
          teamId: t.id,
          userId: args.userId,
          type: "CANCEL",
          status: "SUCCESS",
          provider: null,
          plan: "FREE",
          planId: "free_v1",
          product: subscription.product,
          subscriptionId: subscription.id,
          amount: 0,
          currency: "KRW",
          externalId: `reset_free_${t.id}_${subscription.product}_${occurredAt.getTime()}`,
          meta: { kind: "RESET_FREE", product: subscription.product },
          occurredAt,
        },
        tx,
      );
    }

    return t;
  });

  return serializeTeamState(updated);
}
