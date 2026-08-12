import { z } from "zod";

import { getAiQuotaActionDefinition } from "@/domain/quota/aiQuota";

export const PRESS_AI_PROCESS_IDS = ["rag-query", "press-creation"] as const;
export type PressAiProcessId = (typeof PRESS_AI_PROCESS_IDS)[number];

export type PressAiProcessNode = Readonly<{
  id: string;
  sequence: number;
  label: string;
  description: string;
  troubleshooting: string;
  operation: string;
  operationKey: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  gate?: Readonly<{ id: string; label: string }>;
  metricIds: readonly string[];
  findingIds: readonly string[];
  quotaUnits?: number;
  client?: Readonly<{ stepId: "init" | "normalize" | "generate" | "polish" | "repolish"; method: "POST"; path: string; hasBody: true; needsArticle?: boolean }>;
}>;

export type PressAiProcessEdge = Readonly<{
  id: string;
  sequence: number;
  source: string;
  target: string;
  payload: readonly string[];
  mandatoryGuardrailIds: readonly string[];
  humanGate?: Readonly<{ id: string; label: string }>;
}>;

export type PressAiProcessDefinition = Readonly<{
  id: PressAiProcessId;
  version: string;
  label: string;
  description: string;
  nodes: readonly PressAiProcessNode[];
  edges: readonly PressAiProcessEdge[];
}>;

const record = z.record(z.string(), z.unknown());
const ragNode = (sequence: number, id: string, label: string, operation: string, extra: Partial<PressAiProcessNode> = {}): PressAiProcessNode => ({
  id, sequence, label, operation, operationKey: operation,
  description: extra.description ?? label,
  troubleshooting: extra.troubleshooting ?? `${label} 입력과 출력을 확인하세요.`,
  inputSchema: extra.inputSchema ?? record,
  outputSchema: extra.outputSchema ?? record,
  metricIds: extra.metricIds ?? [], findingIds: extra.findingIds ?? [],
  ...extra,
});
const ragEdge = (sequence: number, id: string, source: string, target: string, payload: readonly string[]): PressAiProcessEdge => ({ id, sequence, source, target, payload, mandatoryGuardrailIds: [] });

// This identity and topology are intentionally frozen for historical RAG-v1 replay.
export const ragQueryProcess = Object.freeze({
  id: "rag-query", version: "1.0.0", label: "RAG 질의", description: "선택한 팀 문서로 실제 Press Agent 검색·검증 흐름을 실행합니다.",
  nodes: Object.freeze([
    ragNode(0, "request-intake", "요청 접수", "prompt intake"),
    ragNode(1, "retrieval-execution", "검색 실행", "knowledge retrieval", { metricIds: ["selectedSources", "eligibleSources", "failedTools"], findingIds: ["retrieval-empty", "retrieval-tool-failed"] }),
    ragNode(2, "evidence-decision", "근거 판단", "evidence selection", { metricIds: ["conflicts"], findingIds: ["evidence-conflict", "insufficient-evidence"] }),
    ragNode(3, "response-behavior", "응답 생성", "response generation", { metricIds: ["claims", "citations"] }),
    ragNode(4, "verification", "검증", "claim verification", { metricIds: ["supportedClaims"], findingIds: ["claim-verification-failed", "guardrail-warning"] }),
    ragNode(5, "fallback", "안전 대체", "safe fallback", { findingIds: ["fallback-extractive", "fallback-abstention", "fallback-not-needed"] }),
    ragNode(6, "terminal-evaluation", "최종 평가", "terminal evaluation", { findingIds: ["approval-required", "user-cancelled", "runtime-failed"] }),
  ]),
  edges: Object.freeze([
    ragEdge(0, "request-retrieval", "request-intake", "retrieval-execution", ["prompt", "documentIds", "retrievalConfigurationId"]),
    ragEdge(1, "retrieval-evidence", "retrieval-execution", "evidence-decision", ["retrievedSources"]),
    ragEdge(2, "evidence-response", "evidence-decision", "response-behavior", ["eligibleEvidence", "conflicts"]),
    ragEdge(3, "response-verification", "response-behavior", "verification", ["answer", "claims", "citations"]),
    ragEdge(4, "verification-terminal", "verification", "terminal-evaluation", ["verification"]),
    ragEdge(5, "verification-fallback", "verification", "fallback", ["failedClaims", "safeEvidence"]),
    ragEdge(6, "fallback-terminal", "fallback", "terminal-evaluation", ["fallbackAnswer", "reason"]),
  ]),
} satisfies PressAiProcessDefinition);

export const pressBriefSchema = z.object({
  serviceName: z.string().optional(), announceType: z.string().min(1), oneLiner: z.string().optional(), points: z.array(z.string()),
  quoteMessage: z.string().optional(), quoteWho: z.string().optional(), tone: z.enum(["formal", "neutral", "friendly"]), rawText: z.string().optional(),
  eventAt: z.string().optional(), publishAt: z.string().optional(), articleId: z.string().optional(),
}).passthrough();

