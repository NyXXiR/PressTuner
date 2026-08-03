import { createHash } from "node:crypto";

const PRODUCT_SUBSCRIPTION_METHOD_PREFIX = "team-product-subscription";

export function createProductSubscriptionPaymentMethodRef(args: {
  subscriptionId: string;
  billingKey: string;
}) {
  const fingerprint = createHash("sha256")
    .update(args.billingKey)
    .digest("hex");
  return `${PRODUCT_SUBSCRIPTION_METHOD_PREFIX}:${args.subscriptionId}:sha256:${fingerprint}`;
}

export function isProductSubscriptionPaymentMethodRefForSubscription(args: {
  reference: string;
  subscriptionId: string;
}) {
  const prefix = `${PRODUCT_SUBSCRIPTION_METHOD_PREFIX}:${args.subscriptionId}:sha256:`;
  const fingerprint = args.reference.startsWith(prefix)
    ? args.reference.slice(prefix.length)
    : "";
  return /^[a-f0-9]{64}$/.test(fingerprint);
}

export function matchesProductSubscriptionPaymentMethodRef(args: {
  reference: string;
  subscriptionId: string;
  billingKey: string;
}) {
  return (
    args.reference ===
    createProductSubscriptionPaymentMethodRef({
      subscriptionId: args.subscriptionId,
      billingKey: args.billingKey,
    })
  );
}
