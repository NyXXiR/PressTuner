import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import {
  createKnowledgeDocument,
  listKnowledgeDocuments,
} from "@/lib/services/knowledge/knowledgeDocumentService";
import { apiError } from "@/lib/utils/api";

export async function GET() {
  try {
    const { team } = await requireTeamContext();
    const result = await listKnowledgeDocuments(team.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    const status = error?.status ?? 500;
    return NextResponse.json(
      apiError(
        error?.code ?? "KNOWLEDGE_DOCUMENT_LIST_FAILED",
        error?.message ?? "Failed to list knowledge documents",
        status,
      ).body,
      { status },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, team } = await requireTeamContext();
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        apiError("KNOWLEDGE_FILE_REQUIRED", "PDF file is required", 400).body,
        { status: 400 },
      );
    }

    const result = await createKnowledgeDocument({
      teamId: team.id,
      userId: user.id,
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
        error?.code ?? message.split(":")[0] ?? "KNOWLEDGE_UPLOAD_FAILED",
        message || "Failed to upload knowledge document",
        status,
        { details: error?.details },
      ).body,
      { status, headers },
    );
  }
}
