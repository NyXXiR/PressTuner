import { NextRequest, NextResponse } from "next/server";
import { requireTeamContextFlexible, isAdmin } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import {
  getCompiledGuideForTeam,
  updateCompiledGuideForTeam,
} from "@/lib/services/styleGuideService";

// --- GET (조회) ---
export async function GET(req: NextRequest) {
  try {
    // ✅ 1. Auth: 파라미터 없이 호출하여 세션 기반으로 팀 컨텍스트 획득
    // requireTeamContextFlexible()는 인자가 없으면 세션의 currentTeamId를 사용합니다.
    const { team } = await requireTeamContextFlexible();

    // 2. Logic: 세션에서 찾은 team.id 사용
    const compiled = await getCompiledGuideForTeam(team.id);

    return NextResponse.json({
      ok: true,
      data: {
        rules: compiled.rules,
        version: compiled.version,
        updatedAt: compiled.updatedAt,
      },
    });
  } catch (e: any) {
    // lib/auth.ts에서 던진 에러(status 포함) 처리
    const status = e.status || 500;
    const err = apiError("ERROR", e.message || "Server Error", status);
    return NextResponse.json(err.body, { status: err.status });
  }
}

// --- PUT (수정/저장) ---
export async function PUT(req: NextRequest) {
  try {
    // ✅ 1. Auth: 세션 기반으로 팀 및 권한 획득
    const { team, role } = await requireTeamContextFlexible();

    // 2. 관리자 권한 체크
    if (!isAdmin(role)) {
      const err = apiError(
        "FORBIDDEN",
        "Only admins can update the style guide.",
        403
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    // 3. Body Parsing
    const body = await req.json();
    const { rules } = body;

    if (!rules) {
      const err = apiError("MISSING_RULES", "Rules data required", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    // 4. Logic: 세션 team.id 사용
    const updated = await updateCompiledGuideForTeam(team.id, rules);

    return NextResponse.json({
      ok: true,
      data: {
        version: updated.version,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (e: any) {
    console.error("StyleGuide Update Error:", e);
    const status = e.status || 500;
    const err = apiError("ERROR", e.message || "Server Error", status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
