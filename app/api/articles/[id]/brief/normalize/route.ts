// app/api/articles/[id]/brief/normalize/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireTeamContextFlexible } from "@/lib/auth";
import { extractTeamIdFromRequest } from "@/lib/auth/team";
import { normalizeBriefUseCase } from "@/lib/services/article/generationUseCases";
import { apiError } from "@/lib/utils/api";
import { NormalizeBriefBodySchema } from "@/domain/press/pressFlowContracts";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, ctx: RouteContext) {
  const rid =
    (globalThis.crypto as any)?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    const { id } = await ctx.params;

    // 1) body 파싱
    const rawBody = await req.json().catch((err) => {
      console.log("[brief/normalize][BODY_PARSE_FAIL]", { rid, err });
      return null;
    });
    const body = NormalizeBriefBodySchema.safeParse(rawBody ?? {}).data ?? {};

    const rawText = body?.rawText;
    const tone = body?.tone;
    const quotaMode = body?.quotaMode === "simplified" ? "simplified" : undefined;

    // 2) teamId 추출
    const headerOrQueryTeamId = extractTeamIdFromRequest(req);
    const bodyTeamId = body?.teamId;
    const resolvedTeamId = bodyTeamId ?? headerOrQueryTeamId;

    // teamId가 아예 없으면 여기서 바로 원인 확정 가능
    // (원한다면 400으로 돌려도 됨)
    // if (!resolvedTeamId) {
    //   return NextResponse.json(
    //     { error: "TEAM_ID_REQUIRED" },
    //     { status: 400 }
    //   );
    // }

    // 3) 권한/팀 컨텍스트 확인
    const { user, team } = await requireTeamContextFlexible({
      teamId: resolvedTeamId,
    });

    // 4) usecase 실행
    const { brief, factCandidates, usage } = await normalizeBriefUseCase({
      team: {
        id: team.id,
      },
      userId: user.id,
      articleId: id,
      rawText: typeof rawText === "string" ? rawText : "",
      tone,
      quotaMode,
    });

    return NextResponse.json({
      ok: true,
      rid,
      id,
      articleId: id,
      ...brief,
      factCandidates,
      usage,
    });
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;

    if (status === 404 && e?.code === "ARTICLE_NOT_FOUND") {
      return NextResponse.json(
        apiError("NOT_FOUND", "문서를 찾을 수 없습니다.", 404).body,
        { status: 404 },
      );
    }

    // ✅ 서비스에서 던지는 구체적인 에러 코드를 체크합니다.
    if (
      status === 403 &&
      (e?.code === "BRIEF_LIMIT_EXCEEDED" ||
        e?.code === "AI_QUOTA_LIMIT_EXCEEDED" ||
        e?.code === "SIMPLIFIED_PRESS_QUOTA_LIMIT")
    ) {
      return NextResponse.json(
        apiError(e?.code ?? "BRIEF_LIMIT_EXCEEDED", e.message, 403, {
          details: { quota: e?.quota ?? e?.details?.quota ?? undefined },
        }).body,
        { status: 403 },
      );
    }

    if (status === 401)
      return NextResponse.json(
        apiError("UNAUTHORIZED", "UNAUTHORIZED", 401).body,
        { status: 401 }
      );

    // 일반적인 권한 부족 에러 (위의 구체적인 에러 조건에 안 걸렸을 때만 일로 옴)
    if (status === 403)
      return NextResponse.json(
        apiError("FORBIDDEN", "FORBIDDEN", 403).body,
        { status: 403 }
      );

    console.error(e);
    return NextResponse.json(
      apiError("INTERNAL_ERROR", "서버 오류가 발생했습니다.", 500).body,
      { status: 500 },
    );
  }
}
