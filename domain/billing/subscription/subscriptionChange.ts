export type SubscriptionChangePaymentStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "CONFIRMED"
  | "FAILED"
  | "REFUNDED";

export type SubscriptionChangeApplyStatus =
  | "PENDING"
  | "APPLIED"
  | "FAILED"
  | "COMPENSATION_PENDING"
  | "COMPENSATED"
  | "MANUAL_REVIEW";

export type SubscriptionChangeState = Readonly<{
  paymentStatus: SubscriptionChangePaymentStatus;
  applyStatus: SubscriptionChangeApplyStatus;
}>;

export type SubscriptionChangeEvent =
  | { type: "PAYMENT_CONFIRMED" }
  | { type: "PAYMENT_FAILED" }
  | { type: "APPLY_SUCCEEDED" }
  | { type: "APPLY_FAILED" }
  | { type: "COMPENSATION_REQUIRED" }
  | { type: "COMPENSATED" }
  | { type: "CANCELLED" }
  | { type: "REQUIRE_MANUAL_REVIEW" };

function illegal(
  state: SubscriptionChangeState,
  event: SubscriptionChangeEvent,
): never {
  throw new Error(
    `SUBSCRIPTION_CHANGE_ILLEGAL_TRANSITION:${state.paymentStatus}/${state.applyStatus}->${event.type}`,
  );
}

function paymentAllowsApply(status: SubscriptionChangePaymentStatus) {
  return status === "CONFIRMED" || status === "NOT_REQUIRED";
}

export function createSubscriptionChangeState(args: {
  paymentRequired: boolean;
}): SubscriptionChangeState {
  return {
    paymentStatus: args.paymentRequired ? "PENDING" : "NOT_REQUIRED",
    applyStatus: "PENDING",
  };
}

export function transitionSubscriptionChange(
  state: SubscriptionChangeState,
  event: SubscriptionChangeEvent,
): SubscriptionChangeState {
  switch (event.type) {
    case "PAYMENT_CONFIRMED":
      if (state.paymentStatus !== "PENDING" || state.applyStatus !== "PENDING") {
        return illegal(state, event);
      }
      return { ...state, paymentStatus: "CONFIRMED" };

    case "PAYMENT_FAILED":
      if (state.paymentStatus !== "PENDING" || state.applyStatus !== "PENDING") {
        return illegal(state, event);
      }
      return { ...state, paymentStatus: "FAILED" };

    case "APPLY_SUCCEEDED":
      if (
        !paymentAllowsApply(state.paymentStatus) ||
        !["PENDING", "FAILED"].includes(state.applyStatus)
      ) {
        return illegal(state, event);
      }
      return { ...state, applyStatus: "APPLIED" };

    case "APPLY_FAILED":
      if (
        !paymentAllowsApply(state.paymentStatus) ||
        !["PENDING", "FAILED"].includes(state.applyStatus)
      ) {
        return illegal(state, event);
      }
      return { ...state, applyStatus: "FAILED" };

    case "COMPENSATION_REQUIRED":
      if (state.paymentStatus !== "CONFIRMED" || state.applyStatus !== "FAILED") {
        return illegal(state, event);
      }
      return { ...state, applyStatus: "COMPENSATION_PENDING" };

    case "COMPENSATED":
      if (
        state.paymentStatus !== "CONFIRMED" ||
        state.applyStatus !== "COMPENSATION_PENDING"
      ) {
        return illegal(state, event);
      }
      return { paymentStatus: "REFUNDED", applyStatus: "COMPENSATED" };

    case "CANCELLED":
      if (!["PENDING", "FAILED"].includes(state.applyStatus)) {
        return illegal(state, event);
      }
      return { ...state, applyStatus: "MANUAL_REVIEW" };

    case "REQUIRE_MANUAL_REVIEW":
      if (!['FAILED', 'COMPENSATION_PENDING'].includes(state.applyStatus)) {
        return illegal(state, event);
      }
      return { ...state, applyStatus: "MANUAL_REVIEW" };
  }
}
