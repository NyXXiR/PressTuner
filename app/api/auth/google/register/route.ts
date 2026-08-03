import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { cookies } from "next/headers";
import { apiError } from "@/lib/utils/api";
import { AuthProvider } from "@prisma/client";
import { trackOpsEvent } from "@/lib/ops";
import { registerWithGoogle } from "@/lib/services/oauthService";

export async function POST(req: Request) {
  const store = await cookies();
  const pendingCookie = store.get("pending_signup_user");
  const nextCookie = store.get("oauth_next");

  if (!pendingCookie) {
    const err = apiError("NO_PENDING_SIGNUP", "No pending signup", 400);
    return NextResponse.json(err.body, { status: err.status });
  }

  let payload;
  try {
    payload = JSON.parse(pendingCookie.value);
  } catch (e) {
    const err = apiError("INVALID_COOKIE", "Invalid cookie data", 400);
    return NextResponse.json(err.body, { status: err.status });
  }

  const { provider, providerAccountId, email, name, picture, emailVerified } = payload;

  try {
    const next =
      nextCookie?.value && nextCookie.value.startsWith("/")
        ? nextCookie.value
        : "/my/dashboard";

    const { session, userId } = await registerWithGoogle({
      provider: provider as AuthProvider,
      providerAccountId,
      email,
      name,
      picture,
      emailVerified: emailVerified === true,
    });

    void trackOpsEvent({
      event: "signup_completed",
      userId,
      properties: {
        provider,
        hasEmail: !!email,
      },
    });

    const res = NextResponse.json({ success: true, next });
    res.cookies.set(SESSION_COOKIE_NAME, session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      expires: session.expiresAt,
      path: "/",
    });

    res.cookies.set("pending_signup_user", "", { maxAge: 0, path: "/" });
    res.cookies.set("oauth_next", "", { maxAge: 0, path: "/" });

    return res;
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "REGISTRATION_FAILED",
      e?.message ?? "Registration failed",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
