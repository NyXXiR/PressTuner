import { NextRequest, NextResponse } from "next/server";
import { rePolishUseCase } from "@/lib/services/article/reviewUseCases";
import { requireTeamContextFlexible } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { selectedNoteIds, userInstruction, teamId, quotaMode } = body;

    const { user, team } = await requireTeamContextFlexible({ teamId });

    const result = await rePolishUseCase({
      articleId: id,
      teamId: team.id,
      userId: user.id,
      selectedNoteIds: selectedNoteIds || [],
      userInstruction: userInstruction || "",
      quotaMode: quotaMode === "simplified" ? "simplified" : undefined,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    const status = error.status || 500;
    const err = apiError(
      error?.code ?? "REPOLISH_ERROR",
      error.message,
      status,
      { details: { quota: error?.quota ?? error?.details?.quota ?? undefined } },
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
