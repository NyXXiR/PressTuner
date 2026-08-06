import type { PressRagDemoViewModel, PressRagRecordedOutcome } from "./pressRagDemoPresenter";
import { projectPressRagGuardrails, type PressRagGuardrailProjection } from "./pressRagGuardrails";
import {
  PRESS_RAG_WORKFLOW_STAGE_IDS,
  projectPressRagWorkflowView,
  type PressRagWorkflowNodeId,
  type PressRagWorkflowView,
} from "./pressRagWorkflowView";

export const PRESS_RAG_SANDBOX_STAGE_IDS = PRESS_RAG_WORKFLOW_STAGE_IDS;
export const PRESS_RAG_SANDBOX_TOOL_NAMES = [
  "search_knowledge", "compare_sources", "draft_press_release", "verify_claims", "apply_press_release",
] as const;

type Expectation = PressRagDemoViewModel["scenarios"][number]["expectation"];
export type PressRagCheckExpectation = Readonly<{
  answerability: "ANSWER" | "ABSTAIN";
  requiresClaimEvidence: boolean;
  expectedTools: readonly string[];
  expectedDocuments: readonly Readonly<{ logicalId: string }>[];
  forbiddenLogicalDocumentIds: readonly string[];
}>;
type ToolName = PressRagRecordedOutcome["tools"][number]["toolName"];
type HitDraft = Omit<PressRagRecordedOutcome["retrieval"][number], "rank" | "expected">;
type CitationDraft = Omit<PressRagRecordedOutcome["citations"][number], "expected">;
type ToolDraft = PressRagRecordedOutcome["tools"][number];

export type PressRagStageDraft =
  | Readonly<{ stageId: "request-intake"; prompt: string }>
  | Readonly<{ stageId: "retrieval-execution"; hits: readonly HitDraft[]; tools: readonly ToolDraft[] }>
  | Readonly<{ stageId: "evidence-decision"; responseBranch: "ANSWER" | "ABSTENTION" | "CONFLICT_COMPARISON" }>
  | Readonly<{ stageId: "response-behavior"; finalAnswer: string | null; summary: string | null; citations: readonly CitationDraft[] }>
  | Readonly<{ stageId: "verification"; mode: "ANSWER" | "ABSTENTION" | null; status: "PASS" | "FAIL" | null; supportedClaims: number; totalClaims: number }>
  | Readonly<{ stageId: "fallback"; mode: "EXTRACTIVE" | "ABSTENTION" | null; reason: string | null }>
  | Readonly<{ stageId: "terminal-evaluation"; status: "COMPLETED" | "FAILED"; errorCode: string | null; latencyMs: number; costMicros: number }>;

export type PressRagSandboxSelection =
  | Readonly<{ kind: "node"; id: PressRagWorkflowNodeId }>
  | Readonly<{ kind: "edge"; id: string }>;

export type PressRagSandboxValidationError = Readonly<{ field: string; code: string; message: string }>;

export type PressRagSandboxProjection = Readonly<{
  prompt: string;
  outcome: PressRagRecordedOutcome;
  workflow: PressRagWorkflowView;
  guardrails: PressRagGuardrailProjection;
}>;

export type PressRagSandboxState = Readonly<{
  mode: "recorded" | "test";
  draft: PressRagStageDraft | null;
  result: PressRagSandboxProjection | null;
}>;

export type PressRagSandboxAction =
  | Readonly<{ type: "set-mode"; mode: "recorded" | "test" }>
  | Readonly<{ type: "set-draft"; draft: PressRagStageDraft }>
  | Readonly<{ type: "commit"; result: PressRagSandboxProjection }>
  | Readonly<{ type: "reset" | "selection-boundary-changed" }>;

export const PRESS_RAG_STAGE_OWNED_FIELDS: Readonly<Record<PressRagWorkflowNodeId, readonly string[]>> = {
  "request-intake": ["prompt"],
  "retrieval-execution": ["hits", "tools"],
  "evidence-decision": ["responseBranch"],
  "response-behavior": ["finalAnswer", "summary", "citations"],
  verification: ["mode", "status", "supportedClaims", "totalClaims"],
  fallback: ["mode", "reason"],
  "terminal-evaluation": ["status", "errorCode", "latencyMs", "costMicros"],
};

