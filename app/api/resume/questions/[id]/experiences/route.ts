import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { updateResumeQuestion } from "@/lib/services/resume/resumeService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

const SelectionBodySchema = z.object({
  selectedExperienceIds: z.array(z.string().trim().min(1)).max(20),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { id: questionId } = await params;
    const parsed = validateBody(
      SelectionBodySchema,
      await request.json().catch(() => null),
    );
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const result = await updateResumeQuestion({
      userId: user.id,
      questionId,
      relatedBricks: parsed.data.selectedExperienceIds.map((id) => ({ id })),
    });
    return NextResponse.json({
      ok: true,
      questionId,
      selectedExperiences: result.selectedExperiences,
    });
  } catch (error) {
    const value = error as {
      status?: number;
      code?: string;
      message?: string;
      details?: unknown;
    };
    const response = apiError(
      value.code ?? "QUESTION_EXPERIENCE_SELECTION_FAILED",
      value.message ?? "Experience selection failed",
      value.status ?? 500,
      value.details ? { details: value.details } : undefined,
    );
    return NextResponse.json(response.body, { status: response.status });
  }
}
