// app/api/team/select/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { apiError } from "@/lib/utils/api";
import { selectTeamForSession } from "@/lib/services/team/teamService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      const err = apiError("UNAUTHORIZED", "Unauthorized", 401);
      return NextResponse.json(err.body, { status: err.status });
    }

    const body = await req.json().catch(() => null);
    const teamId = body?.teamId as string | undefined;

    if (!teamId) {
      const err = apiError("MISSING_TEAM_ID", "teamId가 필요합니다.", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    // 소속 여부 체크
    await selectTeamForSession({
      sessionId: session.id,
      userId: session.userId,
      teamId,
    });

    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "서버 에러가 발생했습니다.",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
