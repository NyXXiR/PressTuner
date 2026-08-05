import type {
  PressRagDemoViewModel,
  PressRagRecordedOutcome,
} from "@/domain/evaluation/pressRagDemoPresenter";
import type {
  PressRagWorkflowNodeId,
  PressRagWorkflowView,
} from "@/domain/evaluation/pressRagWorkflowView";

export const PRESS_RAG_GUARDRAIL_VIEW_VERSION = "press-rag-guardrail-view/v1" as const;

/**
 * The five guardrails the recorded workflow is held to. They are the same five surfaced in
 * the execution summary, so a reader sees one vocabulary across the whole debugger.
 */
export const PRESS_RAG_GUARDRAIL_IDS = [
  "evidence-use",
  "citation-claim-verification",
  "forbidden-source-protection",
  "expected-tool-behavior",
  "safe-fallback",
] as const;

export type PressRagGuardrailId = (typeof PRESS_RAG_GUARDRAIL_IDS)[number];

export type PressRagGuardrailVerdict = "PASS" | "VIOLATION" | "NOT_EVALUABLE" | "NOT_APPLICABLE";

export type PressRagGuardrailResult = Readonly<{
  guardrailId: PressRagGuardrailId;
  label: string;
  rule: string;
  verdict: PressRagGuardrailVerdict;
  /** For a node this is the expected outcome; for an edge it is the transition condition. */
  expected: string;
  observed: string;
  reason: string;
  /** True when this guardrail is the condition gating the selected edge. */
  gate: boolean;
}>;

export type PressRagGuardrailProjection = Readonly<{
  schemaVersion: typeof PRESS_RAG_GUARDRAIL_VIEW_VERSION;
  byNode: Readonly<Record<string, readonly PressRagGuardrailResult[]>>;
  byEdge: Readonly<Record<string, readonly PressRagGuardrailResult[]>>;
}>;

type Expectation = PressRagDemoViewModel["scenarios"][number]["expectation"];
type CheckStatus = PressRagRecordedOutcome["checks"][keyof PressRagRecordedOutcome["checks"]];

const GUARDRAILS: Readonly<Record<PressRagGuardrailId, { label: string; rule: string }>> = {
  "evidence-use": {
    label: "근거 검색 및 사용",
    rule: "기대 문서가 검색 결과에 포함되고 답변 근거로 실제 사용되었는가",
  },
  "citation-claim-verification": {
    label: "인용 및 주장 검증",
    rule: "모든 주장이 인용된 근거 좌표로 뒷받침되는가",
  },
  "forbidden-source-protection": {
    label: "금지 출처 보호",
    rule: "금지된 출처가 인용 어디에도 등장하지 않았는가",
  },
  "expected-tool-behavior": {
    label: "기대 도구 동작",
    rule: "기대한 도구만, 기대한 순서로 호출되었는가",
  },
  "safe-fallback": {
    label: "안전 대체",
    rule: "근거가 부족할 때 유보하거나 안전 경로로 대체했는가",
  },
};

/** Which edge each guardrail gates, keyed by the edge's recorded decision label. */
const EDGE_GATE: Readonly<Record<string, PressRagGuardrailId>> = {
  "기록 재생": "evidence-use",
  "검색 근거 평가": "evidence-use",
  "응답 분기 선택": "safe-fallback",
  "주장 검증 여부": "citation-claim-verification",
  "안전 대체 여부": "safe-fallback",
  "독립 평가": "citation-claim-verification",
};

function verdictFromCheck(status: CheckStatus): PressRagGuardrailVerdict {
  if (status === "MATCH") return "PASS";
  if (status === "MISMATCH") return "VIOLATION";
  return "NOT_EVALUABLE";
}

function result(
  guardrailId: PressRagGuardrailId,
  verdict: PressRagGuardrailVerdict,
  expected: string,
  observed: string,
  reason: string,
  gate = false,
): PressRagGuardrailResult {
  const { label, rule } = GUARDRAILS[guardrailId];
  return { guardrailId, label, rule, verdict, expected, observed, reason, gate };
}

