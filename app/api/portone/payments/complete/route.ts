// app/api/portone/payments/complete/route.ts
import { NextResponse } from "next/server";
import {
  isPlanAvailableForPurchase,
  isPlanId,
  type PlanId,
} from "@/config/billing/plans";
import { isPayProvider, type PayProvider } from "@/config/billing/options";
import { requireTeamContext, isAdmin } from "@/lib/auth";
import { completeOrRecoverSubscriptionChange } from "@/domain/billing/subscription/completeOrRecoverSubscriptionChange";
import { parseBillingCustomerInput } from "@/domain/billing/subscription/paymentConfirmation";
import { trackOpsEvent } from "@/lib/ops";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";

const LEGACY_DIRECT_COMPLETE_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_LEGACY_DIRECT_BILLING_COMPLETE === "true";

function normalizeAttemptId(v: any): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (s.length < 8) {
    return null;
  }
  return s;
}

export async function POST(req: Request) {
  if (!LEGACY_DIRECT_COMPLETE_ENABLED) {
    return NextResponse.json(
      apiError(
        "LEGACY_DIRECT_BILLING_COMPLETE_DISABLED",
        "LEGACY_DIRECT_BILLING_COMPLETE_DISABLED",
        410,
      ).body,
      { status: 410 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    planId?: unknown;
    payProvider?: unknown;
    billingKey?: unknown;
    customer?: unknown;
    attemptId?: unknown;
    couponCode?: unknown;
  };

  if (!isPlanId(body.planId)) {
    return NextResponse.json(
      apiError("INVALID_PLAN", "INVALID_PLAN", 400).body,
      { status: 400 }
    );
  }
  const planId = body.planId as PlanId;

  if (!isPlanAvailableForPurchase(planId)) {
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
  const payProvider = body.payProvider as PayProvider;

  const billingKey =
    typeof body.billingKey === "string" && body.billingKey.trim()
      ? body.billingKey.trim()
      : null;

  if (!billingKey) {
    return NextResponse.json(
      apiError("MISSING_BILLING_KEY", "MISSING_BILLING_KEY", 400).body,
      { status: 400 }
    );
  }

  const attemptId = normalizeAttemptId(body.attemptId);
  if (!attemptId) {
    return NextResponse.json(
      apiError("MISSING_ATTEMPT_ID", "MISSING_ATTEMPT_ID", 400).body,
      { status: 400 }
    );
  }

  try {
    const { team, role, user } = await requireTeamContext();
    if (!team?.id || !isAdmin(role)) {
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 }
      );
    }

    const done = await completeOrRecoverSubscriptionChange({
      teamId: team.id,
      userId: user.id,
      planId,
      payProvider,
      billingKey,
      customer: parseBillingCustomerInput(body.customer),
      attemptId,
      couponCode:
        typeof body.couponCode === "string" ? body.couponCode : null,
    });

    void trackOpsEvent({
      event: "purchase_completed",
      userId: user.id,
      sessionId: attemptId,
      properties: {
        teamId: team.id,
        planId,
        payProvider,
        hasCoupon: typeof body.couponCode === "string" && !!body.couponCode.trim(),
      },
    });

    return NextResponse.json({ ok: true, ...done });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    const err = apiError(
      e?.code ?? "COMPLETE_INTERNAL_ERROR",
      e?.message ?? "COMPLETE_INTERNAL_ERROR",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
