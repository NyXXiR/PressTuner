import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import { replayPressAiProcessEvents } from "@/lib/services/press-ai-debugger/processEventService";
import { apiError } from "@/lib/utils/api";
import { validateQuery } from "@/lib/utils/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QuerySchema = z.object({ afterSequence: z.coerce.number().int().nonnegative().optional() });

export async function GET(req: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const { team, user } = await requireTeamContext();
    const { runId } = await context.params;
    const parsed = validateQuery(QuerySchema, Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status, headers: { "Cache-Control": "no-store" } });
    const result = await replayPressAiProcessEvents({ teamId: team.id, userId: user.id, runId, afterSequence: parsed.data.afterSequence });
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const status = error?.message === "PRESS_AGENT_DEBUG_RUN_NOT_FOUND" ? 404 : error?.status ?? 500;
    return NextResponse.json(apiError(error?.code ?? "PRESS_AGENT_DEBUG_REPLAY_FAILED", status === 404 ? "Debugger run not found" : "Failed to replay debugger run", status).body, { status, headers: { "Cache-Control": "no-store" } });
  }
}
