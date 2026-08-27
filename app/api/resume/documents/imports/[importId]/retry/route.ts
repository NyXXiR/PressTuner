import { NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { resumeDocumentApiError } from "@/lib/services/resume/resumeDocumentApiError";
import { retryResumeDocumentImport } from "@/lib/services/resume/resumeDocumentImportService";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ importId: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { importId } = await params;
    return NextResponse.json({
      ok: true,
      import: await retryResumeDocumentImport({ importId, userId: user.id }),
    });
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}
