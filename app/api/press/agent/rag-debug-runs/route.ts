import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireTeamContext } from "@/lib/auth";
import {
  consumePressAgentRagDebuggerQuota,
  executePressAgentRagDebuggerRun,
  listPressAgentRagDebuggerRuns,
} from "@/lib/services/press-agent/pressAgentRagDebuggerService";
import { apiError } from "@/lib/utils/api";
import { validateBody } from "@/lib/utils/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 150;

const BodySchema = z.object({ prompt: z.string().trim().min(1).max(12_000), articleId: z.string().min(1).nullable().optional() }).strict();
const STREAM_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
};

export async function GET() {
  try {
    const { team, user } = await requireTeamContext();
    const runs = await listPressAgentRagDebuggerRuns({ teamId: team.id, userId: user.id });
    return NextResponse.json({ ok: true, runs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    const status = error?.status ?? 500;
    return NextResponse.json(apiError(error?.code ?? "PRESS_AGENT_DEBUG_HISTORY_FAILED", error?.message ?? "Failed to load debugger history", status).body, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { team, user } = await requireTeamContext();
    const parsed = validateBody(BodySchema, await req.json());
    if (!parsed.ok) return NextResponse.json(parsed.body, { status: parsed.status, headers: { "Cache-Control": "no-store" } });
    await consumePressAgentRagDebuggerQuota({ teamId: team.id, userId: user.id, articleId: parsed.data.articleId });
    const encoder = new TextEncoder();
    let keepalive: ReturnType<typeof setInterval> | undefined;
    let streamClosed = false;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (value: string) => {
          if (streamClosed) return;
          try { controller.enqueue(encoder.encode(value)); } catch { streamClosed = true; }
        };
        keepalive = setInterval(() => send(": keepalive\n\n"), 15_000);
        try {
          await executePressAgentRagDebuggerRun({
            teamId: team.id,
            userId: user.id,
            ...parsed.data,
            observer: (event) => send(`event: workflow\ndata: ${JSON.stringify(event)}\n\n`),
          });
          send("event: stream.complete\ndata: {}\n\n");
        } catch {
          send("event: stream.error\ndata: {\"code\":\"PRESS_AGENT_DEBUG_STREAM_FAILED\"}\n\n");
        } finally {
          if (keepalive) clearInterval(keepalive);
          if (!streamClosed) {
            streamClosed = true;
            try { controller.close(); } catch { /* client already disconnected */ }
          }
        }
      },
      cancel() {
        streamClosed = true;
        if (keepalive) clearInterval(keepalive);
      },
    });
    return new Response(stream, { status: 201, headers: STREAM_HEADERS });
  } catch (error: any) {
    const status = error?.message === "PRESS_AGENT_ARTICLE_SCOPE_MISMATCH" ? 403 : error?.status ?? 500;
    return NextResponse.json(apiError(error?.code ?? "PRESS_AGENT_DEBUG_RUN_FAILED", error?.message ?? "Failed to start debugger run", status).body, { status, headers: { "Cache-Control": "no-store" } });
  }
}
