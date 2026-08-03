import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { decideArticleEvidenceCandidate } from "@/lib/services/article/articleGroundingService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

const BodySchema = z.object({ decision: z.enum(["ACCEPTED", "REJECTED"]) });

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; candidateId: string }> },
) {
  try {
    const { team } = await requireTeamContext();
    const parsed = validateBody(BodySchema, await request.json());
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }
    const { id, candidateId } = await context.params;
    return NextResponse.json({
      ok: true,
      ...(await decideArticleEvidenceCandidate({
        teamId: team.id,
        articleId: id,
        candidateId,
        decision: parsed.data.decision,
      })),
    });
  } catch (error: any) {
    const status = error?.message?.includes("NOT_FOUND") ? 404 : 500;
    return NextResponse.json(
      apiError("ARTICLE_EVIDENCE_DECISION_FAILED", error?.message, status).body,
      { status },
    );
  }
}
