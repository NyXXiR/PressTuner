import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";
import { QuotaLimitError } from "@/lib/services/usageService";
import { suggestResumeQuestionBricks } from "@/lib/services/resume/resumeService";

const BodySchema = z.object({
  applicationId: z.string().min(1),
  instruction: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, team } = await requireTeamContext();
    const { id } = await params;
    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    const result = await suggestResumeQuestionBricks({
      applicationId: parsed.data.applicationId,
      questionId: id,
      userId: user.id,
      teamId: team.id,
      instruction: parsed.data.instruction,
    });

    return NextResponse.json({
      ok: true,
      items: result.suggestedBricks,
      reason: result.reason,
      guideline: result.guideline,
    });
  } catch (error: any) {
    if (error instanceof QuotaLimitError) {
      const err = apiError("QUOTA_EXCEEDED", error.message, 403, {
        details: { quota: error.details?.quota ?? undefined },
      });
      return NextResponse.json(err.body, { status: err.status });
    }

    console.error("Suggest bricks error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "SUGGEST_BRICKS_FAILED",
      error?.message ?? "Failed to suggest bricks",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
