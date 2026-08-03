// app/api/users/search/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { apiError } from "@/lib/utils/api";
import { searchUsersForInvite } from "@/lib/services/userSearchService";

export const dynamic = "force-dynamic";

/**
 * GET /api/users/search?q=...
 * - currentTeamId 기준으로 alreadyMember / alreadyInvited 함께 반환
 * - OWNER/ADMIN만 검색 가능(초대 권한)
 * - ✅ 이메일 검색/노출 방지: label/loginId 기반 검색만 수행, email은 응답에 포함하지 않음
 */
export async function GET(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      const err = apiError("UNAUTHORIZED", "Unauthorized", 401);
      return NextResponse.json(err.body, { status: err.status });
    }

    const teamId = session.currentTeamId;
    if (!teamId) {
      const err = apiError("NO_TEAM", "No current team", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();

    const result = await searchUsersForInvite({
      teamId,
      userId: session.userId,
      query: q,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "서버 에러",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
