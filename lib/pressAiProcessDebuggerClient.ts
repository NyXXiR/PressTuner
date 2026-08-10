import { z } from "zod";
import { parsePressAiProcessEvent, type PressAiProcessEvent } from "@/domain/press-ai-debugger/processEvents";

const DocumentSchema = z.object({ id: z.string(), originalName: z.string(), status: z.string(), pageCount: z.number().int().nullable().optional(), chunkCount: z.number().int().nonnegative().optional(), activeGenerationId: z.string().nullable().optional(), hasPendingReplacement: z.boolean().optional() }).passthrough();
const QuotaSchema = z.object({ activeDocumentCount: z.number().int().nonnegative(), storedBytes: z.number().int().nonnegative(), uploadsInWindow: z.number().int().nonnegative(), limits: z.object({ documents: z.number().int().positive(), storedBytes: z.number().int().positive(), uploads: z.number().int().positive(), windowSeconds: z.number().int().positive() }), retryAfterSeconds: z.number().int().nonnegative() }).passthrough();
const UploadSchema = z.object({ document: DocumentSchema, deduplicated: z.boolean(), quota: QuotaSchema }).passthrough();

export class PressAiDebuggerApiError extends Error {
  constructor(readonly code: string, readonly status: number, readonly retryAfterSeconds: number | null, readonly details: unknown = null) { super(code); }
}

const GuardrailObservationSchema = z.object({ id: z.string(), guardrailId: z.string(), origin: z.enum(["MANDATORY", "CASE_EXPECTATION"]), expected: z.string(), observed: z.string(), reason: z.string(), evidence: z.unknown(), verdict: z.enum(["PASS", "WARN", "BLOCK"]), displayOrder: z.number().int() }).passthrough();
const CheckpointSchema = z.object({ id: z.string(), nodeId: z.string(), sequence: z.number().int(), mode: z.enum(["EXECUTED", "RESTORED"]), input: z.unknown(), output: z.unknown(), quotaUnits: z.number().int().nonnegative() }).passthrough();
const TransitionSchema = z.object({ id: z.string(), edgeId: z.string(), sequence: z.number().int(), sourceNodeId: z.string(), targetNodeId: z.string(), targetPayload: z.unknown(), verdict: z.enum(["PASS", "WARN", "BLOCK"]), warnAcknowledgedAt: z.union([z.string(), z.date()]).nullable(), humanGateAcknowledgedAt: z.union([z.string(), z.date()]).nullable(), advancedAt: z.union([z.string(), z.date()]).nullable(), observations: z.array(GuardrailObservationSchema) }).passthrough();
const CheckpointInputSnapshotSchema = z.object({
  articleId: z.string(),
  rawText: z.string(),
  tone: z.enum(["formal", "neutral", "friendly"]),
  reviewInstruction: z.string(),
  rewriteInstruction: z.string(),
}).passthrough();
export const CheckpointAttemptSchema = z.object({ id: z.string(), caseId: z.string().nullable().optional(), processId: z.literal("press-creation"), processVersion: z.string(), registryHash: z.string(), executorVersion: z.string(), status: z.enum(["ACTIVE", "INSPECTING", "COMPLETED", "BLOCKED", "FAILED"]), revision: z.number().int().nonnegative(), articleId: z.string(), activeNodeId: z.string().nullable(), startNodeId: z.string(), createdAt: z.string().datetime(), completedAt: z.string().datetime().nullable(), parentAttemptId: z.string().nullable(), inputSnapshot: CheckpointInputSnapshotSchema, checkpoints: z.array(CheckpointSchema), transitions: z.array(TransitionSchema) }).passthrough();
const MatcherSubjectSchema = z.enum(["transition_text", "source_input_text", "source_output_text", "target_payload_text", "source_output_review_notes", "target_payload_selected_note_ids", "source_output_review_note_count", "target_payload_selected_note_count"]);
const MatcherOperatorSchema = z.enum(["contains", "not_contains", "equals", "exists", "not_empty", "count_gte", "count_lte", "number_eq", "number_gte", "number_lte"]);
const ValidationStateSchema = z.enum(["UNTESTED", "UNPROVEN", "DETECTED", "VERIFIED"]);
export const DebugCaseExpectationSchema = z.object({ id: z.string(), edgeId: z.string().optional(), matcher: z.object({ version: z.literal(1), subject: MatcherSubjectSchema, operator: MatcherOperatorSchema, operand: z.union([z.string(), z.number()]).optional() }), verdict: z.enum(["WARN", "BLOCK"]), fingerprint: z.string(), validation: z.object({ state: ValidationStateSchema, lastVerdict: z.enum(["PASS", "WARN", "BLOCK"]).nullable(), lastObservationAt: z.string().nullable() }), validationState: ValidationStateSchema.optional(), lastVerdict: z.enum(["PASS", "WARN", "BLOCK"]).nullable().optional(), lastObservationAt: z.string().nullable().optional() });
export const DebugCaseDetailSchema = z.object({ caseId: z.string(), name: z.string(), sourceCheckpointId: z.string().optional(), sourceCheckpoint: z.object({ id: z.string(), nodeId: z.string() }), startNodeId: z.string(), expectations: z.array(DebugCaseExpectationSchema), observations: z.array(z.unknown()).optional() });
export const SaveDebugCaseReceiptSchema = z.object({ replayed: z.boolean(), response: z.object({ caseId: z.string(), revision: z.number().int().nonnegative() }) });
export const RetryCheckpointAttemptResponseSchema = z.object({
  replayed: z.boolean(),
  attemptId: z.string(),
  articleId: z.string(),
  revision: z.number().int().nonnegative(),
});
export type PressAiCheckpointAttempt = z.infer<typeof CheckpointAttemptSchema>;
export type RetryCheckpointAttemptResponse = z.infer<typeof RetryCheckpointAttemptResponseSchema>;
export type PressAiDebugCase = z.infer<typeof DebugCaseDetailSchema>;
export type PressAiDebugCaseExpectation = z.infer<typeof DebugCaseExpectationSchema>;
export type SaveDebugCaseReceipt = z.infer<typeof SaveDebugCaseReceiptSchema>;
export type PressAiCheckpointAttemptSummary = {
  id: string;
  processId: string;
  processVersion: string;
  status: string;
  revision: number;
  articleId: string;
  activeNodeId: string | null;
  parentAttemptId: string | null;
  createdAt: string;
  completedAt: string | null;
  memoExcerpt?: string;
  checkpointCount?: number;
};