const MAX = { prompt: 4_000, prose: 16_000, summary: 4_000, collection: 100, short: 512, latency: 86_400_000, cost: 1_000_000_000 } as const;
const SAFE_CODE = /^[A-Z0-9_:-]{1,160}$/;
const SAFE_TOOL_NAMES = new Set<string>(PRESS_RAG_SANDBOX_TOOL_NAMES);
const SENSITIVE = [
  /\b(?:sk|pk)_[A-Za-z0-9_-]{12,}\b/i,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/i,
  /\b[A-Fa-f0-9]{32,}\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?<!\d)(?:\+?\d[\d .()-]{7,}\d)(?!\d)/,
];

function freeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return Object.freeze(value);
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function check(condition: boolean | null): PressRagRecordedOutcome["checks"]["retrieval"] {
  return condition === null ? "NOT_EVALUABLE" : condition ? "MATCH" : "MISMATCH";
}

/** The sole check derivation used by both immutable recordings and local test projections. */
export function derivePressRagChecks(
  outcome: Pick<PressRagRecordedOutcome, "status" | "cannotAnswer" | "retrieval" | "citations" | "verification" | "tools">,
  expectation: PressRagCheckExpectation,
): PressRagRecordedOutcome["checks"] {
  const expected = new Set(expectation.expectedDocuments.map(({ logicalId }) => logicalId));
  const retrieved = new Set(outcome.retrieval.map(({ logicalDocumentId }) => logicalDocumentId));
  const cited = new Set(outcome.citations.map(({ logicalDocumentId }) => logicalDocumentId));
  const forbidden = new Set(expectation.forbiddenLogicalDocumentIds);
  const completedTools = new Set(outcome.tools.filter(({ status }) => status === "COMPLETED").map(({ toolName }) => toolName));
  const expectedAnswer = expectation.answerability === "ANSWER";
  const evaluable = outcome.status === "COMPLETED";
  return freeze({
    retrieval: check([...expected].every((id) => retrieved.has(id))),
    answerability: check(evaluable && outcome.cannotAnswer !== null ? outcome.cannotAnswer !== expectedAnswer : null),
    citations: check(evaluable ? expectedAnswer ? cited.size > 0 && [...cited].every((id) => expected.has(id)) : cited.size === 0 : null),
    forbiddenSources: check(evaluable ? [...cited].every((id) => !forbidden.has(id)) : null),
    verification: check(evaluable ? expectation.requiresClaimEvidence
      ? outcome.verification.status === "PASS" && outcome.verification.supportedClaims === outcome.verification.totalClaims
      : outcome.verification.status === null || outcome.verification.status === "PASS" : null),
    expectedTools: check(evaluable ? expectation.expectedTools.every((name) => completedTools.has(name as ToolName)) : null),
  }) as PressRagRecordedOutcome["checks"];
}

export function createPressRagSandboxState(): PressRagSandboxState {
  return freeze({ mode: "recorded", draft: null, result: null }) as PressRagSandboxState;
}

export function reducePressRagSandboxState(state: PressRagSandboxState, action: PressRagSandboxAction): PressRagSandboxState {
  switch (action.type) {
    case "reset": case "selection-boundary-changed": return createPressRagSandboxState();
    case "set-mode": return freeze({ ...state, mode: action.mode, draft: action.mode === "recorded" ? null : state.draft }) as PressRagSandboxState;
    case "set-draft": return freeze({ ...state, mode: "test", draft: copy(action.draft) }) as PressRagSandboxState;
    case "commit": return freeze({ mode: "test", draft: null, result: action.result }) as PressRagSandboxState;
  }
}

export function resolvePressRagSandboxStageId(selection: PressRagSandboxSelection, workflow: PressRagWorkflowView): PressRagWorkflowNodeId {
  if (selection.kind === "node") return selection.id;
  return workflow.edges.find(({ id }) => id === selection.id)?.source ?? workflow.initiallySelectedNodeId;
}

export function createPressRagStageDraft(stageId: PressRagWorkflowNodeId, prompt: string, outcome: PressRagRecordedOutcome, expectation?: Pick<Expectation, "conflict">): PressRagStageDraft {
  switch (stageId) {
    case "request-intake": return copy({ stageId, prompt });
    case "retrieval-execution": return copy({ stageId, hits: outcome.retrieval.map((hit) => ({ logicalDocumentId: hit.logicalDocumentId, filename: hit.filename, pageStart: hit.pageStart, pageEnd: hit.pageEnd, score: hit.score })), tools: outcome.tools });
    case "evidence-decision": return { stageId, responseBranch: outcome.cannotAnswer ? "ABSTENTION" : expectation?.conflict === "COMPARE" ? "CONFLICT_COMPARISON" : "ANSWER" };
    case "response-behavior": return copy({ stageId, finalAnswer: outcome.finalAnswer, summary: outcome.summary, citations: outcome.citations.map((citation) => ({ sourceLabel: citation.sourceLabel, logicalDocumentId: citation.logicalDocumentId, filename: citation.filename, pageStart: citation.pageStart, pageEnd: citation.pageEnd })) });
    case "verification": return copy({ stageId, mode: outcome.verification.mode, status: outcome.verification.status, supportedClaims: outcome.verification.supportedClaims, totalClaims: outcome.verification.totalClaims });
    case "fallback": return copy({ stageId, mode: outcome.fallback.mode, reason: outcome.fallback.reason });
    case "terminal-evaluation": return copy({ stageId, status: outcome.status, errorCode: outcome.errorCode, latencyMs: outcome.latencyMs, costMicros: outcome.costMicros });
  }
}

