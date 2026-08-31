import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { resumeDocumentApiError } from "@/lib/services/resume/resumeDocumentApiError";
import { acknowledgeResumeDocumentCandidateApplied } from "@/lib/services/resume/resumeDocumentCandidateService";
import { validateBody } from "@/lib/utils/validate";

const AppliedBody = z.object({
  payloadHash: z.string().min(1).max(128),
  documentVersion: z.number().int().positive(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { candidateId } = await params;
    const parsed = validateBody(AppliedBody, await request.json());
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
    const response = NextResponse.json({
      ok: true,
      candidate: await acknowledgeResumeDocumentCandidateApplied({ candidateId, userId: user.id, ...parsed.data }),
    });
    // Compatibility-only: new clients persist and acknowledge atomically via
    // POST /candidates/:candidateId/apply.
    response.headers.set("Deprecation", "@1788134400");
    response.headers.set("Link", `</api/resume/documents/candidates/${candidateId}/apply>; rel="successor-version"`);
    return response;
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}
