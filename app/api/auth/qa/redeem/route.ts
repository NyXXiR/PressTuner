import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/session";
import {
  readQaAuthConfig,
  redeemQaLoginTicket,
  sanitizeQaAuthNextPath,
} from "@/lib/services/qaAuthService";

export const dynamic = "force-dynamic";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function notFound() {
  return NextResponse.json(
    {
      error: "QA_AUTH_LINK_INVALID",
      message: "This QA login link is invalid or expired.",
    },
    { status: 404, headers: PRIVATE_RESPONSE_HEADERS },
  );
}

function isHttps(request: NextRequest) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  if (forwardedProtocol) {
    return forwardedProtocol.split(",")[0]?.trim() === "https";
  }
  return request.nextUrl.protocol === "https:";
}

export async function GET(request: NextRequest) {
  const config = readQaAuthConfig();
  if (!config) return notFound();

  try {
    const redeemed = await redeemQaLoginTicket({
      config,
      host: request.nextUrl.host,
      token: request.nextUrl.searchParams.get("token") ?? "",
    });
    const nextPath = sanitizeQaAuthNextPath(
      request.nextUrl.searchParams.get("next"),
    );
    const response = NextResponse.redirect(new URL(nextPath, request.url));
    response.headers.set("Cache-Control", PRIVATE_RESPONSE_HEADERS["Cache-Control"]);
    response.headers.set(
      "Referrer-Policy",
      PRIVATE_RESPONSE_HEADERS["Referrer-Policy"],
    );
    response.cookies.set(SESSION_COOKIE_NAME, redeemed.session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps(request),
      path: "/",
      expires: redeemed.session.expiresAt,
    });

    console.info(
      JSON.stringify({
        event: "ai_qa_auth_ticket_redeemed",
        userId: redeemed.userId,
        teamId: redeemed.teamId,
        expiresAt: redeemed.session.expiresAt.toISOString(),
      }),
    );

    return response;
  } catch (error: any) {
    if (error?.status === 404) return notFound();
    console.error("AI QA auth ticket redemption failed", {
      code: error?.code ?? "UNKNOWN",
    });
    return NextResponse.json(
      {
        error: "QA_AUTH_REDEEM_FAILED",
        message: "Unable to redeem the QA login link.",
      },
      { status: 500, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
}
