import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";
import { organizeResumeQuestions } from "@/lib/services/resume/resumeIntakeService";
import { consumeAiQuota } from "@/domain/quota/aiQuota";

const BodySchema = z.object({
  text: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();

    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    await consumeAiQuota({
      teamId: team.id,
      userId: user.id,
      action: "resume_strategy",
      meta: {
        route: "/api/resume/intake/questions",
        textLength: parsed.data.text.length,
      },
    });
    const questions = await organizeResumeQuestions(parsed.data.text);
    return NextResponse.json({ ok: true, questions });
  } catch (error: any) {
    console.error("Resume intake question organize error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "RESUME_QUESTION_ORGANIZE_FAILED",
      error?.message ?? "Failed to organize questions",
      status,
      error?.details ? { details: error.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
