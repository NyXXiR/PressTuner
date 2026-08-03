// src/domain/billing/portone/prepareBillingKeyIssue.ts
import type { PayProvider } from "@/config/billing/options";
import { PAY_PROVIDER_OPTIONS } from "@/config/billing/options";
import { getPlan, type PlanId } from "@/config/billing/plans";
import {
  getAppUrl,
  getPortOneStoreId,
  resolvePortOneChannel,
} from "@/config/billing/portone.server";
import { buildBillingCheckoutAbsoluteUrl } from "@/domain/billing/portone/billingCheckoutRedirect";

function err(status: number, message: string) {
  const e = new Error(message) as Error & { status?: number };
  e.status = status;
  return e;
}

function createShortIssueId(planCode: string) {
  // ✅ .slice(0, 20) 추가
  // 이렇게 하면 랜덤 문자열이 20자가 되어, 전체 길이가 약 29~30자가 됩니다.
  const randShort = crypto.randomUUID().replace(/-/g, "").slice(0, 20);

  return `bi_${planCode}_${randShort}`;
}

function optionalString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildCustomer(input?: {
  customerId?: string | null;
  fullName?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
}) {
  const fullName = optionalString(input?.fullName) ?? "PressTuner 사용자";
  return {
    ...(optionalString(input?.customerId) ? { customerId: optionalString(input?.customerId) } : {}),
    fullName,
    ...(optionalString(input?.email) ? { email: optionalString(input?.email) } : {}),
    ...(optionalString(input?.phoneNumber)
      ? { phoneNumber: optionalString(input?.phoneNumber) }
      : {}),
  };
}

export function prepareBillingKeyIssue(args: {
  planId: PlanId;
  payProvider: PayProvider;
  couponCode?: string | null;
  mobile?: boolean;
  appUrl?: string;
  redirectUrlOverride?: string;
  customer?: {
    customerId?: string | null;
    fullName?: string | null;
    email?: string | null;
    phoneNumber?: string | null;
  };
}) {
  const opt = PAY_PROVIDER_OPTIONS.find((p) => p.id === args.payProvider);
  if (!opt?.enabled) throw err(400, "PAY_PROVIDER_DISABLED");

  const plan = getPlan(args.planId);

  const storeId = getPortOneStoreId();
  const channel = resolvePortOneChannel(args.payProvider, "BILLING_KEY");

  const issueId = createShortIssueId(plan.code);

  const customer = buildCustomer(args.customer);

  const redirectUrl =
    args.redirectUrlOverride ??
    buildBillingCheckoutAbsoluteUrl(args.appUrl ?? getAppUrl(), {
      planId: args.planId,
      payProvider: args.payProvider,
      couponCode: args.couponCode ?? null,
      mobile: !!args.mobile,
    });

  const customData = {
    v: 1,
    kind: "BILLING_KEY_ISSUE",
    planId: args.planId,
    product: plan.product,
    payProvider: args.payProvider,
  };

  const billingKeyMethod =
    args.payProvider === "kakaopay" ? "EASY_PAY" : "CARD";

  return {
    ok: true as const,
    kind: "BILLING_KEY_ISSUE" as const,

    storeId,
    channelGroupId: null as string | null,
    channelKey: channel.channelKey ?? null,

    billingKeyMethod,
    issueId,
    issueName: `${plan.name} 결제수단 등록`,

    windowType: { pc: "IFRAME", mobile: "REDIRECTION" },

    customer,
    customData,
    redirectUrl,
  };
}
