// app/api/team/ownership/transfer/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { apiError } from "@/lib/utils/api";
import { transferTeamOwnership } from "@/lib/services/team/teamService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json(
        apiError("UNAUTHORIZED", "Unauthorized", 401).body,
        { status: 401 }
      );

    const teamId = session.currentTeamId;
    if (!teamId)
      return NextResponse.json(
        apiError("NO_TEAM", "No current team", 400).body,
        { status: 400 }
      );

    const body = await req.json().catch(() => ({}));
    const targetUserId = body?.targetUserId as string | undefined;

    if (!targetUserId) {
      const err = apiError("MISSING_TARGET_USER", "targetUserId가 필요합니다.", 400);
      return NextResponse.json(err.body, { status: err.status });
    }
    if (targetUserId === session.userId) {
      const err = apiError("INVALID_TARGET", "자기 자신에게는 이전할 수 없습니다.", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    await transferTeamOwnership({
      teamId,
      currentUserId: session.userId,
      targetUserId,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    return NextResponse.json(
      apiError(e?.code ?? "INTERNAL_ERROR", e?.message ?? "서버 에러", status).body,
      { status }
    );
  }
}
