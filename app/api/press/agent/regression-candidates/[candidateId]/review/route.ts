import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAdmin, requireTeamContext } from "@/lib/auth";
import { reviewRegressionCandidate } from "@/lib/services/press-agent/regressionCandidateService";
import { validateBody } from "@/lib/utils/validate";

const BodySchema = z
  .object({
    decision: z.enum(["ACCEPTED", "REJECTED"]),
    reason: z.string().max(2_000).optional(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ candidateId: string }> },
) {
  const { team, user, role } = await requireTeamContext();
  if (!isAdmin(role)) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const parsed = validateBody(BodySchema, await request.json());
  if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
  const { candidateId } = await context.params;
  const candidate = await reviewRegressionCandidate({
    teamId: team.id,
    candidateId,
    reviewerId: user.id,
    ...parsed.data,
  });
  return NextResponse.json({ ok: true, candidate });
}
