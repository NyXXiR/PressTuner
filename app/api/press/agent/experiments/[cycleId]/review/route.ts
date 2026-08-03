import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { isAdmin, requireTeamContext } from "@/lib/auth";
import { reviewAgentExperimentCycle } from "@/lib/services/press-agent/experimentPersistenceService";
import { validateBody } from "@/lib/utils/validate";

const BodySchema = z
  .object({
    decision: z.enum(["APPROVED", "REJECTED"]),
    note: z.string().max(2_000).optional(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ cycleId: string }> },
) {
  const { team, user, role } = await requireTeamContext();
  if (!isAdmin(role)) {
    return NextResponse.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403 });
  }
  const parsed = validateBody(BodySchema, await request.json());
  if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status });
  if (parsed.data.decision === "REJECTED" && !parsed.data.note?.trim()) {
    return NextResponse.json(
      { ok: false, error: { code: "AGENT_EXPERIMENT_REJECTION_NOTE_REQUIRED" } },
      { status: 400 },
    );
  }
  const { cycleId } = await context.params;
  const cycle = await reviewAgentExperimentCycle({
    teamId: team.id,
    cycleId,
    reviewerId: user.id,
    ...parsed.data,
  });
  return NextResponse.json({ ok: true, cycle });
}
