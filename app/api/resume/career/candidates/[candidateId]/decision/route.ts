import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { decideCareerCandidate } from "@/lib/services/resume/careerCandidateService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

const DecisionBody = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  rejectionReason: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { candidateId } = await params;
    const parsed = validateBody(DecisionBody, await request.json());
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
    const result = await decideCareerCandidate({
      candidateId,
      userId: user.id,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const value = error as { status?: number; code?: string; message?: string };
    const result = apiError(
      value.code ?? "CAREER_CANDIDATE_DECISION_FAILED",
      value.message ?? "Career candidate decision failed",
      value.status ?? 500,
    );
    return NextResponse.json(result.body, { status: result.status });
  }
}
