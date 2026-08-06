import { z } from "zod";

import { getAiQuotaActionDefinition } from "@/domain/quota/aiQuota";

export const PRESS_AI_PROCESS_IDS = ["rag-query", "press-creation"] as const;
export type PressAiProcessId = (typeof PRESS_AI_PROCESS_IDS)[number];

export type PressAiProcessNode = Readonly<{
  id: string;
  label: string;
  description: string;
  troubleshooting: string;
  operation: string;
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
  source: string;
  target: string;
  payload: readonly string[];
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
const ragNode = <T extends string>(node: Omit<PressAiProcessNode, "id" | "inputSchema" | "outputSchema" | "metricIds" | "findingIds"> & { id: T } & Partial<Pick<PressAiProcessNode, "metricIds" | "findingIds">>): PressAiProcessNode & { id: T } => ({
  ...node,
  inputSchema: record,
  outputSchema: record,
  metricIds: node.metricIds ?? [],
  findingIds: node.findingIds ?? [],
});

export const ragQueryProcess = Object.freeze({
  id: "rag-query",
  version: "1.0.0",
  label: "RAG 질의",
  description: "선택한 팀 문서로 실제 Press Agent 검색·검증 흐름을 실행합니다.",
  nodes: Object.freeze([
    ragNode({ id: "request-intake", label: "요청 접수", operation: "prompt intake", description: "질의와 문서 범위를 고정합니다.", troubleshooting: "질의와 선택 문서를 확인하세요." }),
    ragNode({ id: "retrieval-execution", label: "검색 실행", operation: "knowledge retrieval", description: "팀 지식에서 관련 근거를 검색합니다.", troubleshooting: "문서의 READY 상태와 검색 청크를 확인하세요.", metricIds: ["selectedSources", "eligibleSources", "failedTools"], findingIds: ["retrieval-empty", "retrieval-tool-failed"] }),
    ragNode({ id: "evidence-decision", label: "근거 판단", operation: "evidence selection", description: "근거의 충분성과 충돌 여부를 판단합니다.", troubleshooting: "최신 문서와 FACT 역할을 확인하세요.", metricIds: ["conflicts"], findingIds: ["evidence-conflict", "insufficient-evidence"] }),
    ragNode({ id: "response-behavior", label: "응답 생성", operation: "response generation", description: "검증 가능한 근거로 답변을 만듭니다.", troubleshooting: "주장과 인용 연결을 확인하세요.", metricIds: ["claims", "citations"] }),
    ragNode({ id: "verification", label: "검증", operation: "claim verification", description: "주장과 인용을 다시 검증합니다.", troubleshooting: "지원되지 않은 주장을 확인하세요.", metricIds: ["supportedClaims"], findingIds: ["claim-verification-failed", "guardrail-warning"] }),
    ragNode({ id: "fallback", label: "안전 대체", operation: "safe fallback", description: "필요하면 발췌 또는 답변 유보로 전환합니다.", troubleshooting: "유보 사유와 남은 근거를 확인하세요.", findingIds: ["fallback-extractive", "fallback-abstention", "fallback-not-needed"] }),
    ragNode({ id: "terminal-evaluation", label: "최종 평가", operation: "terminal evaluation", description: "실행의 최종 상태를 확정합니다.", troubleshooting: "실행 오류와 경고 코드를 확인하세요.", findingIds: ["approval-required", "user-cancelled", "runtime-failed"] }),
  ]),
  edges: Object.freeze([
    { id: "request-retrieval", source: "request-intake", target: "retrieval-execution", payload: ["prompt", "documentIds", "retrievalConfigurationId"] },
    { id: "retrieval-evidence", source: "retrieval-execution", target: "evidence-decision", payload: ["retrievedSources"] },
    { id: "evidence-response", source: "evidence-decision", target: "response-behavior", payload: ["eligibleEvidence", "conflicts"] },
    { id: "response-verification", source: "response-behavior", target: "verification", payload: ["answer", "claims", "citations"] },
    { id: "verification-terminal", source: "verification", target: "terminal-evaluation", payload: ["verification"] },
    { id: "verification-fallback", source: "verification", target: "fallback", payload: ["failedClaims", "safeEvidence"] },
    { id: "fallback-terminal", source: "fallback", target: "terminal-evaluation", payload: ["fallbackAnswer", "reason"] },
  ]),
} satisfies PressAiProcessDefinition);

const briefSchema = z.object({
  serviceName: z.string().optional(),
  announceType: z.string().min(1),
  oneLiner: z.string().optional(),
  points: z.array(z.string()),
  quoteMessage: z.string().optional(),
  quoteWho: z.string().optional(),
  tone: z.enum(["formal", "neutral", "friendly"]),
  rawText: z.string().optional(),
  eventAt: z.string().optional(),
  publishAt: z.string().optional(),
}).passthrough();

export const pressCreationProcess = Object.freeze({
  id: "press-creation",
  version: "1.0.0",
  label: "보도자료 작성",
  description: "실제 보도자료를 만들고 확인 단계마다 저장된 입력과 출력을 점검합니다.",
  nodes: Object.freeze([
    { id: "article-initialization", label: "문서 초기화", operation: "initArticleDraft", description: "실제 PRESS_RELEASE 문서를 생성합니다.", troubleshooting: "생성된 문서 ID와 팀 소유권을 확인하세요.", inputSchema: z.object({ type: z.literal("PRESS_RELEASE") }).passthrough(), outputSchema: z.object({ articleId: z.string().min(1) }).passthrough(), metricIds: [], findingIds: [], client: { stepId: "init", method: "POST", path: "/api/articles/init", hasBody: true } },
    { id: "brief-normalization", label: "메모 정규화", operation: "normalizeBriefUseCase", description: "대략적인 메모를 편집 가능한 브리프로 정리합니다.", troubleshooting: "사실, 날짜, 인용과 제한 조건이 보존됐는지 확인하세요.", inputSchema: z.object({ articleId: z.string(), rawText: z.string().min(1), tone: z.enum(["formal", "neutral", "friendly"]) }).passthrough(), outputSchema: briefSchema, gate: { id: "confirm-normalized-brief", label: "정규화 브리프 확인" }, metricIds: ["factCandidates"], findingIds: ["quality-warning"], quotaUnits: getAiQuotaActionDefinition("press_brief_normalize").units, client: { stepId: "normalize", method: "POST", path: "/api/articles/{articleId}/brief/normalize", hasBody: true, needsArticle: true } },
    { id: "draft-generation", label: "초안 생성", operation: "generateArticleFromBrief", description: "확인한 브리프로 보도자료 초안을 만듭니다.", troubleshooting: "제목과 본문의 사실·주의 문구를 확인하세요.", inputSchema: briefSchema.extend({ articleId: z.string() }), outputSchema: z.object({ articleId: z.string(), title: z.string(), plain: z.string() }).passthrough(), gate: { id: "confirm-generated-draft", label: "생성 초안 확인" }, metricIds: [], findingIds: ["quality-warning"], quotaUnits: getAiQuotaActionDefinition("press_draft_generate").units, client: { stepId: "generate", method: "POST", path: "/api/articles/{articleId}/generate", hasBody: true, needsArticle: true } },
    { id: "draft-review", label: "초안 리뷰", operation: "reviewUseCase", description: "사용자 지침에 따라 수정 제안과 위치를 만듭니다.", troubleshooting: "선택 가능한 노트 ID와 지침을 확인하세요.", inputSchema: z.object({ articleId: z.string(), title: z.string(), plain: z.string(), userInstruction: z.string().max(1000).optional() }), outputSchema: z.object({ notes: z.array(z.object({ id: z.string() }).passthrough()), spans: z.array(record).optional() }).passthrough(), gate: { id: "select-review-notes", label: "리뷰 노트 선택" }, metricIds: ["availableNotes"], findingIds: ["no-actionable-notes"], quotaUnits: getAiQuotaActionDefinition("press_review").units, client: { stepId: "polish", method: "POST", path: "/api/articles/{articleId}/polish", hasBody: true, needsArticle: true } },
    { id: "selected-rewrite", label: "선택 수정", operation: "rePolishUseCase", description: "명시적으로 선택한 리뷰 노트만 반영해 다시 씁니다.", troubleshooting: "선택한 노트와 수정 지침, 최종 본문을 확인하세요.", inputSchema: z.object({ articleId: z.string(), selectedNoteIds: z.array(z.string()).min(1), userInstruction: z.string() }), outputSchema: z.object({ title: z.string(), plain: z.string() }).passthrough(), metricIds: [], findingIds: ["quality-warning"], quotaUnits: getAiQuotaActionDefinition("press_rewrite").units, client: { stepId: "repolish", method: "POST", path: "/api/articles/{articleId}/re-polish", hasBody: true, needsArticle: true } },
  ]),
  edges: Object.freeze([
    { id: "initialization-brief", source: "article-initialization", target: "brief-normalization", payload: ["articleId"] },
    { id: "brief-draft", source: "brief-normalization", target: "draft-generation", payload: ["articleId", "confirmedBrief"] },
    { id: "draft-review", source: "draft-generation", target: "draft-review", payload: ["articleId", "title", "plain", "reviewInstruction"] },
    { id: "review-rewrite", source: "draft-review", target: "selected-rewrite", payload: ["articleId", "selectedNoteIds", "rewriteInstruction"] },
  ]),
} satisfies PressAiProcessDefinition);

export const PRESS_AI_PROCESS_REGISTRY = Object.freeze({
  "rag-query": ragQueryProcess,
  "press-creation": pressCreationProcess,
});

export function getPressAiProcessDefinition(processId: PressAiProcessId) {
  return PRESS_AI_PROCESS_REGISTRY[processId];
}

export function isPressAiProcessId(value: string): value is PressAiProcessId {
  return (PRESS_AI_PROCESS_IDS as readonly string[]).includes(value);
}
