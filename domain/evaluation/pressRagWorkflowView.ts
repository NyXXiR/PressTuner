import type {
  PressRagDemoViewModel,
  PressRagRecordedOutcome,
} from "./pressRagDemoPresenter";

export const PRESS_RAG_WORKFLOW_SCHEMA_VERSION = "press-rag-workflow-view/v2" as const;
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

export type PressRagWorkflowDetail = Readonly<{
  label: string;
  value: string;
}>;

export type PressRagWorkflowInspection = Readonly<{
  input: readonly PressRagWorkflowDetail[];
  evidence: readonly PressRagWorkflowDetail[];
  output: readonly PressRagWorkflowDetail[];
}>;

export type PressRagWorkflowNode = Readonly<{
  id: PressRagWorkflowNodeId;
  stageKind: PressRagWorkflowStageKind;
  label: string;
  traversal: PressRagWorkflowTraversal;
  status: PressRagWorkflowStatus;
  statusReason: string;
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
}>;

export type PressRagWorkflowView = Readonly<{
  schemaVersion: typeof PRESS_RAG_WORKFLOW_SCHEMA_VERSION;
  recordedRunIndex: number;
  nodes: readonly PressRagWorkflowNode[];
  edges: readonly PressRagWorkflowEdge[];
  initiallySelectedNodeId: PressRagWorkflowNodeId;
}>;

type WorkflowExpectation = PressRagDemoViewModel["scenarios"][number]["expectation"];
type CheckName = keyof PressRagRecordedOutcome["checks"];

const CHECK_ORDER: readonly CheckName[] = [
  "retrieval",
  "answerability",
  "citations",
  "forbiddenSources",
  "verification",
  "expectedTools",
];

