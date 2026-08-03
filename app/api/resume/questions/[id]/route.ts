// app/api/resume/questions/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { updateResumeQuestion } from "@/lib/services/resume/resumeService";
import { z } from "zod";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";

const BodySchema = z.object({
  answer: z.string().optional(),
  relatedBricks: z.array(z.object({ id: z.string().min(1) })).optional(),
  isCompleted: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user } = await requireTeamContext();
    const { id } = await params;

    if (!id) {
      const err = apiError("MISSING_ID", "ID is missing", 400);
      return NextResponse.json(err.body, { status: err.status });
    }

    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const { answer, relatedBricks, isCompleted } = parsed.data;

    const result = await updateResumeQuestion({
      userId: user.id,
      questionId: id,
      answer,
      isCompleted,
      relatedBricks,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    console.error("Update Question Error:", e);
    const status = e.status || 500;
    const err = apiError("QUESTION_UPDATE_FAILED", e.message, status);
    return NextResponse.json(err.body, { status: err.status });
  }
}
