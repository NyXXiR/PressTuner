// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";
import { getSession, SESSION_COOKIE_NAME } from "@/lib/session";
import { deleteSessionById } from "@/lib/services/sessionService";

type SessionLookup = () => Promise<{ id: string } | null>;
type SessionDelete = (sessionId: string) => Promise<unknown>;

export async function logoutWithSessionCleanup(
  lookupSession: SessionLookup = getSession,
  deleteSession: SessionDelete = deleteSessionById,
) {
  const res = NextResponse.json({ ok: true });

  try {
    const session = await lookupSession();
    if (session) await deleteSession(session.id);
  } catch (error) {
    console.error("[LOGOUT_SESSION_CLEANUP_ERROR]", error);
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

export async function POST() {
  return logoutWithSessionCleanup();
}
