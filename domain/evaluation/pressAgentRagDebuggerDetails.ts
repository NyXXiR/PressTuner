import type { PressAgentWorkflowStageId, PressAgentWorkflowStageState } from "./pressAgentWorkflowEvents";
import { PRESS_AGENT_RAG_DEBUGGER_RETRIEVAL_PRESETS } from "./pressAgentRagDebugger";

export const RAG_DEBUGGER_DETAIL_SCHEMA_VERSION = "press-agent-rag-debug-detail/v1" as const;
export const RAG_DEBUGGER_TEXT_LIMITS = { prompt: 12_000, answer: 8_000, summary: 1_000, claim: 1_000, excerpt: 600, documentName: 255, sourceRows: 50 } as const;

export type BoundedText = { text: string; truncated: boolean };
export type RagDebuggerDetailAvailability = "available" | "pending" | "not_applicable" | "unavailable";

export type RagDebuggerDetailResponse = {
  schemaVersion: typeof RAG_DEBUGGER_DETAIL_SCHEMA_VERSION;
  run: { id: string; status: string; createdAt: string; completedAt: string | null };
  stageId: PressAgentWorkflowStageId;
  stageState: PressAgentWorkflowStageState;
  availability: RagDebuggerDetailAvailability;
  message: string | null;
  detail: Record<string, unknown> | null;
};

export type RagDebuggerStoredRun = {
  id: string;
  status: string;
  createdAt: Date | string;
  completedAt: Date | string | null;
  input: unknown;
  output: unknown;
};

export type RagDebuggerStoredSource = {
  sourceId: string;
  documentId: string;
  documentName: string;
  pageStart: number;
  pageEnd: number;
  excerpt: string;
  score?: number | null;
};

