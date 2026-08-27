import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { resumeDocumentApiError } from "@/lib/services/resume/resumeDocumentApiError";
import { decideResumeDocumentCandidate } from "@/lib/services/resume/resumeDocumentCandidateService";
import { validateBody } from "@/lib/utils/validate";

const DecisionBody = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  rejectionReason: z.string().trim().max(2_000).optional(),
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
    return NextResponse.json({
      ok: true,
      ...(await decideResumeDocumentCandidate({ candidateId, userId: user.id, ...parsed.data })),
    });
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}