const pressNode = (node: PressAiProcessNode) => node;
export const pressCreationProcess = Object.freeze({
  id: "press-creation", version: "2.1.0", label: "보도자료 작성", description: "체크포인트를 실행하고 전이를 별도로 검사하는 보도자료 작성 흐름입니다.",
  nodes: Object.freeze([
    pressNode({ id: "article-initialization", sequence: 0, label: "문서 초기화", operation: "initArticleDraft", operationKey: "article.initialize", description: "새 PRESS_RELEASE 테스트 문서를 확인합니다.", troubleshooting: "문서 ID와 팀 소유권을 확인하세요.", inputSchema: z.union([z.object({ articleId: z.string().min(1) }), z.object({ type: z.literal("PRESS_RELEASE") })]), outputSchema: z.object({ articleId: z.string().min(1), teamId: z.string().optional(), type: z.literal("PRESS_RELEASE").optional() }), metricIds: [], findingIds: [], client: { stepId: "init", method: "POST", path: "/api/articles/init", hasBody: true } }),
    pressNode({ id: "brief-normalization", sequence: 1, label: "메모 정규화", operation: "normalizeBriefUseCase", operationKey: "press.normalize-brief", description: "메모를 편집 가능한 브리프로 정리합니다.", troubleshooting: "사실, 날짜, 인용과 제한 조건을 확인하세요.", inputSchema: z.object({ articleId: z.string(), rawText: z.string().min(1), tone: z.enum(["formal", "neutral", "friendly"]) }), outputSchema: pressBriefSchema, gate: { id: "confirm-normalized-brief", label: "정규화 브리프 확인" }, metricIds: ["factCandidates"], findingIds: ["quality-warning"], quotaUnits: getAiQuotaActionDefinition("press_brief_normalize").units, client: { stepId: "normalize", method: "POST", path: "/api/articles/{articleId}/brief/normalize", hasBody: true, needsArticle: true } }),
    pressNode({ id: "draft-generation", sequence: 2, label: "초안 생성", operation: "generateArticleFromBrief", operationKey: "press.generate-draft", description: "확인한 브리프로 보도자료 초안을 만듭니다.", troubleshooting: "제목과 본문의 사실·주의 문구를 확인하세요.", inputSchema: pressBriefSchema.extend({ articleId: z.string() }), outputSchema: z.object({ articleId: z.string(), title: z.string(), plain: z.string().optional(), lead: z.string().optional(), fact: z.string().optional(), paragraphs: z.array(record).optional(), closing: z.string().optional() }).passthrough(), gate: { id: "confirm-generated-draft", label: "생성 초안 확인" }, metricIds: [], findingIds: ["quality-warning"], quotaUnits: getAiQuotaActionDefinition("press_draft_generate").units, client: { stepId: "generate", method: "POST", path: "/api/articles/{articleId}/generate", hasBody: true, needsArticle: true } }),
    pressNode({ id: "draft-review", sequence: 3, label: "초안 리뷰", operation: "reviewUseCase", operationKey: "press.review-draft", description: "수정 제안과 위치를 만듭니다.", troubleshooting: "선택 가능한 노트 ID와 지침을 확인하세요.", inputSchema: z.object({ articleId: z.string(), title: z.string(), plain: z.string(), userInstruction: z.string().max(1000).optional() }), outputSchema: z.object({ notes: z.array(z.object({ id: z.string() }).passthrough()), spans: z.array(record).optional() }).passthrough(), gate: { id: "select-review-notes", label: "리뷰 노트 선택" }, metricIds: ["availableNotes"], findingIds: ["no-actionable-notes"], quotaUnits: getAiQuotaActionDefinition("press_review").units, client: { stepId: "polish", method: "POST", path: "/api/articles/{articleId}/polish", hasBody: true, needsArticle: true } }),
    pressNode({ id: "selected-rewrite", sequence: 4, label: "선택 수정", operation: "rePolishUseCase", operationKey: "press.rewrite-selected", description: "선택한 리뷰 노트만 반영합니다.", troubleshooting: "선택 노트와 최종 본문을 확인하세요.", inputSchema: z.object({ articleId: z.string(), selectedNoteIds: z.array(z.string()).min(1), userInstruction: z.string().max(1000) }), outputSchema: z.object({ title: z.string(), plain: z.string() }).passthrough(), metricIds: [], findingIds: ["quality-warning"], quotaUnits: getAiQuotaActionDefinition("press_rewrite").units, client: { stepId: "repolish", method: "POST", path: "/api/articles/{articleId}/re-polish", hasBody: true, needsArticle: true } }),
  ]),
  edges: Object.freeze([
    { id: "initialization-brief", sequence: 0, source: "article-initialization", target: "brief-normalization", payload: ["articleId", "rawText", "tone"], mandatoryGuardrailIds: ["article-team-ownership", "fresh-press-release"] },
    { id: "brief-draft", sequence: 1, source: "brief-normalization", target: "draft-generation", payload: ["articleId", "confirmedBrief"], mandatoryGuardrailIds: ["memo-brief-grounding", "critical-fact-preservation"], humanGate: { id: "confirm-normalized-brief", label: "정규화 브리프 확인" } },
    { id: "draft-review", sequence: 2, source: "draft-generation", target: "draft-review", payload: ["articleId", "title", "plain", "reviewInstruction"], mandatoryGuardrailIds: ["brief-draft-grounding", "press-structure", "evidence-fact-consistency"], humanGate: { id: "confirm-generated-draft", label: "생성 초안 확인" } },
    { id: "review-rewrite", sequence: 3, source: "draft-review", target: "selected-rewrite", payload: ["articleId", "selectedNoteIds", "rewriteInstruction"], mandatoryGuardrailIds: ["review-note-selection", "rewrite-instruction-bounds", "review-checkpoint-lineage"], humanGate: { id: "select-review-notes", label: "리뷰 노트 선택" } },
  ]),
} satisfies PressAiProcessDefinition);

export const PRESS_AI_PROCESS_REGISTRY = Object.freeze({ "rag-query": ragQueryProcess, "press-creation": pressCreationProcess });
export function getPressAiProcessDefinition(processId: PressAiProcessId) { return PRESS_AI_PROCESS_REGISTRY[processId]; }
export function isPressAiProcessId(value: string): value is PressAiProcessId { return (PRESS_AI_PROCESS_IDS as readonly string[]).includes(value); }
