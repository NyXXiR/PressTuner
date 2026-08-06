import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { replayPressAiProcessEvents } from "@/lib/services/press-ai-debugger/processEventService";
import { ContinueProcessDebugRunSchema, continueProcessDebugRun } from "@/lib/services/press-ai-debugger/processRunService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

const NO_STORE = { "Cache-Control": "no-store" };
export const maxDuration = 150;

export async function POST(req: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const { team, user } = await requireTeamContext(); const { runId } = await context.params;
    const parsed = validateBody(ContinueProcessDebugRunSchema, await req.json());
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status, headers: NO_STORE });
    const before = await replayPressAiProcessEvents({ teamId: team.id, userId: user.id, runId });
    const afterSequence = Math.max(0, ...before.events.map((event) => event.sequence)); const encoder = new TextEncoder(); let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (value: string) => { if (!closed) controller.enqueue(encoder.encode(value)); };
        let failure: any = null;
        try { await continueProcessDebugRun({ teamId: team.id, userId: user.id, runId, input: parsed.data, onEvent: (event) => send(`event: workflow\ndata: ${JSON.stringify(event)}\n\n`) }); } catch (error) { failure = error; }
        try { const replay = await replayPressAiProcessEvents({ teamId: team.id, userId: user.id, runId, afterSequence }); for (const event of replay.events) send(`event: workflow\ndata: ${JSON.stringify(event)}\n\n`); } catch { /* preserve execution failure */ }
        if (failure) send(`event: stream.error\ndata: ${JSON.stringify({ code: failure?.code ?? failure?.message ?? "PRESS_AI_PROCESS_CONTINUE_FAILED" })}\n\n`); else send("event: stream.complete\ndata: {}\n\n");
        closed = true; controller.close();
      },
      cancel() { closed = true; },
    });
    return new Response(stream, { status: 201, headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  } catch (error: any) { const status = error?.status ?? 500; return NextResponse.json(apiError(error?.code ?? "PRESS_AI_PROCESS_CONTINUE_FAILED", error?.message ?? "Failed", status).body, { status, headers: NO_STORE }); }
}
