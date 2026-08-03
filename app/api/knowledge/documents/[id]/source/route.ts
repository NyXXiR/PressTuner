import { NextRequest } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildPdfContentDisposition } from "@/lib/services/knowledge/pdfSource";
import { apiError } from "@/lib/utils/api";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { team } = await requireTeamContext();
    const { id } = await context.params;
    const document = await prisma.knowledgeDocument.findFirst({
      where: { id, teamId: team.id, sourceData: { not: null } },
      select: { originalName: true, sourceData: true },
    });
    if (!document?.sourceData) {
      return Response.json(
        apiError("KNOWLEDGE_DOCUMENT_NOT_FOUND", "Document not found", 404).body,
        { status: 404 },
      );
    }
    const bytes = Buffer.from(document.sourceData);
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": buildPdfContentDisposition(document.originalName),
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
      },
    });
  } catch (error: any) {
    const status = error?.status ?? 500;
    return Response.json(
      apiError(
        error?.code ?? "KNOWLEDGE_SOURCE_READ_FAILED",
        error?.message ?? "Failed to read source",
        status,
      ).body,
      { status },
    );
  }
}
