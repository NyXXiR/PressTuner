import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";
import { parseResumeApplicationInput } from "@/lib/services/resume/resumeIntakeService";
import {
  fetchHiringPageText,
  HIRING_URL_FALLBACK_MESSAGE,
} from "@/lib/services/resume/resumeIntakeFetch";
import { consumeAiQuota } from "@/domain/quota/aiQuota";
import { ResumeBriefUrlInputSchema } from "@/domain/resume-writing/contracts";

const BodySchema = z.object({
  url: ResumeBriefUrlInputSchema,
});

export async function POST(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();

    const body = await req.json();
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    const text = await fetchHiringPageText(parsed.data.url);
    await consumeAiQuota({
      teamId: team.id,
      userId: user.id,
      action: "resume_strategy",
      meta: {
        route: "/api/resume/intake/url",
        textLength: text.length,
      },
    });
    const result = await parseResumeApplicationInput(text);

    return NextResponse.json({
      ok: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Resume intake url error:", error);
    const status = error?.status ?? 500;
    const err = apiError(
      error?.code ?? "RESUME_INTAKE_URL_FAILED",
      error?.message ?? HIRING_URL_FALLBACK_MESSAGE,
      status,
      error?.details ? { details: error.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
