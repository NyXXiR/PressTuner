import { NextRequest, NextResponse } from "next/server";
import { requireTeamContext } from "@/lib/auth";
import { listPressAiProcessRuns, replayPressAiProcessEvents } from "@/lib/services/press-ai-debugger/processEventService";
import { StartProcessDebugRunSchema, startProcessDebugRun } from "@/lib/services/press-ai-debugger/processRunService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 150;
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  try { const { team, user } = await requireTeamContext(); return NextResponse.json({ ok: true, runs: await listPressAiProcessRuns({ teamId: team.id, userId: user.id }) }, { headers: NO_STORE }); }
  catch (error: any) { const status = error?.status ?? 500; return NextResponse.json(apiError(error?.code ?? "PRESS_AI_PROCESS_HISTORY_FAILED", error?.message ?? "Failed", status).body, { status, headers: NO_STORE }); }
}

export async function POST(req: NextRequest) {
  try {
    const { team, user } = await requireTeamContext(); const parsed = validateBody(StartProcessDebugRunSchema, await req.json());
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status, headers: NO_STORE });
    const encoder = new TextEncoder(); let closed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (value: string) => { if (!closed) controller.enqueue(encoder.encode(value)); };
        try {
          const result = await startProcessDebugRun({ teamId: team.id, userId: user.id, input: parsed.data, onEvent: (event) => send(`event: workflow\ndata: ${JSON.stringify(event)}\n\n`) });
          if (parsed.data.processId === "press-creation" && result && typeof result === "object" && "runId" in result) { const replay = await replayPressAiProcessEvents({ teamId: team.id, userId: user.id, runId: String(result.runId) }); for (const event of replay.events) send(`event: workflow\ndata: ${JSON.stringify(event)}\n\n`); }
          send("event: stream.complete\ndata: {}\n\n");
        } catch (error: any) {
          if (typeof error?.runId === "string") { try { const replay = await replayPressAiProcessEvents({ teamId: team.id, userId: user.id, runId: error.runId }); for (const event of replay.events) send(`event: workflow\ndata: ${JSON.stringify(event)}\n\n`); } catch { /* preserve execution failure */ } }
          send(`event: stream.error\ndata: ${JSON.stringify({ code: error?.code ?? error?.message ?? "PRESS_AI_PROCESS_FAILED", runId: error?.runId ?? null, articleId: error?.articleId ?? null })}\n\n`);
        } finally { closed = true; controller.close(); }
      },
      cancel() { closed = true; },
    });
    return new Response(stream, { status: 201, headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  } catch (error: any) { const status = error?.status ?? 500; return NextResponse.json(apiError(error?.code ?? "PRESS_AI_PROCESS_START_FAILED", error?.message ?? "Failed", status).body, { status, headers: NO_STORE }); }
}