function validateText(errors: PressRagSandboxValidationError[], field: string, value: unknown, max: number, nullable = false) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    errors.push({ field, code: "INVALID_LENGTH", message: `1자 이상 ${max}자 이하여야 합니다.` }); return;
  }
  if (SENSITIVE.some((pattern) => pattern.test(value))) errors.push({ field, code: "SENSITIVE_DATA", message: "민감정보 형태의 텍스트는 사용할 수 없습니다." });
}

function validatePage(errors: PressRagSandboxValidationError[], prefix: string, item: { pageStart: number; pageEnd: number }) {
  if (!Number.isSafeInteger(item.pageStart) || item.pageStart < 1 || item.pageStart > 100_000) errors.push({ field: `${prefix}.pageStart`, code: "INVALID_PAGE", message: "페이지는 1~100000의 정수여야 합니다." });
  if (!Number.isSafeInteger(item.pageEnd) || item.pageEnd < item.pageStart || item.pageEnd > 100_000) errors.push({ field: `${prefix}.pageEnd`, code: "INVALID_PAGE_RANGE", message: "끝 페이지는 시작 페이지 이상이어야 합니다." });
}

function rejectUnknown(errors: PressRagSandboxValidationError[], value: object, allowed: readonly string[], prefix = "") {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push({ field: prefix ? `${prefix}.${key}` : key, code: "FORBIDDEN_FIELD", message: "이 필드는 파생되거나 해당 단계가 소유하지 않아 편집할 수 없습니다." });
}

