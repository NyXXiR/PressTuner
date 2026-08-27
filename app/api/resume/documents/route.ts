import { NextResponse } from "next/server";

import { ResumeDocumentSaveRequestSchema } from "@/domain/resume-documents/persistence";
import { requireTeamContext } from "@/lib/auth";
import { resumeDocumentApiError } from "@/lib/services/resume/resumeDocumentApiError";
import {
  getResumeDocument,
  saveResumeDocument,
} from "@/lib/services/resume/resumeDocumentPersistenceService";
import { serviceError } from "@/lib/services/serviceError";
import { validateBody } from "@/lib/utils/validate";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { user } = await requireTeamContext();
    return NextResponse.json({ ok: true, document: await getResumeDocument(user.id) });
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const { user } = await requireTeamContext();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw serviceError(400, "RESUME_DOCUMENT_INVALID_JSON", "Request body must be valid JSON");
    }
    const parsed = validateBody(ResumeDocumentSaveRequestSchema, body);
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
    return NextResponse.json({
      ok: true,
      document: await saveResumeDocument({ userId: user.id, ...parsed.data }),
    });
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}
