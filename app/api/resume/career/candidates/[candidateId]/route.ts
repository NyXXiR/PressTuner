import { CareerCandidateMode } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { careerCandidatePatchFieldsSchema } from "@/domain/career-memory/candidatePolicy";
import {
  getCareerCandidate,
  updateCareerCandidate,
} from "@/lib/services/resume/careerCandidateService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

const PatchBody = careerCandidatePatchFieldsSchema.extend({
  mode: z.nativeEnum(CareerCandidateMode).optional(),
  targetExperienceId: z.string().min(1).nullable().optional(),
});

type Context = { params: Promise<{ candidateId: string }> };

function errorResponse(error: unknown) {
  const value = error as { status?: number; code?: string; message?: string };
  const result = apiError(
    value.code ?? "CAREER_CANDIDATE_REQUEST_FAILED",
    value.message ?? "Career candidate request failed",
    value.status ?? 500,
  );
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { user } = await requireTeamContext();
    const { candidateId } = await context.params;
    const candidate = await getCareerCandidate({ candidateId, userId: user.id });
    return NextResponse.json({ ok: true, candidate });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { user } = await requireTeamContext();
    const { candidateId } = await context.params;
    const parsed = validateBody(PatchBody, await request.json());
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
    const { mode, targetExperienceId, ...fields } = parsed.data;
    const candidate = await updateCareerCandidate({
      candidateId,
      userId: user.id,
      mode,
      targetExperienceId,
      fields,
    });
    return NextResponse.json({ ok: true, candidate });
  } catch (error) {
    return errorResponse(error);
  }
}
