// app/api/login/route.ts
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/utils/api";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { loginWithPassword } from "@/lib/services/authService";

function isHttps(req: NextRequest) {
  const xfProto = req.headers.get("x-forwarded-proto");
  if (xfProto) return xfProto.split(",")[0].trim() === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const loginId = body?.loginId;
  const password = body?.password;

  if (!loginId || !password) {
    const err = apiError(
      "MISSING_CREDENTIALS",
      "아이디와 비밀번호를 모두 입력해주세요.",
      400
    );
    return NextResponse.json(err.body, { status: err.status });
  }

  try {
    const { user, team: activeTeam, usage, session } = await loginWithPassword({
      loginId: String(loginId),
      password: String(password),
    });

    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, loginId: user.loginId, label: user.label },
      team: { id: activeTeam.id, slug: activeTeam.slug, name: activeTeam.name },
      usage,
    });

    res.cookies.set(SESSION_COOKIE_NAME, session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: isHttps(req),
      path: "/",
      expires: session.expiresAt,
    });

    return res;
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "LOGIN_FAILED",
      e?.message ?? "로그인에 실패했습니다.",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
