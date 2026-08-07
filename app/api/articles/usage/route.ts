import { NextResponse } from "next/server";
import { requireTeamContextFlexible } from "@/lib/auth";
import { getUsageSummaryUseCase } from "@/lib/services/article/usageUseCases";
import { apiError } from "@/lib/utils/api";

/**
 * GET /api/articles/usage
 * 새 문서 작성 시(articleId가 없을 때) 팀의 플랜 정보 및 일일 잔여 사용량을 가져옵니다.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get("teamId") || undefined;

    // 1. 현재 세션의 팀 컨텍스트 가져오기
    const { team } = await requireTeamContextFlexible({ teamId });

    /**
     * 2. 사용량 요약 조회
     * - 두 번째 인자인 articleId를 undefined로 전달합니다.
     * - getUsageSummaryUseCase 내부에서 id가 없으면
     *   "팀의 오늘 전체 생성량"과 "플랜 기본 제한"을 기준으로 데이터를 구성할 것입니다.
     */
    const usage = await getUsageSummaryUseCase(team.id);

    // 3. 프론트엔드 ArticleUsageSummary 타입에 맞춰 응답
    return NextResponse.json({
      ok: true,
      articleId: null, // 새 문서 상태임을 명시
      ...usage,
    });
  } catch (e: any) {
    console.error("[API_ARTICLES_USAGE_ERROR]", e);
    const status = e?.status ?? 500;

    const err = apiError(
      e?.code ?? "USAGE_ERROR",
      e?.message ?? "사용량 정보를 불러오지 못했습니다.",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
