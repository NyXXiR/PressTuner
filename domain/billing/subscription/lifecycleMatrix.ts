import type { MembershipStatus, PlanType } from "@prisma/client";

export type BillingLifecycleState =
  | "FREE"
  | "ACTIVE"
  | "ACTIVE_PENDING_DOWNGRADE"
  | "CANCELED_ACTIVE"
  | "PAST_DUE"
  | "EXPIRED";

export type BillingLifecycleActionReason =
  | "ADMIN_REQUIRED"
  | "FREE_PLAN"
  | "ALREADY_CANCELED"
  | "NOT_CANCELED"
  | "NOT_PAST_DUE"
  | "NO_BILLING_METHOD"
  | "SUBSCRIPTION_EXPIRED"
  | "NO_PENDING_CHANGE"
  | "PAST_DUE_RECOVERY_REQUIRED";

type ActionDecision = {
  allowed: boolean;
  reason: BillingLifecycleActionReason | null;
};

export type BillingLifecycleSnapshot = {
  plan: PlanType | string;
  membershipStatus: MembershipStatus | string;
  payProvider?: string | null;
  hasBillingKey?: boolean;
  planExpiresAt?: Date | string | null;
  pendingPlan?: string | null;
  pendingPlanId?: string | null;
  pendingPlanStartsAt?: Date | string | null;
  cancelRequestedAt?: Date | string | null;
};

function parseDate(value?: Date | string | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function deny(reason: BillingLifecycleActionReason): ActionDecision {
  return { allowed: false, reason };
}

function allow(): ActionDecision {
  return { allowed: true, reason: null };
}

export function evaluateSubscriptionLifecycle(
  snapshot: BillingLifecycleSnapshot,
  opts?: { now?: Date; isAdmin?: boolean },
) {
  const now = opts?.now ?? new Date();
  const isAdmin = !!opts?.isAdmin;

  const planExpiresAt = parseDate(snapshot.planExpiresAt);
  const pendingPlanStartsAt = parseDate(snapshot.pendingPlanStartsAt);
  const cancelRequestedAt = parseDate(snapshot.cancelRequestedAt);

  const isPaidPlan = snapshot.plan !== "FREE";
  const hasPendingDowngrade = !!(snapshot.pendingPlan || snapshot.pendingPlanId);
  const hasBillingMethod = !!snapshot.payProvider && !!snapshot.hasBillingKey;
  const hasActiveCycle =
    !!planExpiresAt && now.getTime() < planExpiresAt.getTime();
  const cancelScheduled =
    snapshot.membershipStatus === "CANCELED" || !!cancelRequestedAt;

  let state: BillingLifecycleState;
  if (!isPaidPlan) {
    state = "FREE";
  } else if (snapshot.membershipStatus === "PAST_DUE") {
    state = "PAST_DUE";
  } else if (cancelScheduled && hasActiveCycle) {
    state = "CANCELED_ACTIVE";
  } else if (
    snapshot.membershipStatus === "ACTIVE" &&
    hasPendingDowngrade &&
    hasActiveCycle
  ) {
    state = "ACTIVE_PENDING_DOWNGRADE";
  } else if (snapshot.membershipStatus === "ACTIVE" && hasActiveCycle) {
    state = "ACTIVE";
  } else {
    state = "EXPIRED";
  }

  const canUseProduct =
    !isPaidPlan ||
    (snapshot.membershipStatus === "ACTIVE" && hasActiveCycle) ||
    (snapshot.membershipStatus === "PAST_DUE" && hasActiveCycle) ||
    (cancelScheduled && hasActiveCycle);

  let cancelSubscription: ActionDecision;
  if (!isAdmin) cancelSubscription = deny("ADMIN_REQUIRED");
  else if (!isPaidPlan) cancelSubscription = deny("FREE_PLAN");
  else if (cancelScheduled) cancelSubscription = deny("ALREADY_CANCELED");
  else if (state === "EXPIRED") cancelSubscription = deny("SUBSCRIPTION_EXPIRED");
  else cancelSubscription = allow();

  let uncancelSubscription: ActionDecision;
  if (!isAdmin) uncancelSubscription = deny("ADMIN_REQUIRED");
  else if (!isPaidPlan) uncancelSubscription = deny("FREE_PLAN");
  else if (!cancelScheduled) uncancelSubscription = deny("NOT_CANCELED");
  else if (!hasActiveCycle) uncancelSubscription = deny("SUBSCRIPTION_EXPIRED");
  else if (!hasBillingMethod) uncancelSubscription = deny("NO_BILLING_METHOD");
  else uncancelSubscription = allow();

  let changePaymentMethod: ActionDecision;
  if (!isAdmin) changePaymentMethod = deny("ADMIN_REQUIRED");
  else if (!isPaidPlan) changePaymentMethod = deny("FREE_PLAN");
  else if (state === "EXPIRED") changePaymentMethod = deny("SUBSCRIPTION_EXPIRED");
  else changePaymentMethod = allow();

  let unscheduleDowngrade: ActionDecision;
  if (!isAdmin) unscheduleDowngrade = deny("ADMIN_REQUIRED");
  else if (!hasPendingDowngrade || !pendingPlanStartsAt) {
    unscheduleDowngrade = deny("NO_PENDING_CHANGE");
  } else {
    unscheduleDowngrade = allow();
  }

  let recoverPastDue: ActionDecision;
  if (!isAdmin) recoverPastDue = deny("ADMIN_REQUIRED");
  else if (state !== "PAST_DUE") recoverPastDue = deny("NOT_PAST_DUE");
  else if (!hasActiveCycle) recoverPastDue = deny("SUBSCRIPTION_EXPIRED");
  else recoverPastDue = allow();

  return {
    state,
    isPaidPlan,
    hasActiveCycle,
    hasBillingMethod,
    hasPendingDowngrade,
    cancelScheduled,
    canUseProduct,
    actions: {
      cancelSubscription,
      uncancelSubscription,
      changePaymentMethod,
      unscheduleDowngrade,
      recoverPastDue,
    },
  };
}
