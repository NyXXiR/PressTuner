import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { extractTeamIdFromRequest } from "@/lib/auth/team";
import { requireCurrentUserId, requireTeamContextFlexible } from "@/lib/auth";
import { saveArticleDraft } from "@/lib/services/press/pressService";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";

const ParagraphSchema = z.object({
  text: z.string(),
  importance: z.number().optional(),
});

const BodySchema = z.object({
  teamId: z.string().optional(),
  title: z.string().optional(),
  lead: z.string().nullable().optional(),
  paragraphs: z.array(ParagraphSchema).optional(),
  closing: z.string().optional(),

  // [수정 1] 클라이언트가 보내는 'plain' 필드를 허용하도록 추가
  plain: z.string().optional(),
  harnessAction: z
    .object({
      type: z.literal("apply_pending_rewrite"),
      appliedAt: z.string().optional(),
    })
    .nullable()
    .optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
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

    const result = await saveArticleDraft({
      teamId: team.id,
      userId,
      articleId: id,
      title: body.title,
      lead: body.lead ?? null,
      paragraphs: body.paragraphs ?? [],
      closing: body.closing ?? "",
      plain: body.plain,
      harnessAction: body.harnessAction ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      id,
      articleId: id,
      article: result,
    });
  } catch (e: any) {
    console.error("[api/articles/[id]/save] error:", e);

    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "SAVE_ERROR",
      e?.message ?? "Save failed",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