function notApplicable(guardrailId: PressRagGuardrailId, reason: string): PressRagGuardrailResult {
  return result(guardrailId, "NOT_APPLICABLE", "—", "—", reason);
}

/** Fills the lanes this stage does not evaluate, so all five always render in a fixed order. */
function lanes(
  evaluated: Partial<Record<PressRagGuardrailId, PressRagGuardrailResult>>,
  fallbackReason: string,
): readonly PressRagGuardrailResult[] {
  return PRESS_RAG_GUARDRAIL_IDS.map(
    (id) => evaluated[id] ?? notApplicable(id, fallbackReason),
  );
}

function retrievalObserved(outcome: PressRagRecordedOutcome, expectation: Expectation) {
  const expectedIds = new Set(expectation.expectedDocuments.map(({ logicalId }) => logicalId));
  const hit = outcome.retrieval.find((row) => expectedIds.has(row.logicalDocumentId));
  const count = `검색 ${outcome.retrieval.length}개`;
  if (!expectedIds.size) return `${count} · 기대 문서 지정 없음`;
  return hit
    ? `${count} · 기대 문서 ${hit.logicalDocumentId} ${hit.rank}순위`
    : `${count} · 기대 문서 미검출`;
}

function toolObserved(outcome: PressRagRecordedOutcome) {
  if (!outcome.tools.length) return "공개된 도구 단계 없음";
  return outcome.tools.map((tool) => `${tool.toolName}(${tool.status})`).join(" → ");
}

function citationObserved(outcome: PressRagRecordedOutcome) {
  const unexpected = outcome.citations.filter((citation) => !citation.expected).length;
  return `인용 ${outcome.citations.length}건${unexpected ? ` · 기대 외 ${unexpected}건` : ""}`;
}

function verificationObserved(outcome: PressRagRecordedOutcome) {
  const { mode, status, supportedClaims, totalClaims } = outcome.verification;
  return `모드 ${mode ?? "기록 없음"} · ${status ?? "판정 없음"} · 지원 주장 ${supportedClaims}/${totalClaims}`;
}

function answerabilityObserved(outcome: PressRagRecordedOutcome) {
  if (outcome.cannotAnswer === null) return "답변 가능성 판정 미기록";
  return outcome.cannotAnswer ? "유보로 기록됨" : "답변으로 기록됨";
}

function fallbackObserved(outcome: PressRagRecordedOutcome) {
  return outcome.fallback.mode
    ? `대체 모드 ${outcome.fallback.mode}${outcome.fallback.reason ? ` · ${outcome.fallback.reason}` : ""}`
    : "사용 안 함";
}

