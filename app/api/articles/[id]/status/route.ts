// app/api/articles/[id]/status/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { ArticleStatus } from "@prisma/client";
import { requireTeamContextFlexible } from "@/lib/auth";
import { updateStatusUseCase } from "@/lib/services/article/articleUseCases";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";

const BodySchema = z.object({
  teamId: z.string().optional(),
  status: z.nativeEnum(ArticleStatus),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  try {
    const bodyPayload = await req.json();
    const parsed = validateBody(BodySchema, bodyPayload);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const body = parsed.data;
    const { team } = await requireTeamContextFlexible({ teamId: body.teamId });

    const result = await updateStatusUseCase({
      teamId: team.id,
      articleId: id,
      status: body.status,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "STATUS_ERROR",
      e?.message ?? "Status update failed",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