const REASON_COPY: Record<string, string> = {
  CITATION_INVALID: "인용 근거를 확인할 수 없습니다.",
  CLAIM_TOKEN_COVERAGE_MISSING: "주장의 핵심 표현이 인용 범위에서 확인되지 않습니다.",
  CONTRADICTORY_NUMERIC_EVIDENCE: "수치 근거가 서로 충돌합니다.",
  SOURCE_NOT_FOUND: "선택한 출처를 찾을 수 없습니다.",
  QUOTE_NOT_FOUND: "인용 문구가 출처에서 확인되지 않습니다.",
  PRESS_AGENT_FINAL_CLAIM_VERIFICATION_FAILED: "최종 주장 검증을 통과하지 못했습니다.",
  REQUESTED_DOCUMENT_EVIDENCE_PRESENT: "문서 근거가 있어 답변 유보를 복구했습니다.",
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown): string | null { return typeof value === "string" ? value : null; }
function bool(value: unknown): boolean | null { return typeof value === "boolean" ? value : null; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function iso(value: Date | string | null): string | null { if (value === null) return null; return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }

export function boundRagDebuggerText(value: unknown, limit: number): BoundedText | null {
  if (typeof value !== "string") return null;
  return { text: value.slice(0, limit), truncated: value.length > limit };
}

export function translateRagDebuggerReason(value: unknown) {
  const code = typeof value === "string" && REASON_COPY[value] ? value : "UNKNOWN_REASON";
  return { code, label: code === "UNKNOWN_REASON" ? "알 수 없는 검증 사유입니다." : REASON_COPY[code] };
}

function safeOutput(value: unknown) {
  const output = record(value);
  if (!output) return null;
  const claims = array(output.claims).flatMap((item) => {
    const claim = record(item);
    const id = string(claim?.id); const text = boundRagDebuggerText(claim?.text, RAG_DEBUGGER_TEXT_LIMITS.claim);
    if (!claim || !id || !text) return [];
    return [{ id, text, evidence: array(claim.evidence).flatMap((candidate) => {
      const evidence = record(candidate); const sourceId = string(evidence?.sourceId); const quote = boundRagDebuggerText(evidence?.quote, RAG_DEBUGGER_TEXT_LIMITS.excerpt);
      return sourceId && quote ? [{ sourceId, quote }] : [];
    }) }];
  });
  const summary = boundRagDebuggerText(output.summary, RAG_DEBUGGER_TEXT_LIMITS.summary);
  const answer = boundRagDebuggerText(output.answer, RAG_DEBUGGER_TEXT_LIMITS.answer);
  const cannotAnswer = bool(output.cannotAnswer);
  if (!summary && !answer && cannotAnswer === null && claims.length === 0) return null;
  return { summary, answer, cannotAnswer, claims };
}

function sourceDetail(source: RagDebuggerStoredSource, selected: Set<string>) {
  return {
    sourceId: source.sourceId,
    documentId: source.documentId,
    documentName: boundRagDebuggerText(source.documentName, RAG_DEBUGGER_TEXT_LIMITS.documentName),
    pages: { start: source.pageStart, end: source.pageEnd },
    score: typeof source.score === "number" && Number.isFinite(source.score) ? source.score : null,
    excerpt: boundRagDebuggerText(source.excerpt, RAG_DEBUGGER_TEXT_LIMITS.excerpt),
    selectedAsFinalEvidence: selected.has(source.sourceId),
  };
}

function base(run: RagDebuggerStoredRun, stageId: PressAgentWorkflowStageId, stageState: PressAgentWorkflowStageState): Omit<RagDebuggerDetailResponse, "availability" | "message" | "detail"> {
  return { schemaVersion: RAG_DEBUGGER_DETAIL_SCHEMA_VERSION, run: { id: run.id, status: run.status, createdAt: iso(run.createdAt)!, completedAt: iso(run.completedAt) }, stageId, stageState };
}

function emptyState(run: RagDebuggerStoredRun, stageId: PressAgentWorkflowStageId, stageState: PressAgentWorkflowStageState): RagDebuggerDetailResponse {
  const availability = stageState === "skipped" ? "not_applicable" : stageState === "waiting" || stageState === "running" ? "pending" : "unavailable";
  return { ...base(run, stageId, stageState), availability, message: availability === "not_applicable" ? "이 실행에서는 사용되지 않았습니다." : availability === "pending" ? "아직 생성되지 않았습니다." : "저장된 상세 정보를 사용할 수 없습니다.", detail: null };
}

export function projectPressAgentRagDebuggerDetail(args: {
  run: RagDebuggerStoredRun;
  stageId: PressAgentWorkflowStageId;
  stageState: PressAgentWorkflowStageState;
  retrievedSources?: readonly RagDebuggerStoredSource[];
  citations?: readonly RagDebuggerStoredSource[];
}): RagDebuggerDetailResponse {
  const input = record(args.run.input); const output = record(args.run.output);
  const retrieved = [...(args.retrievedSources ?? [])]; const citations = [...(args.citations ?? [])];
  const selectedIds = new Set(citations.map((item) => item.sourceId));
  const available = (detail: Record<string, unknown>): RagDebuggerDetailResponse => ({ ...base(args.run, args.stageId, args.stageState), availability: "available", message: args.stageState === "running" ? "실행 중인 단계의 현재 저장 상태입니다." : null, detail });

  if (args.stageId === "request-intake") {
    const presetId = string(input?.retrievalConfigurationId);
    const preset = presetId && presetId in PRESS_AGENT_RAG_DEBUGGER_RETRIEVAL_PRESETS ? PRESS_AGENT_RAG_DEBUGGER_RETRIEVAL_PRESETS[presetId as keyof typeof PRESS_AGENT_RAG_DEBUGGER_RETRIEVAL_PRESETS] : null;
    const documents = array(input?.selectedDocuments).flatMap((item) => {
      const doc = record(item); const id = string(doc?.id); const name = boundRagDebuggerText(doc?.name, RAG_DEBUGGER_TEXT_LIMITS.documentName);
      if (!id || !name || doc?.readiness !== "READY" || typeof doc.chunkCount !== "number") return [];
      return [{ id, name, readiness: "READY", pageCount: typeof doc.pageCount === "number" ? doc.pageCount : null, chunkCount: doc.chunkCount }];
    });
    if (!boundRagDebuggerText(input?.prompt, RAG_DEBUGGER_TEXT_LIMITS.prompt) || !preset || documents.length === 0) {
      return { ...base(args.run, args.stageId, args.stageState), availability: "unavailable", message: "이전 형식의 실행에는 문서 선택 스냅샷이 저장되어 있지 않습니다.", detail: null };
    }
    return available({ prompt: boundRagDebuggerText(input?.prompt, RAG_DEBUGGER_TEXT_LIMITS.prompt), promptPresetId: string(input?.promptPresetId), retrievalPreset: preset, selectedDocuments: documents });
  }

  if (args.stageId === "retrieval-execution") {
    if (retrieved.length === 0 && ["waiting", "running"].includes(args.stageState)) return emptyState(args.run, args.stageId, args.stageState);
    return available({ totalRetrievedCount: retrieved.length, returnedCount: Math.min(retrieved.length, RAG_DEBUGGER_TEXT_LIMITS.sourceRows), sources: retrieved.slice(0, RAG_DEBUGGER_TEXT_LIMITS.sourceRows).map((item) => sourceDetail(item, selectedIds)) });
  }

  if (args.stageId === "evidence-decision") {
    if (citations.length === 0 && ["waiting", "running"].includes(args.stageState)) return emptyState(args.run, args.stageId, args.stageState);
    const byId = new Map(retrieved.map((item) => [item.sourceId, item]));
    return available({ retrievedCount: retrieved.length, selectedEvidenceCount: citations.length, selectedEvidence: citations.slice(0, RAG_DEBUGGER_TEXT_LIMITS.sourceRows).map((citation) => sourceDetail(byId.get(citation.sourceId) ?? citation, selectedIds)) });
  }

  const preVerification = safeOutput(output?.preVerificationOutput);
  const finalOutput = safeOutput(output);
  if (args.stageId === "response-behavior") {
    if (!preVerification) return emptyState(args.run, args.stageId, args.stageState);
    const sourceById = new Map([...retrieved, ...citations].map((source) => [source.sourceId, source]));
    return available({ ...preVerification, claims: preVerification.claims.map((claim) => ({ ...claim, evidence: claim.evidence.map((evidence) => ({ ...evidence, source: sourceById.has(evidence.sourceId) ? sourceDetail(sourceById.get(evidence.sourceId)!, selectedIds) : null })) })) });
  }

  if (args.stageId === "verification") {
    const fallback = record(output?.verificationFallback);
    const verification = record(fallback?.failedClaimVerification) ?? record(output?.claimVerification);
    if (!verification) return emptyState(args.run, args.stageId, args.stageState);
    const sourceById = new Map([...retrieved, ...citations].map((source) => [source.sourceId, source]));
    return available({ overallResult: verification.status === "PASS" ? "PASS" : "FAIL", claims: array(verification.claims).flatMap((item) => {
      const claim = record(item); const id = string(claim?.id); if (!id) return [];
      return [{ id, text: boundRagDebuggerText(claim?.text, RAG_DEBUGGER_TEXT_LIMITS.claim), status: claim?.status === "SUPPORTED" ? "SUPPORTED" : "UNSUPPORTED", spans: array(claim?.spans).flatMap((item) => { const span = record(item); const sourceId = string(span?.sourceId); const source = sourceId ? sourceById.get(sourceId) : null; return sourceId ? [{ sourceId, documentId: source?.documentId ?? null, documentName: source ? boundRagDebuggerText(source.documentName, RAG_DEBUGGER_TEXT_LIMITS.documentName) : null, pages: { start: typeof span?.pageStart === "number" ? span.pageStart : source?.pageStart ?? null, end: typeof span?.pageEnd === "number" ? span.pageEnd : source?.pageEnd ?? null }, quote: boundRagDebuggerText(span?.quote, RAG_DEBUGGER_TEXT_LIMITS.excerpt) }] : []; }), reasons: array(claim?.reasonCodes).map(translateRagDebuggerReason) }];
    }) });
  }

  if (args.stageId === "fallback") {
    if (args.stageState === "skipped") return emptyState(args.run, args.stageId, args.stageState);
    const verificationFallback = record(output?.verificationFallback); const recovery = record(output?.abstentionRecovery); const normalization = record(output?.abstentionNormalization);
    const source = verificationFallback ?? recovery ?? normalization;
    if (!source) return emptyState(args.run, args.stageId, args.stageState);
    const mode = verificationFallback ? (verificationFallback.mode === "EXTRACTIVE" ? "EXTRACTIVE" : "ABSTENTION") : recovery ? "RECOVERY" : "NORMALIZATION";
    return available({ mode, reason: translateRagDebuggerReason(source.reason), originalOutput: preVerification ?? safeOutput(verificationFallback?.unverifiedFinalOutput) ?? safeOutput(recovery?.unverifiedFinalOutput), finalOutput });
  }

  if (!finalOutput) return emptyState(args.run, args.stageId, args.stageState);
  return available({ result: finalOutput.cannotAnswer ? "CANNOT_ANSWER" : "ANSWER", answer: finalOutput.answer, summary: finalOutput.summary, cannotAnswer: finalOutput.cannotAnswer, finalEvidenceCount: citations.length });
}
