// app/api/team/members/[userId]/route.ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { apiError } from "@/lib/utils/api";
import {
  removeTeamMember,
  updateTeamMemberRole,
} from "@/lib/services/team/teamService";

export const dynamic = "force-dynamic";

type Ctx = {
  params: Promise<{ userId: string }> | { userId: string };
};

async function getUserId(ctx: Ctx) {
  const p = await Promise.resolve(ctx.params as any);
  return p?.userId as string | undefined;
}

/**
 * PATCH /api/team/members/:userId
 * body: { role: "OWNER" | "ADMIN" | "MEMBER" | "GUEST" }
 */
export async function PATCH(req: Request, ctx: Ctx) {
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

    const targetUserId = await getUserId(ctx);
    if (!targetUserId) {
      const err = apiError("MISSING_USER_ID", "userId가 필요합니다.", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const body = await req.json().catch(() => ({}));
    const nextRole = body?.role as string | undefined;
    if (!nextRole) {
      const err = apiError(
        "INVALID_ROLE",
        "role은 OWNER|ADMIN|MEMBER|GUEST 중 하나여야 합니다.",
        400
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    const result = await updateTeamMemberRole({
      teamId,
      userId: session.userId,
      targetUserId,
      nextRole,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "서버 에러",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}

/**
 * DELETE /api/team/members/:userId
 * - 본인(userId === session.userId): 탈퇴(leave)
 * - 타인: 내보내기(kick) => OWNER/ADMIN만
 */
export async function DELETE(_req: Request, ctx: Ctx) {
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

    const targetUserId = await getUserId(ctx);
    if (!targetUserId) {
      const err = apiError("MISSING_USER_ID", "userId가 필요합니다.", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const result = await removeTeamMember({
      teamId,
      userId: session.userId,
      targetUserId,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "서버 에러",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
