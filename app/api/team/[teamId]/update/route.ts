import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { updateTeamSettings } from "@/lib/services/team/teamService";

export async function PATCH(
  req: Request,
  // 🟢 [변경] Next.js 15 호환: params를 Promise로 정의
  props: { params: Promise<{ teamId: string }> }
) {
  try {
    const user = await requireUser();

    // 🟢 [변경] params를 await하여 값을 꺼냄
    const params = await props.params;
    const teamId = params.teamId;

    const body = await req.json().catch(() => ({}));
    const { name, allowMemberEdit, allowMemberFinalize } = body ?? {};

    const wantsNameUpdate = typeof name !== "undefined";
    const wantsPolicyUpdate =
      typeof allowMemberEdit !== "undefined" ||
      typeof allowMemberFinalize !== "undefined";

    if (!wantsNameUpdate && !wantsPolicyUpdate) {
      const err = apiError("NO_CHANGES", "변경할 항목이 없습니다.", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    if (wantsNameUpdate) {
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        const err = apiError(
          "INVALID_TEAM_NAME",
          "유효하지 않은 팀 이름입니다.",
          400
        );
        return NextResponse.json(err.body, { status: err.status });
      }
      if (name.trim().length > 30) {
        const err = apiError(
          "TEAM_NAME_TOO_LONG",
          "팀 이름은 30자 이내로 입력해주세요.",
          400
        );
        return NextResponse.json(err.body, { status: err.status });
      }
    }

    await updateTeamSettings({
      teamId,
      userId: user.id,
      name: wantsNameUpdate ? name : undefined,
      allowMemberEdit:
        typeof allowMemberEdit === "boolean" ? allowMemberEdit : undefined,
      allowMemberFinalize:
        typeof allowMemberFinalize === "boolean" ? allowMemberFinalize : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("[API_TEAM_UPDATE]", error);
    const status = error.status || 500;
    if (status === 401) {
      const err = apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
      return NextResponse.json(err.body, { status: err.status });
    }

    if (status >= 400 && status < 500) {
      const err = apiError(
        error?.code ?? "BAD_REQUEST",
        error?.message ?? "Bad request",
        status
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    const err = apiError("INTERNAL_ERROR", "서버 오류가 발생했습니다.", status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