export type PressAiCheckpointComparison = {
  id: string;
  oldVerdict: "PASS" | "WARN" | "BLOCK" | null;
  newVerdict: "PASS" | "WARN" | "BLOCK" | null;
  outputComparison: {
    changed?: boolean;
    fields?: Array<{ key: string; oldValue: unknown; newValue: unknown; changed: boolean }>;
  };
};

async function checkpointJson(response: Response) {
  const value = await response.json().catch(() => null);
  if (!response.ok) { const body = value && typeof value === "object" ? value as Record<string, unknown> : {}; throw new PressAiDebuggerApiError(typeof body.code === "string" ? body.code : `PRESS_AI_DEBUG_HTTP_${response.status}`, response.status, null, body); }
  return value;
}
const headers = { "Content-Type": "application/json" };
export async function createPressAiCheckpointAttempt(input: Record<string, unknown>, fetchImpl: typeof fetch = fetch) { const value = await checkpointJson(await fetchImpl("/api/press/agent/process-debug-attempts", { method: "POST", headers, body: JSON.stringify(input) })); return { ...(value as Record<string, unknown>), attempt: CheckpointAttemptSchema.parse((value as any).attempt) }; }
export async function fetchPressAiCheckpointAttempt(attemptId: string, fetchImpl: typeof fetch = fetch) { const value = await checkpointJson(await fetchImpl(`/api/press/agent/process-debug-attempts/${encodeURIComponent(attemptId)}`, { cache: "no-store" })); return CheckpointAttemptSchema.parse((value as any).attempt); }
export async function fetchPressAiCheckpointAttemptHistory(fetchImpl: typeof fetch = fetch) {
  const value = await checkpointJson(await fetchImpl("/api/press/agent/process-debug-attempts", { cache: "no-store" }));
  return (value as { attempts?: PressAiCheckpointAttemptSummary[] }).attempts ?? [];
}
export async function fetchPressAiCheckpointComparison(attemptId: string, fetchImpl: typeof fetch = fetch) {
  const value = await checkpointJson(await fetchImpl(`/api/press/agent/process-debug-attempts/${encodeURIComponent(attemptId)}/comparison`, { cache: "no-store" }));
  return (value as { comparisons?: PressAiCheckpointComparison[] }).comparisons ?? [];
}
export async function executePressAiCheckpointNode(attemptId: string, nodeId: string, input: Record<string, unknown>, fetchImpl: typeof fetch = fetch) { return checkpointJson(await fetchImpl(`/api/press/agent/process-debug-attempts/${encodeURIComponent(attemptId)}/steps/${encodeURIComponent(nodeId)}/execute`, { method: "POST", headers, body: JSON.stringify(input) })); }
export async function advancePressAiCheckpointEdge(attemptId: string, edgeId: string, input: Record<string, unknown>, fetchImpl: typeof fetch = fetch) { return checkpointJson(await fetchImpl(`/api/press/agent/process-debug-attempts/${encodeURIComponent(attemptId)}/edges/${encodeURIComponent(edgeId)}/advance`, { method: "POST", headers, body: JSON.stringify(input) })); }
export async function retryPressAiCheckpointAttempt(attemptId: string, input: Record<string, unknown>, fetchImpl: typeof fetch = fetch): Promise<RetryCheckpointAttemptResponse> { const value = await checkpointJson(await fetchImpl(`/api/press/agent/process-debug-attempts/${encodeURIComponent(attemptId)}/retry`, { method: "POST", headers, body: JSON.stringify(input) })); return RetryCheckpointAttemptResponseSchema.parse(value); }
export async function fetchPressAiDebugCase(caseId: string, fetchImpl: typeof fetch = fetch) { const value = await checkpointJson(await fetchImpl(`/api/press/agent/process-debug-cases/${encodeURIComponent(caseId)}`, { cache: "no-store" })); return DebugCaseDetailSchema.parse((value as any).case); }
export async function savePressAiDebugCase(input: Record<string, unknown>, fetchImpl: typeof fetch = fetch) { return SaveDebugCaseReceiptSchema.parse(await checkpointJson(await fetchImpl("/api/press/agent/process-debug-cases", { method: "POST", headers, body: JSON.stringify(input) }))); }

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