function nodeLanes(
  nodeId: PressRagWorkflowNodeId,
  outcome: PressRagRecordedOutcome,
  expectation: Expectation,
): readonly PressRagGuardrailResult[] {
  const { checks } = outcome;

  switch (nodeId) {
    case "request-intake":
      return lanes({}, "요청 식별 단계에서는 아직 판정할 실행 기록이 없습니다.");

    case "retrieval-execution":
      return lanes({
        "evidence-use": result(
          "evidence-use",
          verdictFromCheck(checks.retrieval),
          `기대 문서 ${expectation.expectedDocuments.length}건이 검색 결과에 포함`,
          retrievalObserved(outcome, expectation),
          `checks.retrieval = ${checks.retrieval}`,
        ),
        "expected-tool-behavior": result(
          "expected-tool-behavior",
          verdictFromCheck(checks.expectedTools),
          expectation.expectedTools.length ? expectation.expectedTools.join(" → ") : "추가 도구 호출 없음",
          toolObserved(outcome),
          `checks.expectedTools = ${checks.expectedTools}`,
        ),
      }, "이 단계에서는 검사하지 않습니다. 인용이 생성된 뒤 평가합니다.");

    case "evidence-decision":
      return lanes({
        "evidence-use": result(
          "evidence-use",
          verdictFromCheck(checks.answerability),
          `답변 가능성 ${expectation.answerability}`,
          answerabilityObserved(outcome),
          `checks.answerability = ${checks.answerability}`,
        ),
        "safe-fallback": result(
          "safe-fallback",
          verdictFromCheck(checks.answerability),
          "근거가 부족하면 유보를 선택",
          answerabilityObserved(outcome),
          "유보 판단은 답변 가능성 판정과 같은 기록에서 나옵니다.",
        ),
      }, "이 단계에서는 검사하지 않습니다.");

    case "response-behavior":
      return lanes({
        "citation-claim-verification": result(
          "citation-claim-verification",
          verdictFromCheck(checks.citations),
          expectation.requiresClaimEvidence ? "주장마다 인용 근거 1건 이상" : "기대 출처만 인용",
          citationObserved(outcome),
          `checks.citations = ${checks.citations}`,
        ),
        "forbidden-source-protection": result(
          "forbidden-source-protection",
          verdictFromCheck(checks.forbiddenSources),
          "금지 출처 인용 0건",
          citationObserved(outcome),
          `checks.forbiddenSources = ${checks.forbiddenSources}`,
        ),
      }, "이 단계에서는 검사하지 않습니다.");

    case "verification":
      return lanes({
        "citation-claim-verification": result(
          "citation-claim-verification",
          verdictFromCheck(checks.verification),
          expectation.requiresClaimEvidence ? "검증 실행 + 주장 전부 지원" : "검증 결과 기록",
          verificationObserved(outcome),
          `checks.verification = ${checks.verification}`,
        ),
        // Not entering the fallback path satisfies this guardrail when verification passed:
        // the rule is "fall back when evidence is short", not "always fall back".
        "safe-fallback": result(
          "safe-fallback",
          checks.verification === "MATCH" ? "PASS" : "NOT_EVALUABLE",
          "검증 실패 시에만 안전 대체로 전환",
          fallbackObserved(outcome),
          checks.verification === "MATCH"
            ? "검증을 통과해 대체가 필요하지 않았고, 실제로 진입하지 않았습니다."
            : "검증 결과가 없어 대체가 필요했는지 판단할 수 없습니다.",
        ),
      }, "이 단계에서는 검사하지 않습니다.");

    case "fallback":
      return lanes({
        "safe-fallback": result(
          "safe-fallback",
          outcome.fallback.mode ? "PASS" : "NOT_EVALUABLE",
          "필요할 때만 안전 경로로 진입",
          fallbackObserved(outcome),
          outcome.fallback.mode
            ? "안전 대체가 기록되었습니다."
            : "대체가 실행되지 않아 필요 여부를 판단할 수 없습니다.",
        ),
      }, "대체 경로에 진입하지 않아 검사 대상이 아닙니다.");

    case "terminal-evaluation":
      return lanes({
        "evidence-use": result(
          "evidence-use",
          verdictFromCheck(checks.retrieval),
          "MATCH",
          `checks.retrieval = ${checks.retrieval}`,
          "독립 기대값 검사 결과입니다.",
        ),
        "citation-claim-verification": result(
          "citation-claim-verification",
          verdictFromCheck(
            checks.citations === "MISMATCH" || checks.verification === "MISMATCH"
              ? "MISMATCH"
              : checks.citations === "MATCH" && checks.verification === "MATCH"
                ? "MATCH"
                : "NOT_EVALUABLE",
          ),
          "MATCH",
          `checks.citations = ${checks.citations} · checks.verification = ${checks.verification}`,
          "인용과 주장 검증 중 하나라도 어긋나면 위반으로 계산합니다.",
        ),
        "forbidden-source-protection": result(
          "forbidden-source-protection",
          verdictFromCheck(checks.forbiddenSources),
          "MATCH",
          `checks.forbiddenSources = ${checks.forbiddenSources}`,
          "독립 기대값 검사 결과입니다.",
        ),
        "expected-tool-behavior": result(
          "expected-tool-behavior",
          verdictFromCheck(checks.expectedTools),
          "MATCH",
          `checks.expectedTools = ${checks.expectedTools}`,
          "독립 기대값 검사 결과입니다.",
        ),
        // Safe fallback has no independent expected-value check, so it only reports here
        // when the run actually took the fallback path.
        "safe-fallback": outcome.fallback.mode
          ? result(
              "safe-fallback",
              "PASS",
              "필요할 때만 진입",
              fallbackObserved(outcome),
              "안전 대체가 기록되었습니다.",
            )
          : notApplicable("safe-fallback", "대체가 실행되지 않아 독립 기대값 검사 대상이 아닙니다."),
      }, "이 단계에서는 검사하지 않습니다.");

    default:
      return lanes({}, "검사 대상이 아닙니다.");
  }
}

