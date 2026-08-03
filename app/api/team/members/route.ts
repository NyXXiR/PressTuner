// app/api/team/members/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { apiError } from "@/lib/utils/api";
import { listTeamMembers } from "@/lib/services/team/teamService";

export const dynamic = "force-dynamic";

/**
 * GET /api/team/members
 * - session.currentTeamId 기준으로 멤버 목록 반환
 * - myRole(현재 유저의 팀 권한)도 함께 반환
 */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      const err = apiError("UNAUTHORIZED", "Unauthorized", 401);
      return NextResponse.json(err.body, {
        status: err.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const url = new URL(req.url);
    const requestedTeamId = (url.searchParams.get("teamId") ?? "").trim();
    const teamId = requestedTeamId || session.currentTeamId;
    if (!teamId) {
      const err = apiError("NO_TEAM", "No current team", 400);
      return NextResponse.json(err.body, {
        status: err.status,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const result = await listTeamMembers({
      userId: session.userId,
      teamId,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "서버 에러가 발생했습니다.",
      status
    );
    return NextResponse.json(err.body, {
      status: err.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