export type PressAiKnowledgeDocument = { id: string; name: string; status: string; pageCount: number | null; chunkCount: number; selectable: boolean; readinessReason: string | null; errorMessage: string | null; createdAt: string | null; updatedAt: string | null };

const timestamp = (value: unknown) => (typeof value === "string" ? value : null);

export function mapKnowledgeDocuments(input: unknown[]): PressAiKnowledgeDocument[] {
  return z.array(DocumentSchema).parse(input).map((document) => {
    const chunkCount = document.chunkCount ?? 0;
    const selectable = document.status === "READY" && Boolean(document.activeGenerationId) && chunkCount > 0 && !document.hasPendingReplacement;
    const readinessReason = selectable ? null : document.hasPendingReplacement ? "새 버전으로 교체 중입니다." : document.status !== "READY" ? `현재 상태: ${document.status}` : !document.activeGenerationId ? "활성 인덱스가 없습니다." : "검색 가능한 청크가 없습니다.";
    // Timestamps drive the "N초 경과" readout while indexing is in flight.
    return { id: document.id, name: document.originalName, status: document.status, pageCount: document.pageCount ?? null, chunkCount, selectable, readinessReason, errorMessage: timestamp((document as { errorMessage?: unknown }).errorMessage), createdAt: timestamp((document as { createdAt?: unknown }).createdAt), updatedAt: timestamp((document as { updatedAt?: unknown }).updatedAt) };
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

export async function deletePressAiKnowledgeDocument(documentId: string, fetchImpl: typeof fetch = fetch) {
  const value = await jsonOrThrow(await fetchImpl(`/api/knowledge/documents/${encodeURIComponent(documentId)}`, { method: "DELETE" }));
  return value;
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