export function validatePressRagStageDraft(draft: PressRagStageDraft): readonly PressRagSandboxValidationError[] {
  const errors: PressRagSandboxValidationError[] = [];
  const allowed = PRESS_RAG_STAGE_OWNED_FIELDS[draft.stageId];
  if (!allowed) return freeze([{ field: "stageId", code: "INVALID_STAGE", message: "지원하지 않는 단계입니다." }]);
  rejectUnknown(errors, draft, ["stageId", ...allowed]);
  if (draft.stageId === "request-intake") validateText(errors, "prompt", draft.prompt, MAX.prompt);
  if (draft.stageId === "retrieval-execution") {
    if (draft.hits.length > MAX.collection) errors.push({ field: "hits", code: "COLLECTION_LIMIT", message: "검색 결과가 허용 범위를 넘었습니다." });
    draft.hits.forEach((hit, index) => {
      const p = `hits.${index}`; rejectUnknown(errors, hit, ["logicalDocumentId", "filename", "pageStart", "pageEnd", "score"], p); validateText(errors, `${p}.logicalDocumentId`, hit.logicalDocumentId, MAX.short); validateText(errors, `${p}.filename`, hit.filename, 255); validatePage(errors, p, hit);
      if (hit.score !== null && (!Number.isFinite(hit.score) || hit.score < 0 || hit.score > 1)) errors.push({ field: `${p}.score`, code: "INVALID_SCORE", message: "점수는 0~1이어야 합니다." });
    });
    if (draft.tools.length > MAX.collection) errors.push({ field: "tools", code: "COLLECTION_LIMIT", message: "도구 기록이 허용 범위를 넘었습니다." });
    const sequences = new Set<number>();
    draft.tools.forEach((tool, index) => {
      const p = `tools.${index}`;
      rejectUnknown(errors, tool, ["sequence", "toolName", "status", "latencyMs"], p);
      if (!SAFE_TOOL_NAMES.has(tool.toolName)) errors.push({ field: `${p}.toolName`, code: "INVALID_TOOL", message: "허용된 도구가 아닙니다." });
      if (tool.status !== "COMPLETED" && tool.status !== "FAILED") errors.push({ field: `${p}.status`, code: "INVALID_STATUS", message: "도구 상태가 올바르지 않습니다." });
      if (!Number.isSafeInteger(tool.sequence) || tool.sequence < 1 || tool.sequence > MAX.collection || sequences.has(tool.sequence) || (index > 0 && tool.sequence <= draft.tools[index - 1]!.sequence)) errors.push({ field: `${p}.sequence`, code: "INVALID_SEQUENCE", message: "순서는 고유한 오름차순 정수여야 합니다." });
      sequences.add(tool.sequence);
      if (!Number.isFinite(tool.latencyMs) || tool.latencyMs < 0 || tool.latencyMs > MAX.latency) errors.push({ field: `${p}.latencyMs`, code: "INVALID_LATENCY", message: "지연 시간이 허용 범위를 벗어났습니다." });
    });
  }
  if (draft.stageId === "evidence-decision" && !["ANSWER", "ABSTENTION", "CONFLICT_COMPARISON"].includes(draft.responseBranch)) errors.push({ field: "responseBranch", code: "INVALID_ENUM", message: "응답 분기가 올바르지 않습니다." });
  if (draft.stageId === "response-behavior") {
    validateText(errors, "finalAnswer", draft.finalAnswer, MAX.prose, true); validateText(errors, "summary", draft.summary, MAX.summary, true);
    if (draft.citations.length > MAX.collection) errors.push({ field: "citations", code: "COLLECTION_LIMIT", message: "인용이 허용 범위를 넘었습니다." });
    draft.citations.forEach((citation, index) => { const p = `citations.${index}`; rejectUnknown(errors, citation, ["sourceLabel", "logicalDocumentId", "filename", "pageStart", "pageEnd"], p); validateText(errors, `${p}.sourceLabel`, citation.sourceLabel, MAX.short); validateText(errors, `${p}.logicalDocumentId`, citation.logicalDocumentId, MAX.short); validateText(errors, `${p}.filename`, citation.filename, 255); validatePage(errors, p, citation); });
  }
  if (draft.stageId === "verification") {
    const paired = (draft.mode === null) === (draft.status === null);
    if (!paired || (draft.mode !== null && !["ANSWER", "ABSTENTION"].includes(draft.mode)) || (draft.status !== null && !["PASS", "FAIL"].includes(draft.status))) errors.push({ field: "verification", code: "INVALID_PAIR", message: "검증 모드와 상태는 함께 기록하거나 함께 비워야 합니다." });
    for (const key of ["supportedClaims", "totalClaims"] as const) if (!Number.isSafeInteger(draft[key]) || draft[key] < 0 || draft[key] > MAX.collection) errors.push({ field: key, code: "INVALID_COUNT", message: "0~100의 정수여야 합니다." });
    if (draft.supportedClaims > draft.totalClaims) errors.push({ field: "supportedClaims", code: "INVALID_COVERAGE", message: "지원 주장 수는 전체 주장 수보다 클 수 없습니다." });
  }
  if (draft.stageId === "fallback") {
    if (draft.mode !== null && !["EXTRACTIVE", "ABSTENTION"].includes(draft.mode)) errors.push({ field: "mode", code: "INVALID_ENUM", message: "대체 모드가 올바르지 않습니다." });
    if (draft.reason !== null && !SAFE_CODE.test(draft.reason)) errors.push({ field: "reason", code: "INVALID_REASON", message: "안전한 사유 코드만 사용할 수 있습니다." });
  }
  if (draft.stageId === "terminal-evaluation") {
    if (draft.status !== "COMPLETED" && draft.status !== "FAILED") errors.push({ field: "status", code: "INVALID_STATUS", message: "실행 상태가 올바르지 않습니다." });
    if ((draft.status === "FAILED") !== (draft.errorCode !== null)) errors.push({ field: "errorCode", code: "INVALID_STATUS_ERROR", message: "실패에는 오류 코드가 필요하고 완료에는 오류 코드가 없어야 합니다." });
    if (draft.errorCode !== null && !SAFE_CODE.test(draft.errorCode)) errors.push({ field: "errorCode", code: "INVALID_ERROR", message: "안전한 오류 코드만 사용할 수 있습니다." });
    if (!Number.isFinite(draft.latencyMs) || draft.latencyMs < 0 || draft.latencyMs > MAX.latency) errors.push({ field: "latencyMs", code: "INVALID_LATENCY", message: "지연 시간이 허용 범위를 벗어났습니다." });
    if (!Number.isSafeInteger(draft.costMicros) || draft.costMicros < 0 || draft.costMicros > MAX.cost) errors.push({ field: "costMicros", code: "INVALID_COST", message: "비용이 허용 범위를 벗어났습니다." });
  }
  return freeze(errors) as readonly PressRagSandboxValidationError[];
}

