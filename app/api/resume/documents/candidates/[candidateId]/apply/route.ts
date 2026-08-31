import { NextRequest, NextResponse } from "next/server";

import { ResumeDocumentSaveRequestSchema } from "@/domain/resume-documents/persistence";
import { requireTeamContext } from "@/lib/auth";
import { resumeDocumentApiError } from "@/lib/services/resume/resumeDocumentApiError";
import { applyResumeDocumentCandidate } from "@/lib/services/resume/resumeDocumentCandidateService";
import { validateBody } from "@/lib/utils/validate";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { candidateId } = await params;
    const parsed = validateBody(ResumeDocumentSaveRequestSchema, await request.json());
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
    return NextResponse.json({
      ok: true,
      ...(await applyResumeDocumentCandidate({
        candidateId,
        userId: user.id,
        ...parsed.data,
      })),
    });
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}
