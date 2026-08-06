import { z } from "zod";
import { parsePressAiProcessEvent, type PressAiProcessEvent } from "@/domain/press-ai-debugger/processEvents";

const DocumentSchema = z.object({ id: z.string(), originalName: z.string(), status: z.string(), pageCount: z.number().int().nullable().optional(), chunkCount: z.number().int().nonnegative().optional(), activeGenerationId: z.string().nullable().optional(), hasPendingReplacement: z.boolean().optional() }).passthrough();
const QuotaSchema = z.object({ activeDocumentCount: z.number().int().nonnegative(), storedBytes: z.number().int().nonnegative(), uploadsInWindow: z.number().int().nonnegative(), limits: z.object({ documents: z.number().int().positive(), storedBytes: z.number().int().positive(), uploads: z.number().int().positive(), windowSeconds: z.number().int().positive() }), retryAfterSeconds: z.number().int().nonnegative() }).passthrough();
const UploadSchema = z.object({ document: DocumentSchema, deduplicated: z.boolean(), quota: QuotaSchema }).passthrough();

export class PressAiDebuggerApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly retryAfterSeconds: number | null) { super(code); }
}

export async function uploadPressAiKnowledgePdf(file: File, fetchImpl: typeof fetch = fetch) {
  const body = new FormData();
  body.set("file", file);
  const response = await fetchImpl("/api/knowledge/documents", { method: "POST", body });
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
    const code = typeof candidate.code === "string" ? candidate.code : typeof candidate.error === "string" ? candidate.error : `KNOWLEDGE_UPLOAD_HTTP_${response.status}`;
    const retry = response.headers.get("Retry-After");
    throw new PressAiDebuggerApiError(code, response.status, retry ? Number(retry) : null);
  }
  return UploadSchema.parse(value);
}

export async function sampleAssetToFile(asset: { path: string; uploadFilename: string }, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(asset.path, { cache: "force-cache" });
  if (!response.ok) throw new PressAiDebuggerApiError(`PRESS_AI_SAMPLE_HTTP_${response.status}`, response.status, null);
  const blob = await response.blob();
  return new File([blob], asset.uploadFilename, { type: "application/pdf" });
}

export type PressAiKnowledgeDocument = { id: string; name: string; status: string; pageCount: number | null; chunkCount: number; selectable: boolean; readinessReason: string | null };

export function mapKnowledgeDocuments(input: unknown[]): PressAiKnowledgeDocument[] {
  return z.array(DocumentSchema).parse(input).map((document) => {
    const chunkCount = document.chunkCount ?? 0;
    const selectable = document.status === "READY" && Boolean(document.activeGenerationId) && chunkCount > 0 && !document.hasPendingReplacement;
    const readinessReason = selectable ? null : document.hasPendingReplacement ? "새 버전으로 교체 중입니다." : document.status !== "READY" ? `현재 상태: ${document.status}` : !document.activeGenerationId ? "활성 인덱스가 없습니다." : "검색 가능한 청크가 없습니다.";
    return { id: document.id, name: document.originalName, status: document.status, pageCount: document.pageCount ?? null, chunkCount, selectable, readinessReason };
  });
}

async function jsonOrThrow(response: Response) {
  const value = await response.json().catch(() => null);
  if (!response.ok) { const body = value && typeof value === "object" ? value as Record<string, unknown> : {}; throw new PressAiDebuggerApiError(typeof body.code === "string" ? body.code : `PRESS_AI_PROCESS_HTTP_${response.status}`, response.status, null); }
  return value as Record<string, any>;
}

export async function fetchPressAiKnowledgeDocuments(fetchImpl: typeof fetch = fetch) {
  const value = await jsonOrThrow(await fetchImpl("/api/knowledge/documents", { cache: "no-store" }));
  return { documents: mapKnowledgeDocuments(Array.isArray(value.documents) ? value.documents : []), quota: value.quota ?? null };
}

export async function parsePressAiProcessSse(response: Response, onEvent?: (event: PressAiProcessEvent) => void) {
  if (!response.ok || !response.body) throw new PressAiDebuggerApiError(`PRESS_AI_PROCESS_STREAM_HTTP_${response.status}`, response.status, null);
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; const events: PressAiProcessEvent[] = []; const ids = new Set<string>(); const keys = new Set<string>();
  while (true) {
    const { done, value } = await reader.read(); buffer += decoder.decode(value, { stream: !done }); let boundary = -1;
    while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = buffer.slice(0, boundary); const delimiter = buffer.slice(boundary).match(/^\r?\n\r?\n/)?.[0].length ?? 2; buffer = buffer.slice(boundary + delimiter);
      if (!block || block.startsWith(":")) continue; const name = block.split(/\r?\n/).find((line) => line.startsWith("event:"))?.slice(6).trim();
      const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      if (name === "stream.error") { let body: Record<string, unknown> = {}; try { body = JSON.parse(data); } catch {} const code = typeof body.code === "string" ? body.code : "PRESS_AI_PROCESS_STREAM_FAILED"; throw Object.assign(new Error(code), body); }
      if (name !== "workflow") continue;
      let event: PressAiProcessEvent; try { event = parsePressAiProcessEvent(JSON.parse(data)); } catch { throw new Error("PRESS_AI_PROCESS_EVENT_INVALID"); }
      if (!ids.has(event.eventId) && !keys.has(event.dedupeKey)) { ids.add(event.eventId); keys.add(event.dedupeKey); events.push(event); onEvent?.(event); }
    }
    if (done) break;
  }
  return events.sort((a, b) => a.sequence - b.sequence);
}

export async function startPressAiProcessRun(input: Record<string, unknown>, onEvent: (event: PressAiProcessEvent) => void, signal?: AbortSignal) {
  return parsePressAiProcessSse(await fetch("/api/press/agent/process-debug-runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal }), onEvent);
}
export async function continuePressAiProcessRun(runId: string, input: Record<string, unknown>) {
  const events = await parsePressAiProcessSse(await fetch(`/api/press/agent/process-debug-runs/${encodeURIComponent(runId)}/continue`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
  const replay = await replayPressAiProcessRun(runId);
  return { run: replay.run, events: [...events, ...replay.events.filter((entry) => !events.some((event) => event.eventId === entry.eventId))] };
}
export async function replayPressAiProcessRun(runId: string) { const value = await jsonOrThrow(await fetch(`/api/press/agent/process-debug-runs/${encodeURIComponent(runId)}`, { cache: "no-store" })); return { run: value.run, events: (Array.isArray(value.events) ? value.events : []).map(parsePressAiProcessEvent) }; }
export async function fetchPressAiProcessHistory() { const value = await jsonOrThrow(await fetch("/api/press/agent/process-debug-runs", { cache: "no-store" })); return Array.isArray(value.runs) ? value.runs as Array<{ id: string; processId: string; status: string; articleId: string | null; createdAt: string; completedAt: string | null }> : []; }
export async function fetchPressAiProcessDetail(runId: string, nodeId: string, signal?: AbortSignal) { return jsonOrThrow(await fetch(`/api/press/agent/process-debug-runs/${encodeURIComponent(runId)}/details?nodeId=${encodeURIComponent(nodeId)}`, { cache: "no-store", signal })); }
