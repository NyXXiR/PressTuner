import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { validateBody } from "@/lib/utils/validate";
import { apiError } from "@/lib/utils/api";
import { parseResumeApplicationInput } from "@/lib/services/resume/resumeIntakeService";
import { consumeAiQuota } from "@/domain/quota/aiQuota";
import { ResumeBriefTextInputSchema } from "@/domain/resume-writing/contracts";

const BodySchema = z.object({
  text: ResumeBriefTextInputSchema,
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
        route: "/api/resume/intake",
        textLength: parsed.data.text.length,
      },
    });
    const result = await parseResumeApplicationInput(parsed.data.text);

    return NextResponse.json({ ok: true, data: result });
  } catch (error: any) {
    console.error("Resume intake error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "RESUME_INTAKE_FAILED",
      error?.message ?? "Failed to parse resume application input",
      status,
      error?.details ? { details: error.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
