import { type PlanId } from "@/config/billing/plans";
import { resolveSubscriptionPricing } from "@/domain/billing/subscription/pricing";
import {
  getSubscriptionContextForProduct,
  getSubscriptionStatusForProduct,
  getSubscriptionSummaryForProduct,
} from "@/domain/billing/subscription/queries";
import {
  attachPaymentMethod,
  resetFreeCommand,
} from "@/domain/billing/subscription/commands";
import { recoverPastDueSubscription } from "@/domain/billing/subscription/pastDueRecovery";
import type { PayProvider } from "@/config/billing/options";
import type { SubscriptionPayProvider } from "@prisma/client";
import type { ProductLine } from "@prisma/client";
import { serviceError } from "@/lib/services/serviceError";
import {
  getEffectiveProductSubscription,
  requireProductForPlan,
} from "@/domain/billing/productSubscription";
import {
  cancelProductSubscription,
  scheduleProductPlanChange,
  uncancelProductSubscription,
  unscheduleProductPlanChange,
} from "@/domain/billing/productSubscriptionCommands";

function normalizeProvider(provider: PayProvider): SubscriptionPayProvider {
  return provider === "inicis" ? "INICIS" : "KAKAOPAY";
}

export async function getSubscriptionStatusForTeamByProduct(
  teamId: string,
  product: ProductLine,
) {
  return getSubscriptionStatusForProduct(teamId, product);
}

export async function getSubscriptionContextForTeamByProduct(
  teamId: string,
  product: ProductLine,
) {
  return getSubscriptionContextForProduct(teamId, product);
}

export async function getSubscriptionSummaryForTeamByProduct(
  teamId: string,
  product: ProductLine,
) {
  const summary = await getSubscriptionSummaryForProduct(teamId, product);
  return {
    ...summary,
    note: "TEAM_SUBSCRIPTION_SUMMARY",
  };
}

export async function getSubscriptionQuoteForTeam(input: {
  teamId: string;
  userId?: string;
  targetPlanId: PlanId;
  couponCode?: string;
}) {
  const product = requireProductForPlan(input.targetPlanId);
  const row = await getEffectiveProductSubscription(input.teamId, product);

  if (row.membershipStatus === "PAST_DUE") {
    throw serviceError(
      409,
      "PAST_DUE_RECOVERY_REQUIRED",
      "PAST_DUE_RECOVERY_REQUIRED"
    );
  }

  const q = await resolveSubscriptionPricing({
    targetPlanId: input.targetPlanId,
    userId: input.userId,
    couponCode: input.couponCode,
    current: {
      planId: row.planId,
      plan: row.plan,
      membershipStatus: row.membershipStatus,
      planExpiresAt: row.planExpiresAt,
      pendingPlan: row.pendingPlan,
      pendingPlanStartsAt: row.pendingPlanStartsAt,
      cancelRequestedAt: row.cancelRequestedAt,
    },
  });

  return {
    ...q,
    product,
    note: q.note,
  };
}

export async function scheduleDowngradeForTeam(input: {
  teamId: string;
  targetPlanId: PlanId;
  product?: ProductLine | null;
}) {
  const planProduct = requireProductForPlan(input.targetPlanId);
  if (input.product && input.product !== planProduct) {
    throw serviceError(
      400,
      "PRODUCT_MISMATCH",
      "PRODUCT_MISMATCH",
    );
  }

  return scheduleProductPlanChange(input);
}

export async function unscheduleDowngradeForTeam(teamId: string, product?: ProductLine | null) {
  if (!product) {
    throw serviceError(
      400,
      "PRODUCT_REQUIRED",
      "PRODUCT_REQUIRED",
    );
  }

  return unscheduleProductPlanChange({ teamId, product });
}

export async function cancelSubscriptionForTeam(input: { teamId: string; userId: string; product?: ProductLine | null }) {
  if (!input.product) {
    throw serviceError(400, "PRODUCT_REQUIRED", "PRODUCT_REQUIRED");
  }

  return cancelProductSubscription({
    teamId: input.teamId,
    userId: input.userId,
    product: input.product,
  });
}

export async function uncancelSubscriptionForTeam(teamId: string, product?: ProductLine | null) {
  if (!product) {
    throw serviceError(400, "PRODUCT_REQUIRED", "PRODUCT_REQUIRED");
  }

  return uncancelProductSubscription({ teamId, product });
}

export async function resetFreeForTeam(input: {
  teamId: string;
  userId: string;
  confirm: string;
}) {
  return resetFreeCommand(input);
}

export async function attachPaymentMethodForTeam(input: {
  teamId: string;
  provider: PayProvider;
  billingKey: string;
  userId?: string;
  recoverPastDue?: boolean;
  product: ProductLine;
}) {
  const attached = await attachPaymentMethod({
    teamId: input.teamId,
    provider: normalizeProvider(input.provider),
    billingKey: input.billingKey,
    product: input.product,
  });

    if (!input.recoverPastDue) {
    return {
      team: attached,
      recovered: false as const,
      action: null,
      note: "PAYMENT_METHOD_ATTACHED",
    };
    }

    if (!input.userId?.trim()) {
    throw serviceError(400, "USER_ID_REQUIRED", "USER_ID_REQUIRED");
  }

  try {
    const recovered = await recoverPastDueSubscription({
      teamId: input.teamId,
      userId: input.userId,
      product: input.product,
      payProvider: input.provider,
      billingKey: input.billingKey,
      customer: {
        id: input.teamId,
        name: "Presstuner Subscriber",
      },
    });

    return {
      team: recovered.team,
      recovered: true as const,
      action: recovered.action,
      note: recovered.note,
    };
  } catch (error: any) {
    if (error?.message === "PAST_DUE_RECOVERY_NOT_REQUIRED") {
      return {
        team: attached,
        recovered: false as const,
        action: null,
        note: "PAYMENT_METHOD_ATTACHED",
      };
    }

    throw serviceError(
      typeof error?.status === "number" ? error.status : 409,
      "PAST_DUE_RECOVERY_FAILED",
      "결제수단은 변경되었지만 복구 결제에 실패했습니다.",
      {
        paymentMethodAttached: true,
        attachedTeam: attached,
        recoveryError: error?.message ?? "PAST_DUE_RECOVERY_FAILED",
      }
    );
  }
}

export { serviceError };
