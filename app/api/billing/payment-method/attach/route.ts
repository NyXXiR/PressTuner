// app/api/billing/payment-method/attach/route.ts
import { NextResponse } from "next/server";
import { requireTeamContext, isAdmin } from "@/lib/auth";
import { isPayProvider, type PayProvider } from "@/config/billing/options";
import { apiError } from "@/lib/utils/api";
import { attachPaymentMethodForTeam } from "@/lib/services/billing/subscriptionService";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    payProvider?: unknown;
    billingKey?: unknown;
    recoverPastDue?: unknown;
    product?: unknown;
  };

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
  const recoverPastDue = body.recoverPastDue === true;
  const product = body.product === "PRESS" || body.product === "CAREER" ? body.product : null;

  if (!billingKey) {
    return NextResponse.json(
      apiError("MISSING_BILLING_KEY", "MISSING_BILLING_KEY", 400).body,
      { status: 400 }
    );
  }
  if (!product) {
    return NextResponse.json(
      apiError("PRODUCT_REQUIRED", "PRODUCT_REQUIRED", 400).body,
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

    const updated = await attachPaymentMethodForTeam({
      teamId: team.id,
      provider: payProvider,
      billingKey,
      userId: user?.id,
      recoverPastDue,
      product,
    });

    return NextResponse.json({ ok: true, ...updated });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status === 401) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "UNAUTHORIZED", 401).body,
        { status: 401 }
      );
    }
    if (e?.code === "PAST_DUE_RECOVERY_FAILED") {
      return NextResponse.json(
        {
          ok: false,
          error: e.code,
          message: e.message,
          paymentMethodAttached: !!e?.details?.paymentMethodAttached,
          team: e?.details?.attachedTeam ?? null,
          recoveryError: e?.details?.recoveryError ?? null,
        },
        { status }
      );
    }
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "INTERNAL_ERROR",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
