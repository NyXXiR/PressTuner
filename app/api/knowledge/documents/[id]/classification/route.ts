import { KnowledgeChunkRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { setKnowledgeClassificationOverride } from "@/lib/services/knowledge/knowledgeClassificationService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

const BodySchema = z.object({
  override: z.enum(KnowledgeChunkRole).nullable(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { team } = await requireTeamContext();
    const parsed = validateBody(BodySchema, await request.json());
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const { id } = await context.params;
    const result = await setKnowledgeClassificationOverride({
      teamId: team.id,
      documentId: id,
      override: parsed.data.override,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    const status =
      error instanceof Error &&
      error.message === "KNOWLEDGE_DOCUMENT_NOT_FOUND"
        ? 404
        : (error?.status ?? 500);
    return NextResponse.json(
      apiError(
        error?.code ?? "KNOWLEDGE_CLASSIFICATION_UPDATE_FAILED",
        error?.message ?? "Failed to update knowledge classification",
        status,
      ).body,
      { status },
    );
  }
}
