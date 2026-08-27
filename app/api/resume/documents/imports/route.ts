import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { resumeDocumentApiError } from "@/lib/services/resume/resumeDocumentApiError";
import {
  createResumeDocumentImport,
  listResumeDocumentImports,
} from "@/lib/services/resume/resumeDocumentImportService";
import { apiError } from "@/lib/utils/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { user } = await requireTeamContext();
    return NextResponse.json({ ok: true, imports: await listResumeDocumentImports(user.id) });
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      const result = apiError("RESUME_DOCUMENT_IMPORT_FILE_REQUIRED", "PDF file is required", 400);
      return NextResponse.json(result.body, { status: result.status });
    }
    const item = await createResumeDocumentImport({
      userId: user.id,
      teamId: team.id,
      originalName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json({ ok: true, import: item }, { status: 202 });
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}
