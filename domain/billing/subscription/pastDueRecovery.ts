import { createHash } from "node:crypto";

import {
  getEffectiveMonthlyAmountByPlanId,
  isPlanId,
  type PlanId,
} from "@/config/billing/plans";
import type { PayProvider } from "@/config/billing/options";
import { getEffectiveProductSubscription } from "@/domain/billing/productSubscription";
import { completeWithBillingKey } from "@/domain/billing/subscription/completeWithBillingKey";
import { evaluateSubscriptionLifecycle } from "@/domain/billing/subscription/lifecycleMatrix";
import type { BillingPortOneDeps } from "@/domain/billing/subscription/paymentConfirmation";
import { prisma } from "@/lib/prisma";
import { ProductLine } from "@prisma/client";

function err(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function assertProduct(product: unknown): ProductLine {
  if (product === "PRESS" || product === "CAREER") return product;
  throw err(400, "PRODUCT_REQUIRED");
}

function resolveRecoveryTargetPlanId(args: {
  currentPlanId: string | null;
  pendingPlanId: string | null;
  pendingPlanStartsAt: Date | null;
  currentPlanExpiresAt: Date | null;
}): PlanId {
  const effectiveBoundary = args.currentPlanExpiresAt ?? new Date();
  const shouldApplyPending =
    !!args.pendingPlanId &&
    (!args.pendingPlanStartsAt ||
      args.pendingPlanStartsAt.getTime() <= effectiveBoundary.getTime());
  const planId = shouldApplyPending ? args.pendingPlanId : args.currentPlanId;
  if (!isPlanId(planId)) throw err(409, "INVALID_RECOVERY_TARGET_PLAN");
  return planId;
}

function createRecoveryAttemptIdentity(args: {
  teamId: string;
  subscriptionId: string;
  targetPlanId: PlanId;
  boundaryAt: Date | null;
  payProvider: PayProvider;
  billingKey: string;
  amount: number;
}) {
  const billingKeyFingerprint = createHash("sha256")
    .update(args.billingKey)
    .digest("hex");
  const digest = createHash("sha256")
    .update(
      [
        args.teamId,
        args.subscriptionId,
        args.targetPlanId,
        args.boundaryAt?.toISOString() ?? "no-boundary",
        args.payProvider,
        billingKeyFingerprint,
        args.amount,
      ].join(":"),
    )
    .digest("hex");
  return {
    attemptId: digest.slice(0, 24),
    paymentExternalId: `br_${digest.slice(0, 32)}`,
  };
}

function remapInProgressError(error: unknown): never {
  if (error instanceof Error && error.message === "PAYMENT_ATTEMPT_IN_PROGRESS") {
    throw err(409, "PAST_DUE_RECOVERY_IN_PROGRESS");
  }
  throw error;
}

export async function recoverPastDueSubscription(args: {
  teamId: string;
  userId: string;
  product: ProductLine;
  payProvider: PayProvider;
  billingKey: string;
  customer?: any;
  portone?: BillingPortOneDeps;
}) {
  const billingKey = args.billingKey?.trim();
  if (!billingKey) throw err(400, "MISSING_BILLING_KEY");
  const product = assertProduct(args.product);

  const subscriptionIdentity = await prisma.teamProductSubscription.findUnique({
    where: { teamId_product: { teamId: args.teamId, product } },
    select: { id: true },
  });
  if (!subscriptionIdentity) {
    throw err(404, "TEAM_PRODUCT_SUBSCRIPTION_NOT_FOUND");
  }

  const snapshot = await getEffectiveProductSubscription(args.teamId, product);
  const lifecycle = evaluateSubscriptionLifecycle(
    {
      plan: snapshot.plan,
      membershipStatus: snapshot.membershipStatus,
      payProvider: snapshot.payProvider,
      hasBillingKey: !!snapshot.billingKey,
      planExpiresAt: snapshot.planExpiresAt,
      pendingPlan: snapshot.pendingPlan,
      pendingPlanId: snapshot.pendingPlanId,
      pendingPlanStartsAt: snapshot.pendingPlanStartsAt,
      cancelRequestedAt: snapshot.cancelRequestedAt,
    },
    { isAdmin: true },
  );

  if (!lifecycle.actions.recoverPastDue.allowed) {
    const reason = lifecycle.actions.recoverPastDue.reason;
    if (reason === "NOT_PAST_DUE") {
      throw err(409, "PAST_DUE_RECOVERY_NOT_REQUIRED");
    }
    if (reason === "SUBSCRIPTION_EXPIRED") {
      throw err(409, "SUBSCRIPTION_EXPIRED");
    }
    throw err(409, "PAST_DUE_RECOVERY_NOT_ALLOWED");
  }

  const targetPlanId = resolveRecoveryTargetPlanId({
    currentPlanId: snapshot.planId,
    pendingPlanId: snapshot.pendingPlanId,
    pendingPlanStartsAt: snapshot.pendingPlanStartsAt,
    currentPlanExpiresAt: snapshot.planExpiresAt,
  });
  const payNowAmountWon = Math.max(
    0,
    snapshot.nextPaymentAmount ?? getEffectiveMonthlyAmountByPlanId(targetPlanId),
  );
  const { attemptId, paymentExternalId } = createRecoveryAttemptIdentity({
    teamId: args.teamId,
    subscriptionId: subscriptionIdentity.id,
    targetPlanId,
    boundaryAt: snapshot.nextBillingAt ?? snapshot.planExpiresAt,
    payProvider: args.payProvider,
    billingKey,
    amount: payNowAmountWon,
  });

  let completed;
  try {
    completed = await completeWithBillingKey({
      teamId: args.teamId,
      userId: args.userId,
      planId: targetPlanId,
      payProvider: args.payProvider,
      billingKey,
      customer: args.customer,
      attemptId,
      couponCode: null,
      portone: args.portone,
      initialPriceSnapshot: {
        changeType: "RENEW",
        finalAmount: payNowAmountWon,
        pastDueRecovery: true,
        paymentExternalId,
      },
    });
  } catch (error) {
    remapInProgressError(error);
  }

  return {
    action: "PAST_DUE_RECOVERED" as const,
    payNowAmountWon,
    targetPlanId,
    note:
      completed.mode === "ALREADY_COMPLETED"
        ? "PAST_DUE_RECOVERY_ALREADY_COMPLETED"
        : "PAST_DUE_RECOVERED",
    team: completed.team,
  };
}
