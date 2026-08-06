import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamContext } from "@/lib/auth";
import { replayPressAiProcessEvents } from "@/lib/services/press-ai-debugger/processEventService";
import { apiError } from "@/lib/utils/api";
import { validateQuery } from "@/lib/utils/validate";
const QuerySchema = z.object({ afterSequence: z.coerce.number().int().nonnegative().optional() }); const NO_STORE = { "Cache-Control": "no-store" };
export async function GET(req: NextRequest, context: { params: Promise<{ runId: string }> }) { try { const { team, user } = await requireTeamContext(); const { runId } = await context.params; const parsed = validateQuery(QuerySchema, Object.fromEntries(req.nextUrl.searchParams)); if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status, headers: NO_STORE }); return NextResponse.json({ ok: true, ...await replayPressAiProcessEvents({ teamId: team.id, userId: user.id, runId, afterSequence: parsed.data.afterSequence }) }, { headers: NO_STORE }); } catch (error: any) { const status = error?.status ?? 500; return NextResponse.json(apiError(error?.code ?? "PRESS_AI_PROCESS_REPLAY_FAILED", error?.message ?? "Failed", status).body, { status, headers: NO_STORE }); } }

