import type { PayProvider } from "@/config/billing/options";
import { getPlan } from "@/config/billing/plans";
import { completeWithBillingKey } from "@/domain/billing/subscription/completeWithBillingKey";
import { createSubscriptionPaymentId } from "@/domain/billing/subscription/paymentConfirmation";
import { createProductSubscriptionPaymentMethodRef } from "@/domain/billing/subscription/paymentMethodReference";
import { recoverConfirmedSubscriptionChange } from "@/domain/billing/subscription/subscriptionChangeRecovery";
import { prisma } from "@/lib/prisma";

type CompletionArgs = Parameters<typeof completeWithBillingKey>[0];

function conflictError() {
  return Object.assign(new Error("SUBSCRIPTION_CHANGE_IDEMPOTENCY_CONFLICT"), {
    code: "SUBSCRIPTION_CHANGE_IDEMPOTENCY_CONFLICT",
    status: 409,
  });
}

function persistedProvider(provider: PayProvider) {
  if (provider === "inicis") return "INICIS";
  if (provider === "kakaopay") return "KAKAOPAY";
  if (provider === "naverpay") return "NAVERPAY";
  return "TOSSPAY";
}

function snapshotCouponCode(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const couponCode = (snapshot as Record<string, unknown>).couponCode;
  return typeof couponCode === "string" && couponCode.trim()
    ? couponCode.trim()
    : null;
}

export async function completeOrRecoverSubscriptionChange(args: CompletionArgs) {
  const plan = getPlan(args.planId);
  const product = plan.product;
  const idempotencyKey = `subscription-change:${args.teamId}:${product}:${args.attemptId}`;
  const existing = await prisma.subscriptionChange.findUnique({
    where: { idempotencyKey },
  });

  if (
    !existing ||
    !["CONFIRMED", "NOT_REQUIRED"].includes(existing.paymentStatus) ||
    !["PENDING", "FAILED", "APPLIED"].includes(existing.applyStatus)
  ) {
    return completeWithBillingKey(args);
  }

  if (!existing.subscriptionId || !existing.paymentMethodRef) {
    throw conflictError();
  }

  const expectedPaymentMethodRef = createProductSubscriptionPaymentMethodRef({
    subscriptionId: existing.subscriptionId,
    billingKey: args.billingKey,
  });
  const normalizedCouponCode = args.couponCode?.trim() || null;
  const expectedPaymentId =
    existing.paymentStatus === "NOT_REQUIRED"
      ? `nocharge_${args.attemptId}`
      : createSubscriptionPaymentId(plan.code, args.attemptId);

  if (
    existing.teamId !== args.teamId ||
    existing.product !== product ||
    existing.targetPlanId !== args.planId ||
    existing.requesterUserId !== args.userId ||
    existing.payProvider !== persistedProvider(args.payProvider) ||
    existing.externalPaymentId !== expectedPaymentId ||
    existing.paymentMethodRef !== expectedPaymentMethodRef ||
    snapshotCouponCode(existing.priceSnapshot) !== normalizedCouponCode
  ) {
    throw conflictError();
  }

  return recoverConfirmedSubscriptionChange({ changeId: existing.id });
}
