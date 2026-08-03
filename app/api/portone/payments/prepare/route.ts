// app/api/portone/payments/prepare/route.ts
import { NextResponse } from "next/server";
import {
  isPlanAvailableForPurchase,
  isPlanId,
  type PlanId,
} from "@/config/billing/plans";
import { isPayProvider, type PayProvider } from "@/config/billing/options";
import { prepareBillingKeyIssue } from "@/domain/billing/portone/prepareBillingKeyIssue";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";

const LEGACY_DIRECT_PREPARE_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_LEGACY_DIRECT_BILLING_PREPARE === "true";

/**
 * billing key 발급 준비 (PortOne browser-sdk v2: requestIssueBillingKey)
 */
export async function POST(req: Request) {
  if (!LEGACY_DIRECT_PREPARE_ENABLED) {
    return NextResponse.json(
      apiError(
        "LEGACY_DIRECT_BILLING_PREPARE_DISABLED",
        "LEGACY_DIRECT_BILLING_PREPARE_DISABLED",
        410,
      ).body,
      { status: 410 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    planId?: unknown;
    payProvider?: unknown;
    couponCode?: unknown;
    mobile?: unknown;
  };

  if (!isPlanId(body.planId)) {
    return NextResponse.json(
      apiError("INVALID_PLAN", "INVALID_PLAN", 400).body,
      { status: 400 }
    );
  }
  if (!isPlanAvailableForPurchase(body.planId)) {
    return NextResponse.json(
      apiError("PLAN_NOT_AVAILABLE", "PLAN_NOT_AVAILABLE", 400).body,
      { status: 400 }
    );
  }
  if (!isPayProvider(body.payProvider)) {
    return NextResponse.json(
      apiError("INVALID_PAY_PROVIDER", "INVALID_PAY_PROVIDER", 400).body,
      { status: 400 }
    );
  }

  try {
    const forwardedProto = req.headers.get("x-forwarded-proto");
    const forwardedHost = req.headers.get("x-forwarded-host");
    const requestOrigin =
      req.headers.get("origin") ||
      (forwardedProto && forwardedHost
        ? `${forwardedProto}://${forwardedHost}`
        : undefined);

    const payload = prepareBillingKeyIssue({
      planId: body.planId as PlanId,
      payProvider: body.payProvider as PayProvider,
      couponCode:
        typeof body.couponCode === "string" ? body.couponCode : null,
      mobile: body.mobile === true,
      appUrl: requestOrigin,
    });

    return NextResponse.json(payload);
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    const err = apiError("PREPARE_FAILED", e?.message ?? "PREPARE_FAILED", status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
