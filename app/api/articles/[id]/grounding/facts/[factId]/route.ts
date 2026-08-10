import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { updateArticleFact } from "@/lib/services/article/articleGroundingService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";
import { mapPressDomainConflict } from "@/lib/services/press/pressFinalizationApi";

const BodySchema = z
  .object({
    content: z.string().trim().min(1).max(10_000).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => value.content !== undefined || value.active !== undefined);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; factId: string }> },
) {
  try {
    const { team } = await requireTeamContext();
    const parsed = validateBody(BodySchema, await request.json());
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const { id, factId } = await context.params;
    return NextResponse.json({
      ok: true,
      ...(await updateArticleFact({
        teamId: team.id,
        articleId: id,
        factId,
        ...parsed.data,
      })),
    });
  } catch (error: any) {
    const conflict = mapPressDomainConflict(error);
    if (conflict) return NextResponse.json(apiError(conflict.code, conflict.message, conflict.status).body, { status: conflict.status });
    const status = error?.message?.includes("NOT_FOUND") ? 404 : 500;
    return NextResponse.json(
      apiError("ARTICLE_FACT_UPDATE_FAILED", error?.message, status).body,
      { status },
    );
  }
}
