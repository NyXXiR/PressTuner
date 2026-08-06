import type {
  PressRagDemoViewModel,
  PressRagRecordedOutcome,
} from "./pressRagDemoPresenter";

export const PRESS_RAG_WORKFLOW_SCHEMA_VERSION = "press-rag-workflow-view/v3" as const;
export const PRESS_RAG_EXECUTION_SUMMARY_VERSION = "press-rag-execution-summary/v1" as const;
export const PRESS_RAG_WORKFLOW_STAGE_IDS = [
  "request-intake", "retrieval-execution", "evidence-decision", "response-behavior",
  "verification", "fallback", "terminal-evaluation",
] as const;

export type PressRagWorkflowTraversal = "TRAVERSED" | "NOT_TRAVERSED" | "UNKNOWN";
export type PressRagWorkflowStatus =
  | "RECORDED"
  | "MATCH"
  | "MISMATCH"
  | "FAILED"
  | "NOT_EVALUABLE"
  | "SKIPPED";
export type PressRagWorkflowStageKind =
  | "REQUEST_INTAKE"
  | "RETRIEVAL_EXECUTION"
  | "EVIDENCE_DECISION"
  | "ANSWER_RESPONSE"
  | "ABSTENTION_RESPONSE"
  | "CONFLICT_COMPARISON"
  | "VERIFICATION"
  | "FALLBACK"
  | "TERMINAL_EVALUATION";
export type PressRagWorkflowNodeId = (typeof PRESS_RAG_WORKFLOW_STAGE_IDS)[number];
export type PressRagWorkflowReasonCode =
  | "TOOL_FAILED"
  | "OUTPUT_MISSING"
  | "EXPECTED_FACT_MISMATCH"
  | "VERIFICATION_NOT_RECORDED"
  | "FALLBACK_NOT_USED"
  | "RECORDED_EXECUTION_FAILED";

export type PressRagWorkflowDetail = Readonly<{
  key: string;
  label: string;
  value: string;
}>;

export type PressRagWorkflowInspection = Readonly<{
  input: readonly PressRagWorkflowDetail[];
  evidence: readonly PressRagWorkflowDetail[];
  decisions: readonly PressRagWorkflowDetail[];
  output: readonly PressRagWorkflowDetail[];
}>;

export type PressRagWorkflowNode = Readonly<{
  id: PressRagWorkflowNodeId;
  stageKind: PressRagWorkflowStageKind;
  label: string;
  traversal: PressRagWorkflowTraversal;
  status: PressRagWorkflowStatus;
  statusReason: string;
  reasonCode: PressRagWorkflowReasonCode | null;
  reasonText: string | null;
  latencyMs: number | null;
  details: readonly PressRagWorkflowDetail[];
  inspection: PressRagWorkflowInspection;
}>;

type PressRagWorkflowNodeDraft = Omit<PressRagWorkflowNode, "inspection">;

export type PressRagWorkflowEdge = Readonly<{
  id: string;
  source: PressRagWorkflowNodeId;
  target: PressRagWorkflowNodeId;
  decisionLabel: string;
  state: "TAKEN" | "NOT_TAKEN" | "UNKNOWN";
  inspection: PressRagWorkflowInspection;
}>;

export type PressRagExecutionSummaryFactKey =
  | "evidence-use"
  | "citation-claim-verification"
  | "forbidden-source-protection"
  | "expected-tool-behavior"
  | "safe-fallback";

export type PressRagExecutionSummaryFact = Readonly<{
  key: PressRagExecutionSummaryFactKey;
  label: string;
  status: PressRagWorkflowStatus;
  value: string;
  reasonCode: PressRagWorkflowReasonCode | null;
  reasonText: string | null;
}>;

export type PressRagExecutionSummary = Readonly<{
  schemaVersion: typeof PRESS_RAG_EXECUTION_SUMMARY_VERSION;
  recordedExecutionRefVersion: PressRagRecordedOutcome["recordedExecutionRefVersion"];
  recordedExecutionRef: string;
  replaySource: "APPROVED_CONTROLLED_LIVE_REPLAY";
  recordedStatus: PressRagRecordedOutcome["status"];
  totalLatencyMs: number;
  facts: readonly PressRagExecutionSummaryFact[];
}>;

