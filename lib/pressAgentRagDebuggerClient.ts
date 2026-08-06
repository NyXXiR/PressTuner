import {
  PRESS_AGENT_WORKFLOW_STAGE_IDS,
  parsePressAgentWorkflowEvent,
  type PressAgentWorkflowEventV1,
  type PressAgentWorkflowStageId,
} from "@/domain/evaluation/pressAgentWorkflowEvents";
import { z } from "zod";
import type { PressAgentRagDebuggerDocument, StartRagDebuggerRunRequest } from "@/domain/evaluation/pressAgentRagDebugger";
import type { RagDebuggerDetailResponse } from "@/domain/evaluation/pressAgentRagDebuggerDetails";

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

export async function startPressAgentRagDebuggerRun(args: StartRagDebuggerRunRequest & { onEvent: (event: PressAgentWorkflowEventV1) => void; signal?: AbortSignal }) {
  const { onEvent, signal, ...request } = args;
  const response = await fetch("/api/press/agent/rag-debug-runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal });
  return parsePressAgentWorkflowSse(response, onEvent);
}

const KnowledgeDocumentSchema = z.object({ id: z.string(), originalName: z.string(), status: z.string(), pageCount: z.number().int().nullable(), chunkCount: z.number().int().nonnegative(), activeGenerationId: z.string().nullable(), hasPendingReplacement: z.boolean() }).passthrough();

export async function fetchPressAgentRagDebuggerDocuments(): Promise<PressAgentRagDebuggerDocument[]> {
  const body = await jsonOrThrow(await fetch("/api/knowledge/documents", { cache: "no-store" }));
  const parsed = z.object({ documents: z.array(KnowledgeDocumentSchema) }).passthrough().parse(body);
  return parsed.documents.map((document) => {
    const selectable = document.status === "READY" && document.activeGenerationId !== null && document.chunkCount > 0 && !document.hasPendingReplacement;
    const readinessReason = selectable ? null : document.hasPendingReplacement ? "새 버전으로 교체 중입니다." : document.status !== "READY" ? `현재 상태: ${document.status}` : document.activeGenerationId === null ? "활성 인덱스가 없습니다." : "검색 가능한 청크가 없습니다.";
    return { id: document.id, name: document.originalName, status: document.status, pageCount: document.pageCount, chunkCount: document.chunkCount, selectable, readinessReason };
  });
}

const DetailEnvelopeSchema = z.object({
  schemaVersion: z.literal("press-agent-rag-debug-detail/v1"),
  run: z.object({ id: z.string(), status: z.string(), createdAt: z.string().datetime({ offset: true }), completedAt: z.string().datetime({ offset: true }).nullable() }).strict(),
  stageId: z.enum(PRESS_AGENT_WORKFLOW_STAGE_IDS),
  stageState: z.enum(["waiting", "running", "succeeded", "warning", "failed", "blocked", "skipped"]),
  availability: z.enum(["available", "pending", "not_applicable", "unavailable"]),
  message: z.string().nullable(),
  detail: z.record(z.string(), z.unknown()).nullable(),
}).strict();

export async function fetchPressAgentRagDebuggerDetail(runId: string, stageId: PressAgentWorkflowStageId, signal?: AbortSignal): Promise<RagDebuggerDetailResponse> {
  const body = await jsonOrThrow(await fetch(`/api/press/agent/rag-debug-runs/${encodeURIComponent(runId)}/details?stageId=${encodeURIComponent(stageId)}`, { cache: "no-store", signal }));
  const parsed = DetailEnvelopeSchema.parse(body);
  if (parsed.run.id !== runId || parsed.stageId !== stageId) throw new Error("PRESS_AGENT_DEBUG_DETAIL_STALE");
  return parsed;
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
