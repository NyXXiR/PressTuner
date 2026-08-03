import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { replaceKnowledgeDocument } from "@/lib/services/knowledge/knowledgeDocumentService";
import { apiError } from "@/lib/utils/api";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { team, user } = await requireTeamContext();
    const { id } = await context.params;
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        apiError("KNOWLEDGE_FILE_REQUIRED", "PDF file is required", 400).body,
        { status: 400 },
      );
    }
    const result = await replaceKnowledgeDocument({
      teamId: team.id,
      userId: user.id,
      documentId: id,
      file,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "";
    const status =
      message.includes("UNSUPPORTED_TYPE") || message.includes("INVALID_PDF")
        ? 415
        : message.includes("TOO_LARGE")
          ? 413
          : error?.status ?? 500;
    const headers =
      status === 429 && error?.details?.retryAfterSeconds
        ? { "Retry-After": String(error.details.retryAfterSeconds) }
        : undefined;
    return NextResponse.json(
      apiError(
        error?.code ?? "KNOWLEDGE_REPLACEMENT_FAILED",
        message || "Failed to replace knowledge document",
        status,
        { details: error?.details },
      ).body,
      { status, headers },
    );
  }
}
