import { CareerCandidateStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { resumeDocumentApiError } from "@/lib/services/resume/resumeDocumentApiError";
import { listResumeDocumentCandidates } from "@/lib/services/resume/resumeDocumentCandidateService";

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireTeamContext();
    const { searchParams } = new URL(request.url);
    const rawStatus = searchParams.get("status");
    const status = rawStatus && Object.values(CareerCandidateStatus).includes(rawStatus as CareerCandidateStatus)
      ? rawStatus as CareerCandidateStatus
      : undefined;
    const candidates = await listResumeDocumentCandidates({
      userId: user.id,
      importId: searchParams.get("importId") ?? undefined,
      status,
      pendingApplication: searchParams.get("pendingApplication") === "true",
    });
    return NextResponse.json({ ok: true, candidates });
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}
