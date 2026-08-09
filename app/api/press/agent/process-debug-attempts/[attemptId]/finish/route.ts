import { NextRequest, NextResponse } from "next/server";

import { requireTeamContext } from "@/lib/auth";
import { FinishCheckpointAttemptSchema, finishCheckpointAttempt } from "@/lib/services/press-ai-debugger/checkpointDebuggerService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(req: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const { team, user } = await requireTeamContext();
    const { attemptId } = await context.params;
    const body = validateBody(FinishCheckpointAttemptSchema, await req.json());
    if (!body.ok) return NextResponse.json(body.body, { status: body.status, headers });
    return NextResponse.json(await finishCheckpointAttempt({ teamId: team.id, userId: user.id, attemptId, input: body.data }), { status: 200, headers });
  } catch (error: any) {
    const status = error?.status ?? 500;
    return NextResponse.json(apiError(error?.code ?? error?.message ?? "PRESS_AI_DEBUG_FINISH_FAILED", error?.message ?? "Failed", status).body, { status, headers });
  }
}
