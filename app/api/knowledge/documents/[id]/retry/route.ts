import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { retryKnowledgeDocument } from "@/lib/services/knowledge/knowledgeDocumentService";
import { apiError } from "@/lib/utils/api";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { team } = await requireTeamContext();
    const { id } = await context.params;
    const queue = await retryKnowledgeDocument({
      teamId: team.id,
      documentId: id,
    });
    return NextResponse.json({ ok: true, queue });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "";
    const status = error?.status ?? (message === "KNOWLEDGE_DOCUMENT_NOT_FOUND" ? 404 : 500);
    return NextResponse.json(
      apiError(
        message || "KNOWLEDGE_DOCUMENT_RETRY_FAILED",
        message || "Failed to retry document indexing",
        status,
        { details: error?.details },
      ).body,
      { status },
    );
  }
}
