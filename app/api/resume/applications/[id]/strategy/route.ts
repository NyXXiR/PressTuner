import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { retryResumeApplicationStrategy } from "@/lib/services/resume/resumeApplicationService";
import { apiError } from "@/lib/utils/api";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, team } = await requireTeamContext();
    const { id: applicationId } = await params;

    const result = await retryResumeApplicationStrategy({
      applicationId,
      userId: user.id,
      teamId: team.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("Strategy Gen Error:", e);
    const status = e.status || 500;
    const err = apiError(
      e?.code ?? "STRATEGY_GEN_FAILED",
      e?.message ?? "Strategy generation failed",
      status,
      e?.details ? { details: e.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
