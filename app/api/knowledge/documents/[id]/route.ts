import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { deleteKnowledgeDocument } from "@/lib/services/knowledge/knowledgeDocumentService";
import { apiError } from "@/lib/utils/api";

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { team } = await requireTeamContext();
    const { id } = await context.params;
    const result = await deleteKnowledgeDocument({
      teamId: team.id,
      documentId: id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    const status = error?.status ?? 500;
    return NextResponse.json(
      apiError(
        error?.code ?? "KNOWLEDGE_DOCUMENT_DELETE_FAILED",
        error?.message ?? "Failed to delete knowledge document",
        status,
        { details: error?.details },
      ).body,
      { status },
    );
  }
}