function applyDraft(outcome: PressRagRecordedOutcome, prompt: string, draft: PressRagStageDraft, expectation: Expectation) {
  const next = copy(outcome) as { -readonly [K in keyof PressRagRecordedOutcome]: PressRagRecordedOutcome[K] };
  let nextPrompt = prompt;
  switch (draft.stageId) {
    case "request-intake": nextPrompt = draft.prompt; break;
    case "retrieval-execution":
      next.retrieval = draft.hits.map((hit, index) => ({ ...hit, rank: index + 1, expected: expectation.expectedDocuments.some(({ logicalId }) => logicalId === hit.logicalDocumentId) }));
      next.tools = copy(draft.tools); break;
    case "evidence-decision": next.cannotAnswer = draft.responseBranch === "ABSTENTION"; break;
    case "response-behavior":
      next.finalAnswer = draft.finalAnswer; next.summary = draft.summary;
      next.citations = draft.citations.map((citation) => ({ ...citation, expected: expectation.expectedDocuments.some(({ logicalId }) => logicalId === citation.logicalDocumentId) })); break;
    case "verification": next.verification = { ...next.verification, mode: draft.mode, status: draft.status, supportedClaims: draft.supportedClaims, totalClaims: draft.totalClaims }; break;
    case "fallback": next.fallback = { mode: draft.mode, reason: draft.reason }; break;
    case "terminal-evaluation": next.status = draft.status; next.errorCode = draft.errorCode; next.latencyMs = draft.latencyMs; next.costMicros = draft.costMicros; break;
  }
  next.checks = derivePressRagChecks(next, expectation);
  return { prompt: nextPrompt, outcome: next as PressRagRecordedOutcome };
}

function mergeProjection(recorded: PressRagSandboxProjection, projected: PressRagSandboxProjection, stageId: PressRagWorkflowNodeId): PressRagSandboxProjection {
  const boundary = PRESS_RAG_WORKFLOW_STAGE_IDS.indexOf(stageId);
  const nodes = projected.workflow.nodes.map((node, index) => index < boundary ? recorded.workflow.nodes[index]! : node);
  const edges = projected.workflow.edges.map((edge, index) => index < boundary ? recorded.workflow.edges[index]! : edge);
  const byNode = Object.fromEntries(projected.workflow.nodes.map((node, index) => [node.id, index < boundary ? recorded.guardrails.byNode[node.id] : projected.guardrails.byNode[node.id]]));
  const byEdge = Object.fromEntries(projected.workflow.edges.map((edge, index) => [edge.id, index < boundary ? recorded.guardrails.byEdge[edge.id] : projected.guardrails.byEdge[edge.id]]));
  return freeze({ ...projected, workflow: { ...projected.workflow, nodes, edges }, guardrails: { ...projected.guardrails, byNode, byEdge } }) as PressRagSandboxProjection;
}

export function projectRecordedPressRagSandbox(outcome: PressRagRecordedOutcome, expectation: Expectation, prompt: string): PressRagSandboxProjection {
  const recordedOutcome = freeze(copy(outcome)) as PressRagRecordedOutcome;
  const workflow = projectPressRagWorkflowView(recordedOutcome, expectation, prompt);
  return freeze({ prompt, outcome: recordedOutcome, workflow, guardrails: projectPressRagGuardrails(recordedOutcome, expectation, workflow) }) as PressRagSandboxProjection;
}

export function runPressRagSandbox(input: Readonly<{ recordedOutcome: PressRagRecordedOutcome; expectation: Expectation; prompt: string; draft: PressRagStageDraft; current?: PressRagSandboxProjection | null }>):
  | Readonly<{ ok: true; result: PressRagSandboxProjection }>
  | Readonly<{ ok: false; errors: readonly PressRagSandboxValidationError[] }> {
  const errors = validatePressRagStageDraft(input.draft);
  if (errors.length) return freeze({ ok: false, errors }) as { ok: false; errors: readonly PressRagSandboxValidationError[] };
  const recorded = projectRecordedPressRagSandbox(input.recordedOutcome, input.expectation, input.prompt);
  const base = input.current ?? recorded;
  const applied = applyDraft(base.outcome, base.prompt, input.draft, input.expectation);
  const workflow = projectPressRagWorkflowView(applied.outcome, input.expectation, applied.prompt);
  const projected = freeze({ ...applied, workflow, guardrails: projectPressRagGuardrails(applied.outcome, input.expectation, workflow) }) as PressRagSandboxProjection;
  return freeze({ ok: true, result: mergeProjection(recorded, projected, input.draft.stageId) }) as { ok: true; result: PressRagSandboxProjection };
}
