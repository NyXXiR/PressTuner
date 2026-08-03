// app/api/portone/billing-keys/issue-inicis/route.ts
import { NextResponse } from "next/server";
import { apiError } from "@/lib/utils/api";
import { isAdmin, requireTeamContext } from "@/lib/auth";
import { issueBillingKeyWithCard } from "@/domain/billing/portone/issueBillingKeyWithCard";

export const runtime = "nodejs";

const LEGACY_RAW_CARD_ISSUE_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_LEGACY_RAW_CARD_BILLING_KEY_ISSUE === "true";

export async function POST(req: Request) {
  if (!LEGACY_RAW_CARD_ISSUE_ENABLED) {
    return NextResponse.json(
      apiError(
        "LEGACY_RAW_CARD_BILLING_KEY_ISSUE_DISABLED",
        "LEGACY_RAW_CARD_BILLING_KEY_ISSUE_DISABLED",
        410,
      ).body,
      { status: 410 },
    );
  }

  try {
    const { role } = await requireTeamContext();
    if (!isAdmin(role)) {
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 }
      );
    }

    const body = (await req.json().catch(() => ({}))) as {
      customerId?: unknown;
      customerName?: unknown;
      customerEmail?: unknown;
      customerPhoneNumber?: unknown;

      cardNumber?: unknown;
      expiryYear?: unknown; // YY or YYYY
      expiryMonth?: unknown; // MM
      birthOrBizNo?: unknown; // YYMMDD or biz no
      passwordTwoDigits?: unknown; // 2 digits
    };

    const take = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const issued = await issueBillingKeyWithCard({
      customerId: take(body.customerId),
      customerName: take(body.customerName),
      customerEmail: take(body.customerEmail),
      customerPhoneNumber: take(body.customerPhoneNumber),
      cardNumber: take(body.cardNumber),
      expiryYear: take(body.expiryYear),
      expiryMonth: take(body.expiryMonth),
      birthOrBizNo: take(body.birthOrBizNo),
      passwordTwoDigits: take(body.passwordTwoDigits),
    });

    return NextResponse.json({
      ok: true,
      billingKey: issued.billingKey,
      raw: issued.raw,
      customer: issued.customer,
    });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status === 401) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "UNAUTHORIZED", 401).body,
        { status: 401 }
      );
    }
    if (status === 403) {
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 }
      );
    }
    return NextResponse.json(
      apiError(
        e?.code ?? "INTERNAL_ERROR",
        e?.message ?? "INTERNAL_ERROR",
        status,
        e?.details ? { details: e.details } : undefined,
      ).body,
      { status },
    );
  }
}
