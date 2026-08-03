import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { findSimilarResumeQuestions } from "@/lib/services/resume/resumeQuestionSimilarityService";
import { validateQuery } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";

const QuerySchema = z.object({
  applicationId: z.string().min(1),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, team } = await requireTeamContext();
    const { id } = await params;

    const { searchParams } = new URL(req.url);
    const parsed = validateQuery(QuerySchema, {
      applicationId: searchParams.get("applicationId"),
    });
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    const result = await findSimilarResumeQuestions({
      applicationId: parsed.data.applicationId,
      questionId: id,
      userId: user.id,
      teamId: team.id,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error("Similar questions error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "SIMILAR_QUESTIONS_FAILED",
      error?.message ?? "Failed to find similar questions",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
