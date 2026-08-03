import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  const state = randomBytes(16).toString("hex");

  // 1. URL 쿼리 파라미터에서 mode와 next 값을 가져옵니다.
  const mode = req.nextUrl.searchParams.get("mode") ?? "login"; // login | link
  const next = req.nextUrl.searchParams.get("next") ?? "/"; // 기본값은 홈(/)

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI!);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "consent");

  const res = NextResponse.redirect(authUrl);

  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + 5 * 60 * 1000), // 5분 유효
  };

  // 2. 상태(state), 모드(mode)와 함께 이동할 경로(next)를 쿠키에 저장합니다.
  res.cookies.set("oauth_state", state, cookieOptions);
  res.cookies.set("oauth_mode", mode, cookieOptions);
  res.cookies.set("oauth_next", next, cookieOptions);

  return res;
}
