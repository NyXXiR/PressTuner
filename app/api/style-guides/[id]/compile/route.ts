// app/api/style-guides/[id]/compile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/auth";
import { type CompileMode } from "@/lib/styleCompiler";
import { apiError } from "@/lib/utils/api";
import { compileGuideForUser } from "@/lib/services/styleGuideService";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    // Body 파싱 (에러 방지)
    const body = await req.json().catch(() => ({}));
    const mode: CompileMode = body.mode === "SLOW" ? "SLOW" : "FAST";

    // 1. 인증 체크 (클라이언트 호출이므로 필수)
    const currentUserId = await requireCurrentUserId();
    if (!currentUserId) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );
    }

    // 2. 가이드 및 권한 체크
    const result = await compileGuideForUser({
      guideId: id,
      userId: currentUserId,
      mode,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[Compile API Error]", e);
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "COMPILE_FAILED",
      e?.message || "오류 발생",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