function edgeLanes(
  decisionLabel: string,
  state: "TAKEN" | "NOT_TAKEN" | "UNKNOWN",
  sourceLabel: string,
  targetLabel: string,
  nodeResults: readonly PressRagGuardrailResult[],
): readonly PressRagGuardrailResult[] {
  const gateId = EDGE_GATE[decisionLabel];
  const notGate = `이 전이의 판정 조건이 아닙니다. 조건은 "${decisionLabel}"입니다.`;

  return PRESS_RAG_GUARDRAIL_IDS.map((id) => {
    if (id !== gateId) return notApplicable(id, notGate);

    // The gate reuses the source stage's verdict for the same guardrail: the edge is taken
    // because that guardrail resolved, so an unresolved guardrail explains an untaken edge.
    const source = nodeResults.find((entry) => entry.guardrailId === id);
    const verdict: PressRagGuardrailVerdict = state === "TAKEN"
      ? "PASS"
      : source && source.verdict === "VIOLATION"
        ? "VIOLATION"
        : "NOT_EVALUABLE";

    return result(
      id,
      verdict,
      `${decisionLabel} — ${sourceLabel}에서 ${targetLabel}로 넘어갈 조건`,
      `${state}${source ? ` · 출발 상태 판정 ${source.verdict}` : ""}`,
      state === "TAKEN"
        ? "조건이 성립해 이 전이를 통과했습니다."
        : source?.verdict === "VIOLATION"
          ? `${sourceLabel}에서 이 가드레일이 위반돼 전이가 성립하지 않았습니다.`
          : `${sourceLabel}의 판정 기록이 없어 전이 여부를 확인할 수 없습니다.`,
      true,
    );
  });
}

export function projectPressRagGuardrails(
  outcome: PressRagRecordedOutcome,
  expectation: Expectation,
  workflow: PressRagWorkflowView,
): PressRagGuardrailProjection {
  const byNode: Record<string, readonly PressRagGuardrailResult[]> = {};
  for (const node of workflow.nodes) {
    byNode[node.id] = nodeLanes(node.id, outcome, expectation);
  }

  const labelById = new Map(workflow.nodes.map((node) => [node.id, node.label]));
  const byEdge: Record<string, readonly PressRagGuardrailResult[]> = {};
  for (const edge of workflow.edges) {
    byEdge[edge.id] = edgeLanes(
      edge.decisionLabel,
      edge.state,
      labelById.get(edge.source) ?? edge.source,
      labelById.get(edge.target) ?? edge.target,
      byNode[edge.source] ?? [],
    );
  }

  return { schemaVersion: PRESS_RAG_GUARDRAIL_VIEW_VERSION, byNode, byEdge };
}

/** Rolls a stage's five lanes into the single chip shown on the graph node. */
export function rollUpGuardrails(
  results: readonly PressRagGuardrailResult[],
): PressRagGuardrailVerdict {
  if (results.some((entry) => entry.verdict === "VIOLATION")) return "VIOLATION";
  if (results.some((entry) => entry.verdict === "NOT_EVALUABLE")) return "NOT_EVALUABLE";
  if (results.some((entry) => entry.verdict === "PASS")) return "PASS";
  return "NOT_APPLICABLE";
}
