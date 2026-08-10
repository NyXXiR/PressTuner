import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { createUserArticleFact } from "@/lib/services/article/articleGroundingService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";
import { mapPressDomainConflict } from "@/lib/services/press/pressFinalizationApi";

const BodySchema = z.object({ content: z.string().trim().min(1).max(10_000) });

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { team } = await requireTeamContext();
    const parsed = validateBody(BodySchema, await request.json());
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const { id } = await context.params;
    return NextResponse.json(
      {
        ok: true,
        fact: await createUserArticleFact({
          teamId: team.id,
          articleId: id,
          content: parsed.data.content,
        }),
      },
      { status: 201 },
    );
  } catch (error: any) {
    const conflict = mapPressDomainConflict(error);
    if (conflict) return NextResponse.json(apiError(conflict.code, conflict.message, conflict.status).body, { status: conflict.status });
    const status = error?.message === "ARTICLE_NOT_FOUND" ? 404 : 500;
    return NextResponse.json(
      apiError("ARTICLE_FACT_CREATE_FAILED", error?.message, status).body,
      { status },
    );
  }
}
