// app/api/notices/route.ts
import { NextResponse } from "next/server";
import { requireAdmin, requireSessionContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { createNotice } from "@/lib/services/noticeService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await requireAdmin();
  } catch (e: any) {
    const status = e?.status ?? 403;
    const err = apiError("FORBIDDEN", e?.message ?? "FORBIDDEN", status);
    return NextResponse.json(err.body, { status: err.status });
  }

  const { user, team } = await requireSessionContext();
  if (!team) {
    return NextResponse.json(apiError("NO_TEAM", "NO_TEAM", 400).body, {
      status: 400,
    });
  }

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  const sendAsNotification = !!body.sendAsNotification;

  if (!title || !content) {
    return NextResponse.json(apiError("INVALID", "INVALID", 400).body, {
      status: 400,
    });
  }

  const notice = await createNotice({
    teamId: team.id,
    userId: user.id,
    title,
    content,
    sendAsNotification,
  });

  return NextResponse.json({ notice });
}
