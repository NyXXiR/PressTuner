import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteTeam } from "@/lib/services/teamService";
import { apiError } from "@/lib/utils/api";

export async function DELETE(
  req: Request,
  // Next.js 15+ 대응: params를 Promise로 처리
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const user = await requireUser();

    // params를 await 하여 teamId 추출
    const { teamId } = await params;

    await deleteTeam({
      userId: user.id,
      teamId,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Team delete error:", error);
    const message = error.message || "팀 삭제 중 오류가 발생했습니다.";
    const err = apiError("TEAM_DELETE_FAILED", message, 400);
    return NextResponse.json(err.body, { status: err.status });
  }
}
