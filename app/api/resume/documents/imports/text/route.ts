import { NextRequest, NextResponse } from "next/server";

import { ResumeDocumentQuickFillRequestSchema } from "@/domain/resume-documents/quickFill";
import { requireTeamContext } from "@/lib/auth";
import { resumeDocumentApiError } from "@/lib/services/resume/resumeDocumentApiError";
import { createResumeDocumentQuickFill } from "@/lib/services/resume/resumeDocumentQuickFillService";
import { validateBody } from "@/lib/utils/validate";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();
    const parsed = validateBody(ResumeDocumentQuickFillRequestSchema, await request.json());
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
    const item = await createResumeDocumentQuickFill({
      userId: user.id,
      teamId: team.id,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, import: item }, { status: 201 });
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}
