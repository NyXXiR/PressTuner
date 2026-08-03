import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { extractTeamIdFromRequest } from "@/lib/auth/team";
import { requireCurrentUserId, requireTeamContextFlexible } from "@/lib/auth";
import { reviewUseCase } from "@/lib/services/article/reviewUseCases";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";

const BodySchema = z.object({
  teamId: z.string().optional(),
  title: z.string().min(1),
  plain: z.string().min(1),
  userInstruction: z.string().max(1000).optional(),
  quotaMode: z.enum(["simplified"]).optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  try {
    const userId = await requireCurrentUserId();
    const bodyPayload = await req.json();
    const parsed = validateBody(BodySchema, bodyPayload);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const body = parsed.data;

    const reqTeamId = extractTeamIdFromRequest(req);
    const requestedTeamId = (body.teamId ?? "").trim() || reqTeamId;

    const { team } = await requireTeamContextFlexible({
      teamId: requestedTeamId,
    });

    // [변경점] 서비스 함수 호출
    // 서비스 내부에서 스타일 가이드 적용, AI 분석, 위치 계산, ID 동기화가 모두 완료되어 반환됨
    const result = await reviewUseCase({
      team: {
        id: team.id,
      },
      userId,
      articleId: id,
      title: body.title,
      plain: body.plain,
      userInstruction: body.userInstruction,
      quotaMode: body.quotaMode,
    });

    // [변경점] 불필요한 재가공 로직 제거
    // Service가 보장하는 데이터를 그대로 클라이언트에 전달
    return NextResponse.json({
      ok: true,
      id,
      articleId: id,
      title: result.title,
      plain: result.plain,
      spans: result.spans, // ID가 note와 동기화된 상태
      notes: result.notes, // ID가 span과 동기화된 상태
      usage: result.usage,
    });
  } catch (e: any) {
    console.error("[api/articles/[id]/polish] error:", e);
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "POLISH_ERROR",
      e?.message ?? "Polish failed",
      status,
      {
        details: {
          usage: e?.usage ?? undefined,
          quota: e?.quota ?? e?.details?.quota ?? undefined,
        },
      },
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
