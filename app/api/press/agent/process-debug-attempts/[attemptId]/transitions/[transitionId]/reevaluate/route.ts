import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { ReevaluatePressAiTransitionSchema, reevaluatePressAiTransition } from "@/lib/services/press-ai-debugger/semanticEvaluationService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest, context: { params: Promise<{ attemptId: string; transitionId: string }> }) {
  try {
    const { team, user } = await requireTeamContext();
    const params = await context.params;
    const body = validateBody(ReevaluatePressAiTransitionSchema, await req.json());
    if (!body.ok) return NextResponse.json(body.body, { status: body.status, headers });
    return NextResponse.json(await reevaluatePressAiTransition({ teamId: team.id, userId: user.id, ...params, input: body.data }), { status: 200, headers });
  } catch (error: any) {
    const status = error?.status ?? 500;
    return NextResponse.json(apiError(error?.code ?? error?.message ?? "PRESS_AI_DEBUG_REEVALUATE_FAILED", error?.message ?? "Failed", status).body, { status, headers });
  }
}
