import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUserId, requireTeamContextFlexible } from "@/lib/auth";
import { generateArticleFromBrief } from "@/lib/services/press/pressService";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";

const BodySchema = z.object({
  teamId: z.string().optional(),
  serviceName: z.string().optional(),
  announceType: z.string().min(1),
  oneLiner: z.string().optional(),
  points: z.array(z.string()).default([]),
  quoteMessage: z.string().optional(),
  quoteWho: z.string().optional(),
  tone: z.enum(["formal", "neutral", "friendly"]),
  rawText: z.string().optional(),
  eventAt: z.string().optional(),
  publishAt: z.string().optional(),
  quotaMode: z.enum(["simplified"]).optional(),
});

export async function POST(
  req: Request,
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
