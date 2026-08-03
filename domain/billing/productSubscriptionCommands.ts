import type { ProductLine } from "@prisma/client";

import {
  getMonthlyAmountByPlanId,
  getPlan,
  type PlanId,
} from "@/config/billing/plans";
import {
  getLockedProductSubscriptionSnapshot,
  getEffectiveProductSubscription,
  requireProductForPlan,
  ProductSubscriptionSnapshot,
} from "@/domain/billing/productSubscription";
import { logTeamBillingHistory } from "@/domain/billing/history/log";
import {
  buildCancelSubscriptionPatch,
  buildScheduledDowngradePatch,
  buildUncancelSubscriptionPatch,
} from "@/domain/billing/subscription/lifecycle";
import { planTier } from "@/domain/billing/teamMembership";
import { prisma } from "@/lib/prisma";

function err(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function requireProduct(product?: ProductLine) {
  if (product !== "PRESS" && product !== "CAREER") {
    throw err(400, "PRODUCT_REQUIRED");
  }
  return product;
}

function teamSnapshotFromProductSnapshot(
  source: ProductSubscriptionSnapshot,
) {
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

export async function scheduleProductPlanChange(args: {
  teamId: string;
  targetPlanId: PlanId;
}) {
  const product = requireProductForPlan(args.targetPlanId);
  const target = getPlan(args.targetPlanId);

  return prisma.$transaction(async (tx) => {
    const current = await getLockedProductSubscriptionSnapshot(
      args.teamId,
      product,
      tx,
    );

    if (!current.planExpiresAt || current.plan === "FREE") {
      throw err(409, "NO_ACTIVE_SUBSCRIPTION");
    }

    const deferred =
      planTier(target.planType) < planTier(current.plan) ||
      (target.planType === current.plan && target.id !== current.planId);
    if (!deferred) {
      throw err(400, "NOT_A_DOWNGRADE");
    }

    const patch = buildScheduledDowngradePatch({
      targetPlanId: args.targetPlanId,
      planExpiresAt: current.planExpiresAt,
    });

    const alreadyScheduled =
      current.pendingPlanId === patch.pendingPlanId &&
      current.pendingPlan === patch.pendingPlan &&
      current.pendingPlanStartsAt?.getTime() === patch.pendingPlanStartsAt?.getTime() &&
      current.nextPaymentAmount === patch.nextPaymentAmount;

    if (alreadyScheduled) {
      return current;
    }

    const updated = await tx.teamProductSubscription.upsert({
      where: { teamId_product: { teamId: args.teamId, product } },
      create: {
        ...current,
        ...patch,
      },
      update: patch,
    });

    await tx.team.update({
      where: { id: args.teamId },
      data: teamSnapshotFromProductSnapshot(updated),
    });

    await logTeamBillingHistory(
      {
        teamId: args.teamId,
        type: "CANCEL",
        status: "SUCCESS",
        provider: current.payProvider,
        plan: current.plan,
        planId: current.planId,
        amount: 0,
        meta: {
          kind: "PLAN_CHANGE_SCHEDULED",
          product,
          targetPlanId: args.targetPlanId,
        },
      },
      tx,
    );

    return updated;
  });
}

export async function cancelProductSubscription(args: {
  teamId: string;
  userId: string;
  product: ProductLine;
}) {
  const product = requireProduct(args.product);
  return prisma.$transaction(async (tx) => {
    const current = await getLockedProductSubscriptionSnapshot(
      args.teamId,
      product,
      tx,
    );

    if (current.plan === "FREE") {
      throw err(409, "NO_ACTIVE_PAID_SUBSCRIPTION");
    }

    if (current.membershipStatus === "CANCELED" || current.cancelRequestedAt) {
      return current;
    }

    const now = new Date();
    const patch = buildCancelSubscriptionPatch({
      planExpiresAt: current.planExpiresAt,
      nextBillingAt: current.nextBillingAt,
      now,
    });

    const updated = await tx.teamProductSubscription.upsert({
      where: { teamId_product: { teamId: args.teamId, product } },
      create: {
        ...current,
        ...patch,
      },
      update: patch,
    });

    await tx.team.update({
      where: { id: args.teamId },
      data: teamSnapshotFromProductSnapshot(updated),
    });

    await logTeamBillingHistory(
      {
        teamId: args.teamId,
        userId: args.userId,
        type: "CANCEL",
        status: "SUCCESS",
        provider: current.payProvider,
        plan: current.plan,
        planId: current.planId,
        amount: 0,
        meta: {
          kind: "SUBSCRIPTION_CANCEL_REQUEST",
          product,
        },
      },
      tx,
    );

    return updated;
  });
}

export async function uncancelProductSubscription(args: {
  teamId: string;
  product: ProductLine;
}) {
  const product = requireProduct(args.product);
  return prisma.$transaction(async (tx) => {
    const current = await getLockedProductSubscriptionSnapshot(
      args.teamId,
      product,
      tx,
    );

    if (!current.billingKey || !current.payProvider) {
      throw err(409, "PAYMENT_METHOD_REQUIRED");
    }
    if (current.plan === "FREE") {
      throw err(409, "NO_ACTIVE_PAID_SUBSCRIPTION");
    }
    if (current.planExpiresAt && current.planExpiresAt <= new Date()) {
      throw err(409, "SUBSCRIPTION_EXPIRED");
    }
    if (current.membershipStatus !== "CANCELED" && !current.cancelRequestedAt) {
      return current;
    }

    const patch = buildUncancelSubscriptionPatch({
      planExpiresAt: current.planExpiresAt,
      nextBillingAt: current.nextBillingAt,
    });

    const updated = await tx.teamProductSubscription.upsert({
      where: { teamId_product: { teamId: args.teamId, product } },
      create: {
        ...current,
        ...patch,
      },
      update: patch,
    });

    await tx.team.update({
      where: { id: args.teamId },
      data: teamSnapshotFromProductSnapshot(updated),
    });

    await logTeamBillingHistory(
      {
        teamId: args.teamId,
        type: "CANCEL",
        status: "SUCCESS",
        provider: updated.payProvider,
        plan: updated.plan,
        planId: updated.planId,
        amount: 0,
        meta: {
          kind: "SUBSCRIPTION_UNCANCEL_REQUEST",
          product,
        },
      },
      tx,
    );

    return updated;
  });
}

export async function unscheduleProductPlanChange(args: {
  teamId: string;
  product: ProductLine;
}) {
  const product = requireProduct(args.product);
  return prisma.$transaction(async (tx) => {
    const current = await getLockedProductSubscriptionSnapshot(
      args.teamId,
      product,
      tx,
    );
    const nextPaymentAmount = getMonthlyAmountByPlanId(current.planId);
    const patch = {
      pendingPlan: null,
      pendingPlanId: null,
      pendingPlanStartsAt: null,
      nextPaymentAmount,
    } as const;

    const alreadyCleared =
      current.pendingPlan == null &&
      current.pendingPlanId == null &&
      current.pendingPlanStartsAt == null &&
      current.nextPaymentAmount === nextPaymentAmount;

    if (alreadyCleared) {
      return current;
    }

    const updated = await tx.teamProductSubscription.upsert({
      where: { teamId_product: { teamId: args.teamId, product } },
      create: {
        ...current,
        ...patch,
      },
      update: patch,
    });

    await tx.team.update({
      where: { id: args.teamId },
      data: teamSnapshotFromProductSnapshot(updated),
    });

    await logTeamBillingHistory(
      {
        teamId: args.teamId,
        type: "CANCEL",
        status: "SUCCESS",
        provider: updated.payProvider,
        plan: updated.plan,
        planId: updated.planId,
        amount: 0,
        meta: {
          kind: "PLAN_CHANGE_UNSCHEDULED",
          product,
        },
      },
      tx,
    );

    return updated;
  });
}
