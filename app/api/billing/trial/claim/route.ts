import { NextResponse } from "next/server";
import { z } from "zod";

import { isAdmin, requireTeamContext } from "@/lib/auth";
import { claimProTrialForTeam } from "@/lib/services/trialService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

const BodySchema = z.object({
  surface: z.enum(["PRESS", "RESUME"]).default("PRESS"),
});

export async function POST(req: Request) {
  try {
    const { user, team, role } = await requireTeamContext();
    if (!isAdmin(role)) {
      const err = apiError("FORBIDDEN", "FORBIDDEN", 403);
      return NextResponse.json(err.body, { status: err.status });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = validateBody(BodySchema, body);
    if (!parsed.ok) {
      return NextResponse.json(parsed.body, { status: parsed.status });
    }

    const result = await claimProTrialForTeam({
      teamId: team.id,
      userId: user.id,
      surface: parsed.data.surface,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    const status = typeof error?.status === "number" ? error.status : 500;
    const err = apiError(
      error?.code ?? "TRIAL_CLAIM_FAILED",
      error?.message ?? "TRIAL_CLAIM_FAILED",
      status,
      error?.details ? { details: error.details } : undefined,
    );
    return NextResponse.json(err.body, { status: err.status });
  }
}
