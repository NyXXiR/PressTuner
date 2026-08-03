// app/api/team/invitations/outbox/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { apiError } from "@/lib/utils/api";
import { listInvitationOutbox } from "@/lib/services/team/teamService";

export const dynamic = "force-dynamic";

/**
 * GET /api/team/invitations/outbox
 * - currentTeamId의 PENDING 초대 목록
 * - OWNER/ADMIN: 팀 전체 outbox
 * - 그 외: 본인이 보낸 초대만
 */
export async function GET() {
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

  try {
    const result = await listInvitationOutbox({
      userId: session.userId,
      teamId,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "OUTBOX_LIST_FAILED",
      e?.message ?? "Outbox list failed",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
