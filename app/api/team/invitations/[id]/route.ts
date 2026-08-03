// app/api/team/invitations/[id]/route.ts
import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/utils/api";
import {
  cancelInvitation,
  respondInvitation,
} from "@/lib/services/team/teamService";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> | { id: string } };

async function getId(ctx: Ctx) {
  // ✅ Next 환경에 따라 params가 Promise일 수 있어서 통일 처리
  const p = await Promise.resolve(ctx.params as any);
  return p?.id as string | undefined;
}

/**
 * PATCH /api/team/invitations/:id
 * body: { action: "ACCEPT" | "REJECT" }
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    const err = apiError("UNAUTHORIZED", "Unauthorized", 401);
    return NextResponse.json(err.body, { status: err.status });
  }

  const invitationId = await getId(ctx);
  if (!invitationId) {
    const err = apiError("MISSING_INVITATION_ID", "invitationId가 필요합니다.", 400);
    return NextResponse.json(err.body, { status: err.status });
  }

  const body = await req.json().catch(() => ({}));
  const action = (body.action as string | undefined)?.toUpperCase();

  if (action !== "ACCEPT" && action !== "REJECT") {
    const err = apiError(
      "INVALID_ACTION",
      "action은 ACCEPT 또는 REJECT 입니다.",
      400
    );
    return NextResponse.json(err.body, { status: err.status });
  }

  try {
    const result = await respondInvitation({
      userId: session.userId,
      invitationId,
      action: action as "ACCEPT" | "REJECT",
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "INVITATION_ACTION_FAILED",
      e?.message ?? "Invitation action failed",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}

/**
 * DELETE /api/team/invitations/:id
 * (보낸 사람이 취소하는 용도)
 */
export async function DELETE(_req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session) {
    const err = apiError("UNAUTHORIZED", "Unauthorized", 401);
    return NextResponse.json(err.body, { status: err.status });
  }

  const invitationId = await getId(ctx);
  if (!invitationId) {
    const err = apiError("MISSING_INVITATION_ID", "invitationId가 필요합니다.", 400);
    return NextResponse.json(err.body, { status: err.status });
  }

  try {
    if (!session.currentTeamId) {
      const err = apiError("NO_TEAM", "No current team", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const result = await cancelInvitation({
      userId: session.userId,
      currentTeamId: session.currentTeamId,
      invitationId,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "INVITATION_CANCEL_FAILED",
      e?.message ?? "Invitation cancel failed",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
