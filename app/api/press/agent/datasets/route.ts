import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAdmin, requireTeamContext } from "@/lib/auth";
import { promoteReviewedCandidates } from "@/lib/services/press-agent/datasetPromotionService";
import { validateBody } from "@/lib/utils/validate";

const BodySchema = z
  .object({
    parentDatasetVersionId: z.string().min(1),
    candidateIds: z.array(z.string().min(1)).min(1).max(100),
    name: z.string().min(1).max(200),
  })
  .strict();

export async function POST(request: NextRequest) {
  const { team, user, role } = await requireTeamContext();
  if (!isAdmin(role)) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const parsed = validateBody(BodySchema, await request.json());
  if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
  const dataset = await promoteReviewedCandidates({
    teamId: team.id,
    reviewerId: user.id,
    ...parsed.data,
  });
  return NextResponse.json({ ok: true, dataset }, { status: 201 });
}
