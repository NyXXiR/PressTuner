import {
  parsePressAgentWorkflowEvent,
  type PressAgentWorkflowEventV1,
} from "@/domain/evaluation/pressAgentWorkflowEvents";

export type PressAgentRagDebuggerHistoryItem = { id: string; status: string; createdAt: string; completedAt: string | null };

export async function parsePressAgentWorkflowSse(response: Response, onEvent?: (event: PressAgentWorkflowEventV1) => void) {
  if (!response.ok || !response.body) throw new Error(`PRESS_AGENT_DEBUG_STREAM_HTTP_${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: PressAgentWorkflowEventV1[] = [];
  const seen = new Set<string>();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary: number;
    while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = buffer.slice(0, boundary);
      const delimiter = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0].length ?? 2;
      buffer = buffer.slice(boundary + delimiter);
      if (!block || block.startsWith(":")) continue;
      const lines = block.split(/\r?\n/);
      const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() ?? "message";
      if (eventName !== "workflow") continue;
      const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      try {
        const parsed = parsePressAgentWorkflowEvent(JSON.parse(data));
        if (!seen.has(parsed.eventId) && !events.some((entry) => entry.dedupeKey === parsed.dedupeKey)) {
          seen.add(parsed.eventId);
          events.push(parsed);
          onEvent?.(parsed);
        }
      } catch {
        throw new Error("PRESS_AGENT_DEBUG_EVENT_INVALID");
      }
    }
    if (done) break;
  }
  return events.sort((a, b) => a.sequence - b.sequence);
}

async function jsonOrThrow(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body?.code === "string" ? body.code : `HTTP_${response.status}`);
  return body;
}

export async function startPressAgentRagDebuggerRun(args: { prompt: string; articleId?: string | null; onEvent: (event: PressAgentWorkflowEventV1) => void; signal?: AbortSignal }) {
  const response = await fetch("/api/press/agent/rag-debug-runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: args.prompt, articleId: args.articleId }), signal: args.signal });
  return parsePressAgentWorkflowSse(response, args.onEvent);
}

export async function fetchPressAgentRagDebuggerHistory(): Promise<PressAgentRagDebuggerHistoryItem[]> {
  const body = await jsonOrThrow(await fetch("/api/press/agent/rag-debug-runs", { cache: "no-store" }));
  return body.runs;
}

export async function replayPressAgentRagDebuggerRun(runId: string, afterSequence = 0) {
  const body = await jsonOrThrow(await fetch(`/api/press/agent/rag-debug-runs/${encodeURIComponent(runId)}?afterSequence=${afterSequence}`, { cache: "no-store" }));
  return { run: body.run, events: (body.events as unknown[]).map(parsePressAgentWorkflowEvent) };
}

export async function cancelPressAgentRagDebuggerRun(runId: string) {
  await jsonOrThrow(await fetch(`/api/press/agent/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" }));
}
