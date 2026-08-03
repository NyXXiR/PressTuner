import { NextResponse } from "next/server";
import { requireTeamContext, isAdmin } from "@/lib/auth";
import { isPayProvider, type PayProvider } from "@/config/billing/options";
import {
  getTrustedAppUrl,
  getPortOneStoreId,
  resolvePortOneChannel,
} from "@/config/billing/portone.server";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { role, user } = await requireTeamContext();
    if (!isAdmin(role)) {
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 }
      );
    }

  const body = (await req.json().catch(() => ({}))) as {
    payProvider?: unknown;
    recoverPastDue?: unknown;
    surface?: unknown;
    product?: unknown;
  };

    if (!isPayProvider(body.payProvider)) {
      return NextResponse.json(
        apiError("INVALID_PAY_PROVIDER", "INVALID_PAY_PROVIDER", 400).body,
        { status: 400 }
      );
    }

    const payProvider = body.payProvider as PayProvider;
    const product =
      body.product === "PRESS" || body.product === "CAREER"
        ? body.product
        : null;
    const surface = body.surface === "press" ? "press" : body.surface === "resume" ? "resume" : null;

    if (!product) {
      return NextResponse.json(
        apiError("PRODUCT_REQUIRED", "PRODUCT_REQUIRED", 400).body,
        { status: 400 }
      );
    }
    if (!surface) {
      return NextResponse.json(
        apiError("INVALID_SURFACE", "INVALID_SURFACE", 400).body,
        { status: 400 }
      );
    }

    const surfaceByProduct = product === "PRESS" ? "press" : "resume";
    if (surface !== surfaceByProduct) {
      return NextResponse.json(
        apiError("SURFACE_PRODUCT_MISMATCH", "SURFACE_PRODUCT_MISMATCH", 400).body,
        { status: 400 }
      );
    }

    const storeId = getPortOneStoreId();
    const channel = resolvePortOneChannel(payProvider, "BILLING_KEY");

    const appUrl = getTrustedAppUrl(req);
    const redirectParams = new URLSearchParams({
      provider: payProvider,
      surface,
      product,
    });
    if (body.recoverPastDue === true) {
      redirectParams.set("recover", "1");
    }

    const redirectUrl = `${appUrl}/billing/payment-method/complete?${redirectParams.toString()}`;
    const userName = user.label?.trim() || user.loginId?.trim() || "PressTuner 사용자";
    const customer = {
      customerId: user.id,
      fullName: userName,
      ...(user.email ? { email: user.email } : {}),
    };

    return NextResponse.json({
      ok: true,
      kind: "BILLING_KEY_ISSUE",

      storeId,
      channelGroupId: channel.channelGroupId ?? null,
      channelKey: channel.channelKey ?? null,

      billingKeyMethod: payProvider === "kakaopay" ? "EASY_PAY" : "CARD",

      issueName: payProvider === "kakaopay" ? "KAKAOPAY" : "INICIS",

      customer,
      customData: {
        kind: "CHANGE_PAYMENT_METHOD",
        payProvider,
        product,
      },
      redirectUrl,
      windowType: {
        pc: "IFRAME",
        mobile: "REDIRECTION",
      },
    });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    const err = apiError(
      "BILLING_KEY_PREPARE_ERROR",
      e?.message ?? "BILLING_KEY_PREPARE_ERROR",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
