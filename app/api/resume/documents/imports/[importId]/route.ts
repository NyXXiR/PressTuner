import { NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { resumeDocumentApiError } from "@/lib/services/resume/resumeDocumentApiError";
import { deleteResumeDocumentImport, getResumeDocumentImport } from "@/lib/services/resume/resumeDocumentImportService";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ importId: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { importId } = await params;
    return NextResponse.json({
      ok: true,
      import: await getResumeDocumentImport({ importId, userId: user.id }),
    });
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ importId: string }> },
) {
  try {
    const { user } = await requireTeamContext();
    const { importId } = await params;
    await deleteResumeDocumentImport({ importId, userId: user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return resumeDocumentApiError(error);
  }
}
