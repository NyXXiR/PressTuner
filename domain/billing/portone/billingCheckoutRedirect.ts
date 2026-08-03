import { isPayProvider, type PayProvider } from "@/config/billing/options";

type BuildBillingCheckoutPathArgs = {
  planId: string;
  payProvider: PayProvider;
  couponCode?: string | null;
  mobile?: boolean;
};

export type BillingCheckoutRedirectResult = {
  planId: string | null;
  payProvider: PayProvider | null;
  couponCode: string | null;
  mobile: boolean;
  billingKey: string | null;
  code: string | null;
  message: string | null;
  pgCode: string | null;
  pgMessage: string | null;
  hasResult: boolean;
};

export function buildBillingCheckoutPath(
  args: BuildBillingCheckoutPathArgs
): string {
  const params = new URLSearchParams();
  params.set("plan", args.planId);
  params.set("provider", args.payProvider);
  if (args.mobile) params.set("mobile", "1");
  if (args.couponCode && args.couponCode.trim()) {
    params.set("coupon", args.couponCode.trim());
  }
  return `/billing/checkout?${params.toString()}`;
}

export function buildBillingCheckoutAbsoluteUrl(
  baseUrl: string,
  args: BuildBillingCheckoutPathArgs
): string {
  return new URL(buildBillingCheckoutPath(args), baseUrl).toString();
}

function readStringParam(sp: URLSearchParams, key: string): string | null {
  const value = sp.get(key);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseBillingCheckoutRedirect(
  sp: URLSearchParams
): BillingCheckoutRedirectResult {
  const rawProvider = readStringParam(sp, "provider");
  const payProvider = isPayProvider(rawProvider) ? rawProvider : null;
  const billingKey = readStringParam(sp, "billingKey");
  const code = readStringParam(sp, "code");
  const message = readStringParam(sp, "message");
  const pgCode = readStringParam(sp, "pgCode");
  const pgMessage = readStringParam(sp, "pgMessage");

  return {
    planId: readStringParam(sp, "plan"),
    payProvider,
    couponCode: readStringParam(sp, "coupon"),
    mobile: sp.get("mobile") === "1",
    billingKey,
    code,
    message,
    pgCode,
    pgMessage,
    hasResult: !!(billingKey || code || pgCode || pgMessage),
  };
}
