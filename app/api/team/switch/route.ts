// app/api/team/switch/route.ts
import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/utils/api";
import { selectTeamForSession } from "@/lib/services/team/teamService";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json(
      apiError("UNAUTHORIZED", "Unauthorized", 401).body,
      { status: 401 }
    );

  try {
    const { teamId } = await req.json();
    await selectTeamForSession({
      sessionId: session.id,
      userId: session.userId,
      teamId,
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return NextResponse.json(
      apiError(e?.code ?? "INTERNAL_ERROR", e?.message ?? "서버 에러", status).body,
      { status }
    );
  }
  return NextResponse.json({ ok: true });
}
