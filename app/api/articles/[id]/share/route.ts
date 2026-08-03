import { NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth"; // ✅ Custom Auth 사용
import { toggleArticleShareUseCase } from "@/lib/services/article/articleUseCases";
import { apiError } from "@/lib/utils/api";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        apiError("INVALID_ARTICLE_ID", "유효하지 않은 문서 ID입니다.", 400).body,
        { status: 400 },
      );
    }

    // 1. 세션 및 팀 컨텍스트 검증 (로그인 안되어있거나 팀 멤버 아니면 에러 throw됨)
    const { user, team } = await requireTeamContext();

    // 2. Body 파싱
    const body = await req.json();
    const { enable } = body; // boolean

    // 3. Service 호출
    const result = await toggleArticleShareUseCase({
      teamId: team.id,
      userId: user.id,
      articleId: id,
      enable: !!enable,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    // lib/auth.ts의 err() 헬퍼가 status 프로퍼티를 가짐
    const status = e.status || 500;
    const message = e.message || "Internal Server Error";
    const err = apiError("SHARE_UPDATE_FAILED", message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
