// app/api/team/invitations/route.ts
import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/utils/api";
import {
  createTeamInvitation,
  resolveUserIdByLoginId,
} from "@/lib/services/team/teamService";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session)
    return NextResponse.json(
      apiError("UNAUTHORIZED", "Unauthorized", 401).body,
      { status: 401 }
    );

  if (!session.currentTeamId) {
    return NextResponse.json(
      apiError("NO_TEAM", "No current team", 400).body,
      { status: 400 }
    );
  }

  const teamId = session.currentTeamId;

  const { inviteeUserId, inviteeLoginId, message } = await req
    .json()
    .catch(() => ({}));

  let resolvedUserId: string | null = inviteeUserId ?? null;
  if (!resolvedUserId && inviteeLoginId) {
    resolvedUserId = await resolveUserIdByLoginId(String(inviteeLoginId));
    if (!resolvedUserId) {
      return NextResponse.json(
        apiError("USER_NOT_FOUND", "User not found", 404).body,
        { status: 404 }
      );
    }
  }

  if (!resolvedUserId) {
    return NextResponse.json(
      apiError(
        "MISSING_INVITEE_ID",
        "inviteeUserId 또는 inviteeLoginId가 필요합니다.",
        400
      ).body,
      { status: 400 }
    );
  }

  try {
    const result = await createTeamInvitation({
      teamId,
      inviterId: session.userId,
      inviteeUserId: resolvedUserId,
      message,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "INVITATION_CREATE_FAILED",
      e?.message ?? "Invitation create failed",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