export type PressRagWorkflowView = Readonly<{
  schemaVersion: typeof PRESS_RAG_WORKFLOW_SCHEMA_VERSION;
  summary: PressRagExecutionSummary;
  recordedRunIndex: number;
  nodes: readonly PressRagWorkflowNode[];
  edges: readonly PressRagWorkflowEdge[];
  initiallySelectedNodeId: PressRagWorkflowNodeId;
}>;

type WorkflowExpectation = PressRagDemoViewModel["scenarios"][number]["expectation"];
type CheckName = keyof PressRagRecordedOutcome["checks"];
type Judgment = Pick<PressRagWorkflowNodeDraft, "status" | "statusReason" | "reasonCode" | "reasonText">;

const CHECK_ORDER: readonly CheckName[] = [
  "retrieval", "answerability", "citations", "forbiddenSources", "verification", "expectedTools",
];

function detail(key: string, label: string, value: string | number | boolean | null): PressRagWorkflowDetail {
  return { key, label, value: value === null ? "기록 없음" : String(value) };
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function normal(status: Judgment["status"], statusReason: string): Judgment {
  return { status, statusReason, reasonCode: null, reasonText: null };
}

function abnormal(
  status: Judgment["status"],
  statusReason: string,
  reasonCode: PressRagWorkflowReasonCode,
  reasonText: string,
): Judgment {
  return { status, statusReason, reasonCode, reasonText };
}

function checkStatus(outcome: PressRagRecordedOutcome, names: readonly CheckName[]): Judgment {
  const mismatches = names.filter((name) => outcome.checks[name] === "MISMATCH");
  if (mismatches.length > 0) {
    return abnormal(
      "MISMATCH",
      `기대값과 다른 검사: ${mismatches.map((name) => `checks.${name}`).join(", ")}`,
      "EXPECTED_FACT_MISMATCH",
      "기록된 결과가 승인된 기대값과 일치하지 않습니다.",
    );
  }
  const matches = names.filter((name) => outcome.checks[name] === "MATCH");
  if (matches.length > 0) return normal("MATCH", `기대값과 일치한 검사: ${matches.join(", ")}`);
  return abnormal(
    "NOT_EVALUABLE",
    `평가할 기록이 없는 검사: ${names.join(", ")}`,
    "OUTPUT_MISSING",
    "판정에 필요한 실행 출력이 기록되지 않았습니다.",
  );
}

function retrievalNode(outcome: PressRagRecordedOutcome): PressRagWorkflowNodeDraft {
  const failedTools = outcome.tools.filter(({ status }) => status === "FAILED");
  const judgment = failedTools.length > 0
    ? abnormal(
        "FAILED",
        `실패한 도구: ${failedTools.map(({ toolName }) => toolName).join(", ")}`,
        "TOOL_FAILED",
        "기록된 도구 실행이 실패했습니다.",
      )
    : checkStatus(outcome, ["retrieval", "expectedTools"]);
  return {
    id: "retrieval-execution",
    stageKind: "RETRIEVAL_EXECUTION",
    label: "검색 및 도구 실행",
    traversal: "TRAVERSED",
    ...judgment,
    latencyMs: null,
    details: [
      detail("retrieval.count", "검색 결과", `${outcome.retrieval.length}개`),
      detail("checks.retrieval", "기대 검색 검사", outcome.checks.retrieval),
      detail("checks.expectedTools", "기대 도구 검사", outcome.checks.expectedTools),
      ...outcome.retrieval.map((row) => detail(
        `retrieval.${row.rank}`,
        `검색 ${row.rank}`,
        `${row.logicalDocumentId} · ${row.filename} · p.${row.pageStart}-${row.pageEnd} · ${row.expected ? "기대 문서" : "기대 외"}`,
      )),
      ...outcome.tools.map((tool) => detail(
        `tool.${tool.sequence}`,
        `도구 ${tool.sequence}`,
        `${tool.toolName} · ${tool.status} · ${tool.latencyMs} ms`,
      )),
    ],
  };
}

function unavailableDownstream(
  id: PressRagWorkflowNodeId,
  stageKind: PressRagWorkflowStageKind,
  label: string,
  outcome: PressRagRecordedOutcome,
): PressRagWorkflowNodeDraft {
  return {
    id,
    stageKind,
    label,
    traversal: "UNKNOWN",
    ...abnormal(
      "NOT_EVALUABLE",
      `실행 실패 뒤 ${label} 출력이 기록되지 않았습니다.`,
      "OUTPUT_MISSING",
      "선행 실행 실패로 이 단계의 통과 여부와 출력이 확인되지 않습니다.",
    ),
    latencyMs: null,
    details: [detail("execution.errorCode", "실행 오류", outcome.errorCode)],
  };
}

function responseKind(
  outcome: PressRagRecordedOutcome,
  expectation: WorkflowExpectation,
): Pick<PressRagWorkflowNodeDraft, "stageKind" | "label"> {
  if (outcome.cannotAnswer === true) return { stageKind: "ABSTENTION_RESPONSE", label: "답변 유보 응답" };
  if (expectation.conflict === "COMPARE") return { stageKind: "CONFLICT_COMPARISON", label: "상충 근거 비교 응답" };
  return { stageKind: "ANSWER_RESPONSE", label: "근거 기반 답변" };
}

function responseNode(outcome: PressRagRecordedOutcome, expectation: WorkflowExpectation): PressRagWorkflowNodeDraft {
  const kind = responseKind(outcome, expectation);
  const compareRecorded = outcome.tools.some(
    ({ toolName, status }) => toolName === "compare_sources" && status === "COMPLETED",
  );
  const checks = checkStatus(outcome, ["citations", "forbiddenSources"]);
  const judgment = expectation.conflict === "COMPARE" && !compareRecorded
    ? abnormal(
        "MISMATCH",
        "상충 자료 비교에 필요한 compare_sources 완료 기록이 없습니다.",
        "EXPECTED_FACT_MISMATCH",
        "승인된 기대 도구 동작과 기록이 일치하지 않습니다.",
      )
    : checks;
  return {
    id: "response-behavior",
    ...kind,
    traversal: "TRAVERSED",
    ...judgment,
    latencyMs: null,
    details: [
      detail("response.branch", "응답 분기", outcome.cannotAnswer ? "ABSTENTION" : expectation.conflict === "COMPARE" ? "CONFLICT_COMPARISON" : "ANSWER"),
      detail("response.answer", "최종 답변", outcome.finalAnswer),
      detail("response.summary", "요약", outcome.summary),
      detail("citations.count", "인용 수", outcome.citations.length),
    ],
  };
}

function recordedBranch(outcome: PressRagRecordedOutcome, expectation: WorkflowExpectation) {
  if (outcome.cannotAnswer === null) return "기록 없음";
  if (outcome.cannotAnswer) return "ABSTENTION";
  return expectation.conflict === "COMPARE" ? "CONFLICT_COMPARISON" : "ANSWER";
}

function inspectionForNode(
  node: PressRagWorkflowNodeDraft,
  outcome: PressRagRecordedOutcome,
  expectation: WorkflowExpectation,
  prompt: string,
): PressRagWorkflowInspection {
  const expectedDocuments = expectation.expectedDocuments.map(({ logicalId }) => logicalId).join(", ") || "없음";
  const expectedTools = expectation.expectedTools.join(", ") || "없음";
  const branch = recordedBranch(outcome, expectation);
  const decision = (items: PressRagWorkflowDetail[]) => [
    detail("node.status", "단계 판정", node.status),
    ...items,
  ];

  switch (node.id) {
    case "request-intake":
      return {
        input: [detail("request.prompt", "승인된 synthetic 질문", prompt)],
        evidence: [detail("execution.ref", "기록 실행 참조", outcome.recordedExecutionRef)],
        decisions: decision([detail("replay.source", "재생 출처", "APPROVED_CONTROLLED_LIVE_REPLAY")]),
        output: [detail("request.runIndex", "선택된 반복", outcome.runIndex)],
      };
    case "retrieval-execution":
      return {
        input: [
          detail("retrieval.query", "검색 질문", prompt),
          detail("retrieval.expectedDocuments", "기대 문서", expectedDocuments),
          detail("retrieval.expectedTools", "기대 도구", expectedTools),
        ],
        evidence: [
          ...outcome.retrieval.map((row) => detail(
            `retrieval.${row.rank}`,
            `검색 ${row.rank}`,
            `${row.logicalDocumentId} · ${row.filename} · p.${row.pageStart}-${row.pageEnd} · score=${row.score ?? "기록 없음"}`,
          )),
          ...outcome.tools.map((tool) => detail(`tool.${tool.sequence}`, `도구 ${tool.sequence}`, `${tool.toolName} · ${tool.status} · ${tool.latencyMs} ms`)),
          ...(outcome.retrieval.length === 0 && outcome.tools.length === 0
            ? [detail("retrieval.absence", "실행 근거", "검색 결과와 도구 실행 기록 없음")]
            : []),
        ],
        decisions: decision([
          detail("checks.retrieval", "기대 문서 검사", outcome.checks.retrieval),
          detail("checks.expectedTools", "기대 도구 검사", outcome.checks.expectedTools),
        ]),
        output: [detail("retrieval.count", "검색 결과", `${outcome.retrieval.length}개`)],
      };
    case "evidence-decision":
      return {
        input: [detail("evidence.count", "검색 근거", `${outcome.retrieval.length}개`)],
        evidence: [
          detail("expectation.answerability", "기대 분기", expectation.answerability),
          detail("expectation.conflict", "상충 처리 기대", expectation.conflict),
        ],
        decisions: decision([
          detail("checks.answerability", "답변 가능성 검사", outcome.checks.answerability),
          detail("expectation.abstentionReason", "답변 유보 사유", expectation.abstentionReason),
        ]),
        output: [detail("response.branch", "선택된 응답 분기", branch)],
      };
    case "response-behavior":
      return {
        input: [detail("response.branch", "응답 분기", branch), detail("evidence.count", "검색 근거", `${outcome.retrieval.length}개`)],
        evidence: [
          ...outcome.citations.map((citation, index) => detail(
            `citation.${index + 1}`,
            `인용 ${index + 1}`,
            `${citation.sourceLabel} · ${citation.logicalDocumentId} · ${citation.filename} · p.${citation.pageStart}-${citation.pageEnd}`,
          )),
          ...(outcome.citations.length === 0 ? [detail("citations.absence", "인용 기록", "없음")] : []),
        ],
        decisions: decision([
          detail("checks.citations", "인용 검사", outcome.checks.citations),
          detail("checks.forbiddenSources", "금지 출처 검사", outcome.checks.forbiddenSources),
        ]),
        output: [
          detail("response.answer", "최종 답변", outcome.finalAnswer),
          detail("response.summary", "요약", outcome.summary),
          detail("response.cannotAnswer", "cannotAnswer", outcome.cannotAnswer),
        ],
      };
    case "verification":
      return {
        input: [detail("verification.claimCount", "검증 대상 주장", outcome.verification.totalClaims)],
        evidence: [
          ...outcome.verification.claims.map((claim, index) => {
            const coordinates = claim.evidence.map((item) => `${item.sourceLabel} p.${item.pageStart}-${item.pageEnd}`).join(" | ") || "근거 좌표 없음";
            return detail(`verification.claim.${index + 1}`, `주장 ${index + 1}`, `${claim.status} · ${claim.text} · ${coordinates}`);
          }),
          ...(outcome.verification.claims.length === 0 ? [detail("verification.absence", "주장별 근거", "기록 없음")] : []),
        ],
        decisions: decision([detail("checks.verification", "주장 검증 검사", outcome.checks.verification)]),
        output: [
          detail("verification.status", "검증 결과", outcome.verification.status),
          detail("verification.coverage", "지원 주장", `${outcome.verification.supportedClaims}/${outcome.verification.totalClaims}`),
        ],
      };
    case "fallback":
      return {
        input: [detail("verification.status", "검증 결과", outcome.verification.status)],
        evidence: [detail("fallback.reason", "안전 대체 사유", outcome.fallback.reason)],
        decisions: decision([detail("fallback.recorded", "대체 동작 기록", outcome.fallback.mode === null ? "없음" : "있음")]),
        output: [detail("fallback.mode", "대체 동작", outcome.fallback.mode ?? "실행 안 함")],
      };
    case "terminal-evaluation":
      return {
        input: [detail("execution.status", "실행 상태", outcome.status), detail("execution.errorCode", "실행 오류", outcome.errorCode)],
        evidence: CHECK_ORDER.map((name) => detail(`checks.${name}`, `checks.${name}`, outcome.checks[name])),
        decisions: decision([detail("terminal.reasonCode", "사유 코드", node.reasonCode)]),
        output: [
          detail("terminal.status", "최종 판정", node.status),
          detail("execution.totalLatencyMs", "전체 지연 시간", `${outcome.latencyMs} ms`),
          detail("execution.costMicros", "기록 비용", `${outcome.costMicros} micro-USD`),
        ],
      };
  }
}

function edge(
  source: PressRagWorkflowNodeId,
  target: PressRagWorkflowNodeId,
  decisionLabel: string,
  state: PressRagWorkflowEdge["state"],
  sourceInspection: PressRagWorkflowInspection,
  targetInspection: PressRagWorkflowInspection,
): PressRagWorkflowEdge {
  return {
    id: `${source}--${target}`,
    source,
    target,
    decisionLabel,
    state,
    inspection: {
      input: sourceInspection.input,
      evidence: sourceInspection.evidence,
      decisions: [
        ...sourceInspection.decisions,
        detail("edge.traversal", "전이 상태", state),
        detail("edge.condition", "전이 조건", decisionLabel),
      ],
      output: targetInspection.output,
    },
  };
}

function edgeState(source: PressRagWorkflowNode, target: PressRagWorkflowNode): PressRagWorkflowEdge["state"] {
  if (source.traversal === "UNKNOWN" || target.traversal === "UNKNOWN") return "UNKNOWN";
  if (source.traversal === "NOT_TRAVERSED" || target.traversal === "NOT_TRAVERSED") return "NOT_TAKEN";
  return "TAKEN";
}

function factJudgment(status: PressRagRecordedOutcome["checks"][CheckName]): Judgment {
  if (status === "MATCH") return normal("MATCH", "승인된 기대값과 일치합니다.");
  if (status === "MISMATCH") return abnormal("MISMATCH", "승인된 기대값과 일치하지 않습니다.", "EXPECTED_FACT_MISMATCH", "기록된 결과와 기대값이 다릅니다.");
  return abnormal("NOT_EVALUABLE", "판정할 기록이 없습니다.", "OUTPUT_MISSING", "필요한 실행 출력이 기록되지 않았습니다.");
}

function summaryFact(
  key: PressRagExecutionSummaryFactKey,
  label: string,
  value: string,
  judgment: Judgment,
): PressRagExecutionSummaryFact {
  return { key, label, value, status: judgment.status, reasonCode: judgment.reasonCode, reasonText: judgment.reasonText };
}

function buildSummary(outcome: PressRagRecordedOutcome): PressRagExecutionSummary {
  const citationVerification = outcome.checks.citations === "MISMATCH" || outcome.checks.verification === "MISMATCH"
    ? "MISMATCH"
    : outcome.checks.citations === "MATCH" || outcome.checks.verification === "MATCH"
      ? "MATCH"
      : "NOT_EVALUABLE";
  const fallbackJudgment = outcome.status === "FAILED" && outcome.cannotAnswer === null
    ? abnormal("NOT_EVALUABLE", "실패 뒤 안전 대체 출력이 없습니다.", "OUTPUT_MISSING", "안전 대체 실행 여부를 확인할 수 없습니다.")
    : outcome.fallback.mode === null
      ? abnormal("SKIPPED", "안전 대체가 사용되지 않았습니다.", "FALLBACK_NOT_USED", "이 기록에는 안전 대체 실행이 없습니다.")
      : normal("RECORDED", `안전 대체 ${outcome.fallback.mode} 기록이 있습니다.`);
  return {
    schemaVersion: PRESS_RAG_EXECUTION_SUMMARY_VERSION,
    recordedExecutionRefVersion: outcome.recordedExecutionRefVersion,
    recordedExecutionRef: outcome.recordedExecutionRef,
    replaySource: "APPROVED_CONTROLLED_LIVE_REPLAY",
    recordedStatus: outcome.status,
    totalLatencyMs: outcome.latencyMs,
    facts: [
      summaryFact("evidence-use", "근거 검색 및 사용", `검색 ${outcome.retrieval.length}개`, factJudgment(outcome.checks.retrieval)),
      summaryFact("citation-claim-verification", "인용 및 주장 검증", `지원 주장 ${outcome.verification.supportedClaims}/${outcome.verification.totalClaims}`, factJudgment(citationVerification)),
      summaryFact("forbidden-source-protection", "금지 출처 보호", outcome.checks.forbiddenSources, factJudgment(outcome.checks.forbiddenSources)),
      summaryFact("expected-tool-behavior", "기대 도구 동작", outcome.checks.expectedTools, factJudgment(outcome.checks.expectedTools)),
      summaryFact("safe-fallback", "안전 대체", outcome.fallback.mode ?? "사용 안 함", fallbackJudgment),
    ],
  };
}

export function projectPressRagWorkflowView(
  outcome: PressRagRecordedOutcome,
  expectation: WorkflowExpectation,
  prompt = "기록 없음",
): PressRagWorkflowView {
  const hasOutput = outcome.cannotAnswer !== null;
  const downstreamUnavailable = outcome.status === "FAILED" && !hasOutput;
  const decision: PressRagWorkflowNodeDraft = downstreamUnavailable
    ? unavailableDownstream("evidence-decision", "EVIDENCE_DECISION", "답변 가능성 판단", outcome)
    : {
        id: "evidence-decision",
        stageKind: "EVIDENCE_DECISION",
        label: "답변 가능성 판단",
        traversal: hasOutput ? "TRAVERSED" : "NOT_TRAVERSED",
        ...(hasOutput
          ? checkStatus(outcome, ["answerability"])
          : abnormal("NOT_EVALUABLE", "cannotAnswer 출력이 기록되지 않았습니다.", "OUTPUT_MISSING", "응답 분기를 판정할 수 없습니다.")),
        latencyMs: null,
        details: [detail("expectation.answerability", "기대 분기", expectation.answerability), detail("response.cannotAnswer", "기록된 cannotAnswer", outcome.cannotAnswer)],
      };
  const response: PressRagWorkflowNodeDraft = downstreamUnavailable
    ? unavailableDownstream("response-behavior", responseKind(outcome, expectation).stageKind, "응답 동작", outcome)
    : hasOutput
      ? responseNode(outcome, expectation)
      : {
          ...unavailableDownstream("response-behavior", responseKind(outcome, expectation).stageKind, "응답 동작", outcome),
          traversal: "NOT_TRAVERSED",
        };
  const verification: PressRagWorkflowNodeDraft = downstreamUnavailable
    ? unavailableDownstream("verification", "VERIFICATION", "주장 검증", outcome)
    : outcome.verification.mode === null || outcome.verification.status === null
      ? {
          id: "verification",
          stageKind: "VERIFICATION",
          label: "주장 검증",
          traversal: "NOT_TRAVERSED",
          ...abnormal("NOT_EVALUABLE", "명시적 주장 검증 기록이 없습니다.", "VERIFICATION_NOT_RECORDED", "검증이 실행되었다고 추정하지 않습니다."),
          latencyMs: null,
          details: [detail("verification.mode", "명시적 검증", "기록 없음")],
        }
      : {
          id: "verification",
          stageKind: "VERIFICATION",
          label: "주장 검증",
          traversal: "TRAVERSED",
          ...(outcome.verification.status === "PASS" && outcome.verification.supportedClaims === outcome.verification.totalClaims
            ? normal("MATCH", "모든 기록된 주장이 지원됩니다.")
            : abnormal("MISMATCH", "일부 주장이 지원되지 않았습니다.", "EXPECTED_FACT_MISMATCH", "주장 검증 결과가 기대와 일치하지 않습니다.")),
          latencyMs: null,
          details: [detail("verification.status", "상태", outcome.verification.status), detail("verification.coverage", "지원 주장", `${outcome.verification.supportedClaims}/${outcome.verification.totalClaims}`)],
        };
  const fallback: PressRagWorkflowNodeDraft = downstreamUnavailable
    ? unavailableDownstream("fallback", "FALLBACK", "안전 대체", outcome)
    : outcome.fallback.mode === null
      ? {
          id: "fallback",
          stageKind: "FALLBACK",
          label: "안전 대체",
          traversal: "NOT_TRAVERSED",
          ...abnormal("SKIPPED", "안전 대체 기록이 없습니다.", "FALLBACK_NOT_USED", "이 실행에서는 안전 대체가 사용되지 않았습니다."),
          latencyMs: null,
          details: [detail("fallback.mode", "대체 동작", "기록 없음")],
        }
      : {
          id: "fallback",
          stageKind: "FALLBACK",
          label: "안전 대체",
          traversal: "TRAVERSED",
          ...normal("RECORDED", `안전 대체 ${outcome.fallback.mode} 실행이 기록되었습니다.`),
          latencyMs: null,
          details: [detail("fallback.mode", "모드", outcome.fallback.mode), detail("fallback.reason", "안전한 사유", outcome.fallback.reason)],
        };
  const terminalJudgment = outcome.status === "FAILED"
    ? abnormal("FAILED", `기록 실행 실패: ${outcome.errorCode ?? "오류 코드 없음"}`, "RECORDED_EXECUTION_FAILED", "기록된 실행이 완료되지 않았습니다.")
    : checkStatus(outcome, CHECK_ORDER);

  const nodeDrafts: PressRagWorkflowNodeDraft[] = [
    {
      id: "request-intake",
      stageKind: "REQUEST_INTAKE",
      label: "기록 요청 식별",
      traversal: "TRAVERSED",
      ...normal("RECORDED", `반복 ${outcome.runIndex}의 승인된 기록을 선택했습니다.`),
      latencyMs: null,
      details: [detail("execution.ref", "기록 실행 참조", outcome.recordedExecutionRef), detail("execution.status", "실행 상태", outcome.status)],
    },
    retrievalNode(outcome),
    decision,
    response,
    verification,
    fallback,
    {
      id: "terminal-evaluation",
      stageKind: "TERMINAL_EVALUATION",
      label: "최종 독립 평가",
      traversal: "TRAVERSED",
      ...terminalJudgment,
      latencyMs: outcome.latencyMs,
      details: [detail("execution.status", "실행 상태", outcome.status), ...CHECK_ORDER.map((name) => detail(`checks.${name}`, `checks.${name}`, outcome.checks[name]))],
    },
  ];
  const nodes: PressRagWorkflowNode[] = nodeDrafts.map((node) => ({
    ...node,
    inspection: inspectionForNode(node, outcome, expectation, prompt),
  }));
  const labels = ["기록 재생", "검색 근거 평가", "응답 분기 선택", "주장 검증 여부", "안전 대체 여부", "독립 평가"];
  const edges = nodes.slice(0, -1).map((source, index) => {
    const target = nodes[index + 1]!;
    return edge(
      source.id,
      target.id,
      labels[index]!,
      edgeState(source, target),
      source.inspection,
      target.inspection,
    );
  });

  return deepFreeze({
    schemaVersion: PRESS_RAG_WORKFLOW_SCHEMA_VERSION,
    summary: buildSummary(outcome),
    recordedRunIndex: outcome.runIndex,
    nodes,
    edges,
    initiallySelectedNodeId: "request-intake",
  }) as PressRagWorkflowView;
}
