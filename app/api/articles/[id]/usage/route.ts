// app/api/articles/[id]/usage/route.ts
import { NextResponse } from "next/server";
import { requireTeamContextFlexible } from "@/lib/auth";
import { getUsageSummaryUseCase } from "@/lib/services/article/usageUseCases";
import { apiError } from "@/lib/utils/api";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  try {
    const url = new URL(req.url);
    const teamId = url.searchParams.get("teamId") || undefined;

    const { team } = await requireTeamContextFlexible({ teamId });

    const usage = await getUsageSummaryUseCase(team.id);

    return NextResponse.json({ ok: true, id, articleId: id, ...usage });
  } catch (e: any) {
    const status = e?.status ?? 500;
    const err = apiError(
      e?.code ?? "USAGE_ERROR",
      e?.message ?? "Usage fetch failed",
      status
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
