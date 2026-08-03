// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { getSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { deleteSessionById } from "@/lib/services/sessionService";

export async function POST() {
  const session = await getSession();
  const res = NextResponse.json({ ok: true });

  if (session) {
    await deleteSessionById(session.id);
  }

  res.cookies.set(SESSION_COOKIE_NAME, "", {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
  });

  return res;
}
