import { isPlanId, type PlanId } from "@/config/billing/plans";
import type { PayProvider } from "@/config/billing/options";
import { completeWithBillingKey } from "@/domain/billing/subscription/completeWithBillingKey";
import {
  serializeCompletionTeam,
  TEAM_COMPLETION_SELECT,
} from "@/domain/billing/subscription/completionPresentation";
import { isProductSubscriptionPaymentMethodRefForSubscription } from "@/domain/billing/subscription/paymentMethodReference";
import { markSubscriptionChangeApplyFailed } from "@/domain/billing/subscription/subscriptionChangeRepository";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

function recoveryError(status: number, message: string) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function parsePriceSnapshot(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw recoveryError(409, "SUBSCRIPTION_CHANGE_PRICE_SNAPSHOT_INVALID");
  }
  const snapshot = value as Record<string, unknown>;
  if (!isPlanId(snapshot.targetPlanId)) {
    throw recoveryError(409, "SUBSCRIPTION_CHANGE_TARGET_PLAN_INVALID");
  }
  const couponCode =
    typeof snapshot.couponCode === "string" && snapshot.couponCode.trim()
      ? snapshot.couponCode.trim()
      : null;
  const finalAmount = snapshot.finalAmount;
  if (typeof finalAmount !== "number" || !Number.isFinite(finalAmount) || finalAmount < 0) {
    throw recoveryError(409, "SUBSCRIPTION_CHANGE_PRICE_SNAPSHOT_INVALID");
  }
  return {
    targetPlanId: snapshot.targetPlanId as PlanId,
    couponCode,
    finalAmount,
  };
}

function parseAttemptId(args: {
  idempotencyKey: string;
  teamId: string;
  product: string;
}) {
  const prefix = `subscription-change:${args.teamId}:${args.product}:`;
  if (!args.idempotencyKey.startsWith(prefix)) {
    throw recoveryError(409, "SUBSCRIPTION_CHANGE_ATTEMPT_REFERENCE_INVALID");
  }
  const attemptId = args.idempotencyKey.slice(prefix.length);
  if (!attemptId) {
    throw recoveryError(409, "SUBSCRIPTION_CHANGE_ATTEMPT_REFERENCE_INVALID");
  }
  return attemptId;
}

function toPayProvider(provider: "INICIS" | "KAKAOPAY" | null): PayProvider {
  if (provider === "INICIS") return "inicis";
  if (provider === "KAKAOPAY") return "kakaopay";
  throw recoveryError(409, "SUBSCRIPTION_CHANGE_PAY_PROVIDER_MISSING");
}

/**
 * Replays the local apply phase using only durable SubscriptionChange state.
 * Callers must never provide the raw billing key or reconstruct checkout input.
 *
 * The transaction-scoped advisory lock is acquired before replay state is read
 * and remains held until local apply returns. This serializes API, webhook, and
 * scheduler workers without holding a row lock across nested local transactions.
 */
export async function recoverConfirmedSubscriptionChange(args: {
  changeId: string;
  now?: Date;
}) {
  try {
    const change = await prisma.subscriptionChange.findUnique({
        where: { id: args.changeId },
      });
      if (!change) throw recoveryError(404, "SUBSCRIPTION_CHANGE_NOT_FOUND");
      if (
        !["CONFIRMED", "NOT_REQUIRED"].includes(change.paymentStatus) ||
        !["PENDING", "FAILED", "APPLIED"].includes(change.applyStatus)
      ) {
        throw recoveryError(409, "SUBSCRIPTION_CHANGE_NOT_RECOVERABLE");
      }
      if (
        !change.subscriptionId ||
        !change.requesterUserId ||
        !change.paymentMethodRef ||
        !change.externalPaymentId
      ) {
        throw recoveryError(409, "SUBSCRIPTION_CHANGE_REPLAY_INPUT_MISSING");
      }

      const subscription = await prisma.teamProductSubscription.findUnique({
        where: { id: change.subscriptionId },
        select: {
          id: true,
          teamId: true,
          product: true,
          payProvider: true,
          billingKey: true,
        },
      });
      if (
        !subscription ||
        subscription.teamId !== change.teamId ||
        subscription.product !== change.product ||
        subscription.payProvider !== change.payProvider ||
        !isProductSubscriptionPaymentMethodRefForSubscription({
          reference: change.paymentMethodRef,
          subscriptionId: subscription.id,
        })
      ) {
        throw recoveryError(409, "SUBSCRIPTION_PAYMENT_METHOD_REFERENCE_INVALID");
      }

      const snapshot = parsePriceSnapshot(change.priceSnapshot);
      if (change.applyStatus === "APPLIED") {
        const team = await prisma.team.findUnique({
          where: { id: change.teamId },
          select: TEAM_COMPLETION_SELECT,
        });
        if (!team) throw recoveryError(404, "TEAM_NOT_FOUND");
        return {
          action: "NO_CHANGE" as const,
          mode: "ALREADY_COMPLETED",
          payNowAmountWon: snapshot.finalAmount,
          team: serializeCompletionTeam(team),
          note: "IDEMPOTENT_SUBSCRIPTION_CHANGE_ALREADY_APPLIED",
        };
      }
      const attemptId = parseAttemptId(change);

      return completeWithBillingKey({
        teamId: change.teamId,
        userId: change.requesterUserId,
        planId: snapshot.targetPlanId,
        payProvider: toPayProvider(change.payProvider),
        billingKey: subscription.billingKey ?? "",
        attemptId,
        couponCode: snapshot.couponCode,
        recordApplyFailure: false,
        recovery: {
          changeId: change.id,
          changeType: change.changeType,
          finalAmount: snapshot.finalAmount,
          couponCode: snapshot.couponCode,
          paymentMethodRef: change.paymentMethodRef,
          paymentExternalId: change.externalPaymentId,
          pastDueRecovery: change.externalPaymentId.startsWith("br_"),
        },
      });
  } catch (error) {
    const reason =
      error instanceof Error && error.message
        ? error.message
        : "SUBSCRIPTION_CHANGE_RECOVERY_FAILED";
    await markSubscriptionChangeApplyFailed({
      id: args.changeId,
      error: reason,
      now: args.now,
    }).catch(() => {});
    throw error;
  }
}
