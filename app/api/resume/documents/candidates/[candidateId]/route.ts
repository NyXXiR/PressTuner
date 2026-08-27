import { ResumeDocumentApplyMode } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { ResumeDocumentCandidatePayloadSchema } from "@/domain/resume-documents/importCandidate";
import { resumeDocumentApiError } from "@/lib/services/resume/resumeDocumentApiError";
import { updateResumeDocumentCandidate } from "@/lib/services/resume/resumeDocumentCandidateService";
import { validateBody } from "@/lib/utils/validate";

const PatchBody = z.object({
  payload: ResumeDocumentCandidatePayloadSchema.optional(),
  targetSectionId: z.string().trim().min(1).max(200).optional(),
  applyMode: z.nativeEnum(ResumeDocumentApplyMode).optional(),
  expectedUpdatedAt: z.iso.datetime().optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { candidateId } = await params;
    const parsed = validateBody(PatchBody, await request.json());
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
    return NextResponse.json({
      ok: true,
      candidate: await updateResumeDocumentCandidate({
        candidateId,
        userId: user.id,
        ...parsed.data,
        expectedUpdatedAt: parsed.data.expectedUpdatedAt ? new Date(parsed.data.expectedUpdatedAt) : undefined,
      }),
    });
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}
