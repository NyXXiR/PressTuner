import { NextRequest, NextResponse } from "next/server";
import { requireTeamContextFlexible, isAdmin } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import {
  getCompiledGuideForTeam,
  updateCompiledGuideForTeam,
} from "@/lib/services/styleGuideService";

// --- GET (조회) ---
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    // 1. Auth: 팀 접근 권한 확인
    await requireTeamContextFlexible({ teamId });

    // 2. Logic: 가이드 가져오기 (없으면 생성)
    // 제공해주신 함수는 StyleGuide 객체만 반환합니다.
    const compiled = await getCompiledGuideForTeam(teamId);

    return NextResponse.json({
      ok: true,
      data: {
        // Prisma JSON 타입은 any로 처리되므로 안전하게 반환
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
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  try {
    const { teamId } = await params;

    // 1. Auth & Permission: 권한 및 Role 확인
    const { role } = await requireTeamContextFlexible({ teamId });

    // 관리자(OWNER/ADMIN)만 수정 가능
    if (!isAdmin(role)) {
      const err = apiError(
        "FORBIDDEN",
        "Only admins can update the style guide.",
        403
      );
      return NextResponse.json(err.body, { status: err.status });
    }

    // 2. Body Parsing
    const body = await req.json();
    const { rules } = body;

    if (!rules) {
      const err = apiError("MISSING_RULES", "Rules data required", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    // 3. Logic: 가이드 가져오기 (가이드 ID가 필요함)
    const updated = await updateCompiledGuideForTeam(teamId, rules);

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