function detail(label: string, value: string | number | boolean | null): PressRagWorkflowDetail {
  return { label, value: value === null ? "기록 없음" : String(value) };
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function checkStatus(
  outcome: PressRagRecordedOutcome,
  names: readonly CheckName[],
): Pick<PressRagWorkflowNodeDraft, "status" | "statusReason"> {
  const mismatches = names.filter((name) => outcome.checks[name] === "MISMATCH");
  if (mismatches.length > 0) {
    return {
      status: "MISMATCH",
      statusReason: mismatches.map((name) => `checks.${name}=MISMATCH`).join(", "),
    };
  }
  const matches = names.filter((name) => outcome.checks[name] === "MATCH");
  if (matches.length > 0) {
    return {
      status: "MATCH",
      statusReason: matches.map((name) => `checks.${name}=MATCH`).join(", "),
    };
  }
  return {
    status: "NOT_EVALUABLE",
    statusReason: names.map((name) => `checks.${name}=NOT_EVALUABLE`).join(", "),
  };
}

function retrievalNode(outcome: PressRagRecordedOutcome): PressRagWorkflowNodeDraft {
  const failedTools = outcome.tools.filter(({ status }) => status === "FAILED");
  const judgment = failedTools.length > 0
    ? {
        status: "FAILED" as const,
        statusReason: `recorded tools failed: ${failedTools.map(({ toolName }) => toolName).join(", ")}`,
      }
    : checkStatus(outcome, ["retrieval", "expectedTools"]);
  const latencyMs = outcome.tools.length > 0
    ? outcome.tools.reduce((total, tool) => total + tool.latencyMs, 0)
    : null;

  return {
    id: "retrieval-execution",
    stageKind: "RETRIEVAL_EXECUTION",
    label: "검색 및 도구 실행",
    traversal: "TRAVERSED",
    ...judgment,
    latencyMs,
    details: [
      detail("검색 결과", `${outcome.retrieval.length}개`),
      detail("기대 검색 검사", outcome.checks.retrieval),
      detail("기대 도구 검사", outcome.checks.expectedTools),
      ...outcome.retrieval.map((row) =>
        detail(`검색 ${row.rank}`, `${row.logicalDocumentId} · ${row.filename} · p.${row.pageStart}-${row.pageEnd} · ${row.expected ? "기대 문서" : "기대 외"}`),
      ),
      ...outcome.tools.map((tool) =>
        detail(`도구 ${tool.sequence}`, `${tool.toolName} · ${tool.status} · ${tool.latencyMs} ms`),
      ),
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
    status: "NOT_EVALUABLE",
    statusReason: `recorded output missing after status=${outcome.status}`,
    latencyMs: null,
    details: [detail("실행 오류", outcome.errorCode)],
  };
}

function responseKind(
  outcome: PressRagRecordedOutcome,
  expectation: WorkflowExpectation,
): Pick<PressRagWorkflowNodeDraft, "stageKind" | "label"> {
  if (outcome.cannotAnswer === true) {
    return { stageKind: "ABSTENTION_RESPONSE", label: "답변 유보 응답" };
  }
  if (expectation.conflict === "COMPARE") {
    return { stageKind: "CONFLICT_COMPARISON", label: "상충 근거 비교 응답" };
  }
  return { stageKind: "ANSWER_RESPONSE", label: "근거 기반 답변" };
}

function responseNode(
  outcome: PressRagRecordedOutcome,
  expectation: WorkflowExpectation,
): PressRagWorkflowNodeDraft {
  const kind = responseKind(outcome, expectation);
  const compareRecorded = outcome.tools.some(
    ({ toolName, status }) => toolName === "compare_sources" && status === "COMPLETED",
  );
  const checks = checkStatus(outcome, ["citations", "forbiddenSources"]);
  const judgment = expectation.conflict === "COMPARE" && !compareRecorded
    ? {
        status: "MISMATCH" as const,
        statusReason: `expected compare_sources record missing; ${checks.statusReason}`,
      }
    : checks;

  return {
    id: "response-behavior",
    ...kind,
    traversal: "TRAVERSED",
    ...judgment,
    latencyMs: null,
    details: [
      detail("응답 분기", outcome.cannotAnswer ? "ABSTENTION" : expectation.conflict === "COMPARE" ? "CONFLICT_COMPARISON" : "ANSWER"),
      detail("최종 답변", outcome.finalAnswer),
      detail("요약", outcome.summary),
      detail("인용 수", outcome.citations.length),
      detail("인용 검사", outcome.checks.citations),
      detail("금지 출처 검사", outcome.checks.forbiddenSources),
      ...(expectation.conflict === "COMPARE"
        ? [detail("compare_sources 기록", compareRecorded ? "있음" : "없음")]
        : []),
      ...outcome.citations.map((citation) =>
        detail("인용", `${citation.sourceLabel} · ${citation.logicalDocumentId} · p.${citation.pageStart}-${citation.pageEnd} · ${citation.expected ? "기대 출처" : "기대 외"}`),
      ),
    ],
  };
}

function edge(
  source: PressRagWorkflowNodeId,
  target: PressRagWorkflowNodeId,
  decisionLabel: string,
  state: PressRagWorkflowEdge["state"],
): PressRagWorkflowEdge {
  return { id: `${source}--${target}`, source, target, decisionLabel, state };
}

function inspectionForNode(
  node: PressRagWorkflowNodeDraft,
  outcome: PressRagRecordedOutcome,
  expectation: WorkflowExpectation,
  prompt: string,
): PressRagWorkflowInspection {
  const expectedDocuments = expectation.expectedDocuments.map(({ logicalId }) => logicalId).join(", ") || "없음";
  const expectedTools = expectation.expectedTools.join(", ") || "없음";
  const recordedBranch = outcome.cannotAnswer === null
    ? "기록 없음"
    : outcome.cannotAnswer
      ? "ABSTENTION"
      : expectation.conflict === "COMPARE"
        ? "CONFLICT_COMPARISON"
        : "ANSWER";

  switch (node.id) {
    case "request-intake":
      return {
        input: [detail("승인된 질문", prompt)],
        evidence: [detail("기록된 실행", outcome.runIndex), detail("실행 기록 상태", outcome.status)],
        output: [detail("요청 식별 결과", `recorded run ${outcome.runIndex}`)],
      };
    case "retrieval-execution":
      return {
        input: [
          detail("검색 질문", prompt),
          detail("기대 문서", expectedDocuments),
          detail("기대 도구", expectedTools),
        ],
        evidence: [
          ...outcome.retrieval.map((row) =>
            detail(`검색 ${row.rank}`, `${row.logicalDocumentId} · ${row.filename} · p.${row.pageStart}-${row.pageEnd} · score=${row.score ?? "기록 없음"} · ${row.expected ? "기대 문서" : "기대 외"}`),
          ),
          ...outcome.tools.map((tool) =>
            detail(`도구 ${tool.sequence}`, `${tool.toolName} · ${tool.status} · ${tool.latencyMs} ms`),
          ),
          ...(outcome.retrieval.length === 0 && outcome.tools.length === 0
            ? [detail("실행 근거", "검색 결과와 도구 실행 기록 없음")]
            : []),
        ],
        output: [
          detail("검색 결과", `${outcome.retrieval.length}개`),
          detail("검색 검사", outcome.checks.retrieval),
          detail("도구 검사", outcome.checks.expectedTools),
        ],
      };
    case "evidence-decision":
      return {
        input: [
          detail("검색 근거", `${outcome.retrieval.length}개`),
          detail("기대 분기", expectation.answerability),
        ],
        evidence: [
          detail("답변 가능성 검사", outcome.checks.answerability),
          detail("상충 처리 기대", expectation.conflict),
          detail("답변 유보 사유", expectation.abstentionReason),
        ],
        output: [detail("선택된 응답 분기", recordedBranch)],
      };
    case "response-behavior":
      return {
        input: [
          detail("응답 분기", recordedBranch),
          detail("검색 근거", `${outcome.retrieval.length}개`),
        ],
        evidence: [
          detail("인용 검사", outcome.checks.citations),
          detail("금지 출처 검사", outcome.checks.forbiddenSources),
          ...outcome.citations.map((citation, index) =>
            detail(`인용 ${index + 1}`, `${citation.sourceLabel} · ${citation.logicalDocumentId} · p.${citation.pageStart}-${citation.pageEnd} · ${citation.expected ? "기대 출처" : "기대 외"}`),
          ),
          ...(outcome.citations.length === 0 ? [detail("인용 기록", "없음")] : []),
        ],
        output: [
          detail("최종 답변", outcome.finalAnswer),
          detail("요약", outcome.summary),
          detail("cannotAnswer", outcome.cannotAnswer),
        ],
      };
    case "verification":
      return {
        input: [
          detail("검증 대상 답변", outcome.finalAnswer),
          detail("검증 대상 인용", `${outcome.citations.length}개`),
        ],
        evidence: [
          detail("검증 모드", outcome.verification.mode),
          ...outcome.verification.claims.map((claim, index) => {
            const sources = claim.evidence.map((record) =>
              `${record.sourceLabel} p.${record.pageStart}-${record.pageEnd}: ${record.quote}`,
            ).join(" | ") || "근거 기록 없음";
            return detail(`주장 ${index + 1}`, `${claim.status} · ${claim.text} · ${sources}`);
          }),
          ...(outcome.verification.claims.length === 0 ? [detail("주장별 근거", "기록 없음")] : []),
        ],
        output: [
          detail("검증 결과", outcome.verification.status),
          detail("지원 주장", `${outcome.verification.supportedClaims}/${outcome.verification.totalClaims}`),
        ],
      };
    case "fallback":
      return {
        input: [
          detail("검증 결과", outcome.verification.status),
          detail("지원 주장", `${outcome.verification.supportedClaims}/${outcome.verification.totalClaims}`),
        ],
        evidence: [detail("안전 대체 사유", outcome.fallback.reason)],
        output: [detail("대체 동작", outcome.fallback.mode ?? "실행 안 함")],
      };
    case "terminal-evaluation":
      return {
        input: [
          detail("실행 상태", outcome.status),
          detail("실행 오류", outcome.errorCode),
        ],
        evidence: CHECK_ORDER.map((name) => detail(`checks.${name}`, outcome.checks[name])),
        output: [
          detail("최종 판정", node.status),
          detail("지연 시간", `${outcome.latencyMs} ms`),
          detail("모델 비용", `${outcome.costMicros} micro-USD`),
        ],
      };
  }
}

export function projectPressRagWorkflowView(
  outcome: PressRagRecordedOutcome,
  expectation: WorkflowExpectation,
  prompt = "기록 없음",
): PressRagWorkflowView {
  const hasOutput = outcome.cannotAnswer !== null;
  const downstreamUnavailable = outcome.status === "FAILED" && !hasOutput;
  const decision = downstreamUnavailable
    ? unavailableDownstream("evidence-decision", "EVIDENCE_DECISION", "답변 가능성 판단", outcome)
    : {
        id: "evidence-decision" as const,
        stageKind: "EVIDENCE_DECISION" as const,
        label: "답변 가능성 판단",
        traversal: hasOutput ? "TRAVERSED" as const : "NOT_TRAVERSED" as const,
        ...(hasOutput
          ? checkStatus(outcome, ["answerability"])
          : { status: "NOT_EVALUABLE" as const, statusReason: "recorded cannotAnswer output missing" }),
        latencyMs: null,
        details: [
          detail("기대 분기", expectation.answerability),
          detail("기록된 cannotAnswer", outcome.cannotAnswer),
          detail("선택하지 않은 대안", expectation.answerability === "ANSWER" ? "ABSTENTION" : "ANSWER"),
          detail("검사", outcome.checks.answerability),
        ],
      };
  const response = downstreamUnavailable
    ? unavailableDownstream("response-behavior", responseKind(outcome, expectation).stageKind, "응답 동작", outcome)
    : hasOutput
      ? responseNode(outcome, expectation)
      : {
          ...unavailableDownstream("response-behavior", responseKind(outcome, expectation).stageKind, "응답 동작", outcome),
          traversal: "NOT_TRAVERSED" as const,
          statusReason: "recorded answer and cannotAnswer output missing",
        };
  const verification = downstreamUnavailable
    ? unavailableDownstream("verification", "VERIFICATION", "주장 검증", outcome)
    : outcome.verification.mode === null || outcome.verification.status === null
      ? {
          id: "verification" as const,
          stageKind: "VERIFICATION" as const,
          label: "주장 검증",
          traversal: "NOT_TRAVERSED" as const,
          status: "NOT_EVALUABLE" as const,
          statusReason: "explicit verification.mode/status record missing",
          latencyMs: null,
          details: [detail("명시적 검증", "기록 없음"), detail("광범위 검사", outcome.checks.verification)],
        }
      : {
          id: "verification" as const,
          stageKind: "VERIFICATION" as const,
          label: "주장 검증",
          traversal: "TRAVERSED" as const,
          status: outcome.verification.status === "PASS" && outcome.verification.supportedClaims === outcome.verification.totalClaims
            ? "MATCH" as const
            : "MISMATCH" as const,
          statusReason: `verification.status=${outcome.verification.status}; supportedClaims=${outcome.verification.supportedClaims}/${outcome.verification.totalClaims}`,
          latencyMs: null,
          details: [
            detail("모드", outcome.verification.mode),
            detail("상태", outcome.verification.status),
            detail("지원 주장", `${outcome.verification.supportedClaims}/${outcome.verification.totalClaims}`),
            ...outcome.verification.claims.map((claim, index) => detail(`주장 ${index + 1}`, `${claim.status} · ${claim.text}`)),
          ],
        };
  const fallback = downstreamUnavailable
    ? unavailableDownstream("fallback", "FALLBACK", "안전 대체", outcome)
    : outcome.fallback.mode === null
      ? {
          id: "fallback" as const,
          stageKind: "FALLBACK" as const,
          label: "안전 대체",
          traversal: "NOT_TRAVERSED" as const,
          status: "SKIPPED" as const,
          statusReason: "fallback.mode record absent",
          latencyMs: null,
          details: [detail("대체 동작", "기록 없음")],
        }
      : {
          id: "fallback" as const,
          stageKind: "FALLBACK" as const,
          label: "안전 대체",
          traversal: "TRAVERSED" as const,
          status: "RECORDED" as const,
          statusReason: `fallback.mode=${outcome.fallback.mode} recorded; correctness is not inferred`,
          latencyMs: null,
          details: [detail("모드", outcome.fallback.mode), detail("안전한 사유", outcome.fallback.reason)],
        };
  const terminalJudgment = outcome.status === "FAILED"
    ? { status: "FAILED" as const, statusReason: `recorded outcome status=FAILED; errorCode=${outcome.errorCode ?? "missing"}` }
    : checkStatus(outcome, CHECK_ORDER);

  const nodeDrafts: PressRagWorkflowNodeDraft[] = [
    {
      id: "request-intake",
      stageKind: "REQUEST_INTAKE",
      label: "기록 요청 식별",
      traversal: "TRAVERSED",
      status: "RECORDED",
      statusReason: `recorded runIndex=${outcome.runIndex} selected; request validation is not inferred`,
      latencyMs: null,
      details: [detail("기록된 실행", outcome.runIndex), detail("실행 상태", outcome.status)],
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
      details: [
        detail("실행 상태", outcome.status),
        detail("오류 코드", outcome.errorCode),
        ...CHECK_ORDER.map((name) => detail(`checks.${name}`, outcome.checks[name])),
      ],
    },
  ];
  const nodes: PressRagWorkflowNode[] = nodeDrafts.map((node) => ({
    ...node,
    inspection: inspectionForNode(node, outcome, expectation, prompt),
  }));
  const downstreamState: PressRagWorkflowEdge["state"] = downstreamUnavailable ? "UNKNOWN" : "TAKEN";
  const fallbackState: PressRagWorkflowEdge["state"] = downstreamUnavailable
    ? "UNKNOWN"
    : outcome.fallback.mode === null
      ? "NOT_TAKEN"
      : "TAKEN";
  const edges = [
    edge("request-intake", "retrieval-execution", "기록 재생", "TAKEN"),
    edge("retrieval-execution", "evidence-decision", "검색 근거 평가", downstreamState),
    edge("evidence-decision", "response-behavior", hasOutput ? (outcome.cannotAnswer ? "답변 유보" : "답변") : "출력 기록 없음", downstreamState),
    edge("response-behavior", "verification", "명시적 검증 기록", downstreamUnavailable ? "UNKNOWN" : outcome.verification.mode === null ? "NOT_TAKEN" : "TAKEN"),
    edge("verification", "fallback", "안전 대체 기록", fallbackState),
    edge("fallback", "terminal-evaluation", "독립 검사 요약", downstreamUnavailable ? "UNKNOWN" : "TAKEN"),
  ];

  return deepFreeze({
    schemaVersion: PRESS_RAG_WORKFLOW_SCHEMA_VERSION,
    recordedRunIndex: outcome.runIndex,
    nodes,
    edges,
    initiallySelectedNodeId: "request-intake",
  }) as PressRagWorkflowView;
}
