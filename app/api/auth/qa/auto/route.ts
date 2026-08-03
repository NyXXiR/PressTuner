import { NextRequest, NextResponse } from "next/server";

import {
  isDevApiPlaygroundAutoSessionEligible,
} from "@/lib/devApiPlayground";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import {
  bootstrapQaPlaygroundSession,
  readQaAuthConfig,
} from "@/lib/services/qaAuthService";

export const dynamic = "force-dynamic";

const PLAYGROUND_PATH = "/dev/api-playground";
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
function isHttps(request: NextRequest) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  if (forwardedProtocol) {
    return forwardedProtocol.split(",")[0]?.trim() === "https";
  }
  return request.nextUrl.protocol === "https:";
}

export async function GET(request: NextRequest) {
  if (!isDevApiPlaygroundAutoSessionEligible()) return notFound();
  const config = readQaAuthConfig();
  if (!config) return notFound();

  try {
    const bootstrapped = await bootstrapQaPlaygroundSession({
      config,
      host: request.nextUrl.host,
    });
    const response = NextResponse.redirect(
      new URL(PLAYGROUND_PATH, request.url),
    );
    response.headers.set("Cache-Control", PRIVATE_RESPONSE_HEADERS["Cache-Control"]);
    response.headers.set(
      "Referrer-Policy",
      PRIVATE_RESPONSE_HEADERS["Referrer-Policy"],
    );
    response.cookies.set(SESSION_COOKIE_NAME, bootstrapped.session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps(request),
      path: "/",
      expires: bootstrapped.session.expiresAt,
    });
    return response;
  } catch {
    return notFound();
  }
}
