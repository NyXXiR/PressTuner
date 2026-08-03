import { NextRequest, NextResponse } from "next/server";

import {
  isQaAuthSecretValid,
  issueQaLoginTicket,
  readQaAuthConfig,
  sanitizeQaAuthNextPath,
} from "@/lib/services/qaAuthService";

export const dynamic = "force-dynamic";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function notFound() {
  return NextResponse.json(
    { error: "NOT_FOUND", message: "Not found." },
    { status: 404, headers: PRIVATE_RESPONSE_HEADERS },
  );
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  return match?.[1] ?? null;
}

export async function POST(request: NextRequest) {
  const config = readQaAuthConfig();
  if (!config || !isQaAuthSecretValid(config, bearerToken(request))) {
    return notFound();
  }

  try {
    const body = await request.json().catch(() => null);
    const nextPath = sanitizeQaAuthNextPath(
      typeof body?.next === "string" ? body.next : null,
    );
    const ticket = await issueQaLoginTicket({
      config,
      host: request.nextUrl.host,
    });
    const loginUrl = new URL("/api/auth/qa/redeem", request.url);
    loginUrl.searchParams.set("token", ticket.token);
    loginUrl.searchParams.set("next", nextPath);

    console.info(
      JSON.stringify({
        event: "ai_qa_auth_ticket_issued",
        userId: ticket.userId,
        teamId: ticket.teamId,
        expiresAt: ticket.expiresAt.toISOString(),
      }),
    );

    return NextResponse.json(
      {
        loginUrl: loginUrl.toString(),
        expiresAt: ticket.expiresAt.toISOString(),
      },
      { status: 201, headers: PRIVATE_RESPONSE_HEADERS },
    );
  } catch (error: any) {
    if (error?.status === 404) return notFound();
    console.error("AI QA auth ticket issue failed", {
      code: error?.code ?? "UNKNOWN",
    });
    return NextResponse.json(
      {
        error: "QA_AUTH_ISSUE_FAILED",
        message: "Unable to issue a QA login link.",
      },
      { status: 500, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
}
