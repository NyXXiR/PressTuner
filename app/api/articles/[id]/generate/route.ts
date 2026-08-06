import { NextResponse } from "next/server";
import { GenerateArticleBodySchema } from "@/domain/press/pressFlowContracts";
import { requireCurrentUserId, requireTeamContextFlexible } from "@/lib/auth";
import { generateArticleFromBrief } from "@/lib/services/press/pressService";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  try {
    const userId = await requireCurrentUserId();
    const bodyPayload = await req.json();
    const parsed = validateBody(GenerateArticleBodySchema, bodyPayload);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const body = parsed.data;

    const { team } = await requireTeamContextFlexible({ teamId: body.teamId });

    const result = await generateArticleFromBrief({
      teamId: team.id,
      userId,
      articleId: id,
      body,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const status = e?.status ?? 500;

    // 차감 중 에러 발생 시 처리
    const errorMessage = e?.message ?? "Generate failed";

    const err = apiError(
      e?.code ?? "GENERATE_ERROR",
      errorMessage,
      status,
      { details: { usage: e?.usage ?? undefined, quota: e?.details?.quota ?? undefined } },
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
