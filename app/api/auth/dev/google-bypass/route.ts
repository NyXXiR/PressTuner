import { NextRequest, NextResponse } from "next/server";

import {
  DEV_GOOGLE_BYPASS_EMAIL,
  isDevGoogleBypassEligible,
  sanitizeDevLoginNextPath,
} from "@/lib/auth/devGoogleBypass";
import { prisma } from "@/lib/prisma";
import { issueSessionForUser } from "@/lib/services/oauthService";
import {
  isTransientDatabaseConnectionError,
  withTransientDatabaseRetry,
} from "@/lib/services/transientDatabaseRetry";
import { SESSION_COOKIE_NAME } from "@/lib/session";

export const dynamic = "force-dynamic";

function notFound() {
  return NextResponse.json(
    { error: "NOT_FOUND", message: "Not found." },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

function isHttps(request: NextRequest) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  if (forwardedProtocol) return forwardedProtocol.split(",")[0]?.trim() === "https";
  return request.nextUrl.protocol === "https:";
}

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") ?? request.nextUrl.host;
  if (!isDevGoogleBypassEligible(process.env, host)) return notFound();

  const nextPath = sanitizeDevLoginNextPath(request.nextUrl.searchParams.get("next"));

  try {
    const user = await withTransientDatabaseRetry(() =>
      prisma.user.findUnique({
        where: { email: DEV_GOOGLE_BYPASS_EMAIL },
        select: { id: true },
      }),
    );

    if (!user) {
      return NextResponse.redirect(new URL("/login?error=dev_account_missing", request.url));
    }

    const { session } = await withTransientDatabaseRetry(() =>
      issueSessionForUser(user.id),
    );
    const response = NextResponse.redirect(new URL(nextPath, request.url));
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(SESSION_COOKIE_NAME, session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps(request),
      path: "/",
      expires: session.expiresAt,
    });
    return response;
  } catch (error) {
    console.error("Development Google login bypass failed", error);
    const code = isTransientDatabaseConnectionError(error)
      ? "oauth_database_unavailable"
      : "dev_login_failed";
    return NextResponse.redirect(new URL(`/login?error=${code}`, request.url));
  }
}
