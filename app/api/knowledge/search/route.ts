import { KnowledgeChunkRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAndIncrementQuota } from "@/lib/services/usageService";
import { searchKnowledge } from "@/lib/services/knowledge/knowledgeRetrievalService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

const BodySchema = z.object({
  query: z.string().min(1).max(4_000),
  topK: z.number().int().min(1).max(20).optional(),
  documentIds: z.array(z.string().min(1)).max(50).optional(),
  roles: z.array(z.enum(KnowledgeChunkRole)).min(1).max(4).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { team, user } = await requireTeamContext();
    const parsed = validateBody(BodySchema, await req.json());
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    await prisma.$transaction((tx) =>
      verifyAndIncrementQuota(tx, {
        teamId: team.id,
        userId: user.id,
        type: "ARTICLE",
        action: "press_panel_chat",
      }),
    );
    const result = await searchKnowledge({
      teamId: team.id,
      ...parsed.data,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    const status = error?.status ?? 500;
    return NextResponse.json(
      apiError(
        error?.code ?? "KNOWLEDGE_SEARCH_FAILED",
        error?.message ?? "Failed to search knowledge",
        status,
      ).body,
      { status },
    );
  }
}
