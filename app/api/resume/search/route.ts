import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";
import { searchResumeAnswers } from "@/lib/services/resume/resumeAnswerSearchService";

const BodySchema = z.object({
  query: z.string().min(2),
});

export async function POST(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();
    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    const result = await searchResumeAnswers({
      query: parsed.data.query,
      userId: user.id,
      teamId: team.id,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Resume search error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "RESUME_SEARCH_FAILED",
      error?.message ?? "Failed to search previous answers",
      status,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
