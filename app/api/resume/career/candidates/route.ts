import {
  CareerCandidateMode,
  CareerCandidateOrigin,
  CareerCandidateStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { careerCandidateCreateFieldsSchema } from "@/domain/career-memory/candidatePolicy";
import {
  createCareerCandidate,
  listCareerCandidates,
} from "@/lib/services/resume/careerCandidateService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

const CandidateBody = careerCandidateCreateFieldsSchema.extend({
  mode: z.nativeEnum(CareerCandidateMode).default(CareerCandidateMode.CREATE),
  questionId: z.string().min(1).nullable().optional(),
  targetExperienceId: z.string().min(1).nullable().optional(),
});

function errorResponse(error: unknown) {
  const value = error as { status?: number; code?: string; message?: string };
  const result = apiError(
    value.code ?? "CAREER_CANDIDATE_REQUEST_FAILED",
    value.message ?? "Career candidate request failed",
    value.status ?? 500,
  );
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireTeamContext();
    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get("status");
    const status =
      rawStatus && Object.values(CareerCandidateStatus).includes(rawStatus as CareerCandidateStatus)
        ? (rawStatus as CareerCandidateStatus)
        : undefined;
    const candidates = await listCareerCandidates({
      userId: user.id,
      status,
      sourceId: searchParams.get("sourceId") ?? undefined,
    });
    return NextResponse.json({ ok: true, candidates });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireTeamContext();
    const parsed = validateBody(CandidateBody, await request.json());
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
    const { mode, questionId, targetExperienceId, ...fields } = parsed.data;
    const candidate = await createCareerCandidate({
      userId: user.id,
      origin: CareerCandidateOrigin.DIRECT_INPUT,
      mode,
      questionId,
      targetExperienceId,
      fields,
    });
    return NextResponse.json({ ok: true, candidate }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
