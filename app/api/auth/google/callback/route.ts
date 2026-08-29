import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, getSession } from "@/lib/session";
import {
  finalizeOAuthLogin,
  linkGoogleAccountToUser,
  resolveGoogleLogin,
} from "@/lib/services/oauthService";
import {
  isTransientDatabaseConnectionError,
  withTransientDatabaseRetry,
} from "@/lib/services/transientDatabaseRetry";

// ----------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------

async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    grant_type: "authorization_code",
  });

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(await resp.text());
  return (await resp.json()) as { access_token: string };
}

async function fetchGoogleUser(accessToken: string) {
  const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!resp.ok) throw new Error(await resp.text());
  return (await resp.json()) as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
    email_verified?: boolean;
  };
}

// ----------------------------------------------------------------------
// Main Route Handler
// ----------------------------------------------------------------------

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const { cookies } = await import("next/headers");
  const store = await cookies();

  const stateCookie = store.get("oauth_state")?.value;
  const mode = store.get("oauth_mode")?.value ?? "login"; // login | link

  // 1. 쿠키에서 돌아갈 경로(next)를 꺼냅니다.
  const rawNext = store.get("oauth_next")?.value;
  const nextUrl = rawNext && rawNext.startsWith("/") ? rawNext : "/";

  // 쿠키 정리 헬퍼 함수 (로그인 완료/에러 시 호출)
  const clearOauthCookies = (res: NextResponse) => {
    for (const name of ["oauth_state", "oauth_mode", "oauth_next"]) {
      res.cookies.set(name, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: new Date(0),
      });
    }
  };

  // OAuth 상태 검증
  if (!code || !state || !stateCookie || stateCookie !== state) {
    const res = NextResponse.redirect(
      new URL("/login?error=oauth_state", process.env.NEXT_PUBLIC_APP_URL),
    );
    clearOauthCookies(res);
    return res;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const g = await fetchGoogleUser(tokens.access_token);

    const providerAccountId = g.sub;

    // ==================================================================
    // (A) 연동 모드: "현재 로그인된 계정"에 소셜 연결
    // ==================================================================
    if (mode === "link") {
      const session = await getSession();
      if (!session) {
        const res = NextResponse.redirect(
          new URL(
            "/login?error=need_login_to_link",
            process.env.NEXT_PUBLIC_APP_URL,
          ),
        );
        clearOauthCookies(res);
        return res;
      }

      try {
        await withTransientDatabaseRetry(() =>
          linkGoogleAccountToUser({
            userId: session.userId,
            providerAccountId,
            email: g.email,
            name: g.name,
            picture: g.picture,
            emailVerified: g.email_verified,
          }),
        );
      } catch (e: any) {
        const res = NextResponse.redirect(
          new URL(
            "/press/dashboard?error=oauth_already_linked",
            process.env.NEXT_PUBLIC_APP_URL,
          ),
        );
        clearOauthCookies(res);
        return res;
      }

      const res = NextResponse.redirect(
        new URL("/press/dashboard?linked=google", process.env.NEXT_PUBLIC_APP_URL),
      );
      clearOauthCookies(res);
      return res;
    }

    // ==================================================================
    // (B) 로그인 모드: 소셜 로그인
    // ==================================================================
    const resolved = await withTransientDatabaseRetry(() =>
      resolveGoogleLogin({
        providerAccountId,
        email: g.email,
        name: g.name,
        picture: g.picture,
        emailVerified: g.email_verified,
      }),
    );

    if (!resolved.userId) {
      const res = NextResponse.redirect(
        new URL("/signup/terms", process.env.NEXT_PUBLIC_APP_URL),
      );

      res.cookies.set("pending_signup_user", JSON.stringify(resolved.signupPayload), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 5 * 60,
      });

      res.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
      res.cookies.set("oauth_mode", "", { maxAge: 0, path: "/" });

      return res;
    }

    // ==================================================================
    // 로그인 성공 처리 (기존 가입자 or 이메일 연동자)
    // ==================================================================
    const { session } = await withTransientDatabaseRetry(() =>
      finalizeOAuthLogin(resolved.userId),
    );

    const res = NextResponse.redirect(
      new URL(nextUrl, process.env.NEXT_PUBLIC_APP_URL),
    );

    res.cookies.set(SESSION_COOKIE_NAME, session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: session.expiresAt,
    });

    clearOauthCookies(res);
    return res;
  } catch (e) {
    console.error(e);
    const errorCode = isTransientDatabaseConnectionError(e)
      ? "oauth_database_unavailable"
      : "oauth_failed";
    const res = NextResponse.redirect(
      new URL(`/login?error=${errorCode}`, process.env.NEXT_PUBLIC_APP_URL),
    );
    clearOauthCookies(res);
    return res;
  }
}
