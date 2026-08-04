export type InterviewAnswerSheetInput = Readonly<{
  catalogText: string;
  matrixText: string;
  runtimeIdentity: Readonly<{
    contentHash: string;
    identity: Readonly<{
      chunking: { version: string };
      retrieval: { version: string };
      verifier: { version: string };
    }>;
  }>;
  dataset: Readonly<{
    version?: string;
    status?: string;
    contentHash?: string;
    cases?: readonly unknown[];
    approval?: {
      reviewer?: string | null;
      reviewerId?: string | null;
      reviewerType?: string | null;
      reviewedAt?: string | null;
      approvedAt?: string | null;
    } | null;
  }>;
  liveComparison?: unknown;
}>;

const DOMAIN_ANSWERS: Record<string, string> = {
  A: "면접 질문의 brieFFlow는 이 저장소의 PressTuner RAG 경로를 가리킵니다. 실제 흐름은 문서 업로드, scheduler 파싱·청킹·임베딩, pgvector/FTS 저장, team·role 범위 hybrid RRF 검색, evidence policy, Agent 생성, 인용 저장, claim/span 검증, 승인 기반 쓰기입니다. 라이브러리는 unpdf·Prisma·PostgreSQL·OpenAI Agents SDK를 사용하고, tenancy·세대 전환·검색 trace·유보·검증·평가 gate는 애플리케이션 코드로 구현했습니다.",
  B: "PDF는 unpdf 결과를 ParsedBlock IR로 바꾸고 locator와 source lineage를 보존합니다. 반복 margin·표 머리글을 제거하고 OCR 필요 신호를 diagnostic으로 남깁니다. 기본 production 호환 모드는 page-char-v1(1,400자/200자 overlap)이고, 명시적 ROLE_AWARE_CANDIDATE에서 FACT·CAREER·STYLE 계열 profile을 persisted classificationOverride로 선택합니다. 재업로드는 generation 단위로 원자 전환하며 checksum·fingerprint로 중복과 재색인을 통제합니다.",
  C: "임베딩은 text-embedding-3-small, 저장소는 tenant-scoped PostgreSQL pgvector이며 cosine distance를 사용합니다. lexical FTS와 vector 결과를 equal-weight RRF(k=60)로 결합하고 기본 top-k는 8입니다. 모든 SQL 경로에 teamId·active generation·role 조건을 적용하고 normalized dedupe, document cap, token budget packing, exclusion trace를 남깁니다. baseline은 deterministic normalization/NONE이고, rewrite·listwise reranker ablation과 role-aware candidate는 서로 다른 실행 가능한 runtime identity로 고정했습니다.",
  D: "controlled-live 계약은 실제 PDF 32개를 복사·SHA-256 검증한 40 case v4, development/regression/adversarial/holdout 분할, required/forbidden facts와 answerability·conflict annotation으로 구성했습니다. dataset author와 human approval actor를 분리했고 human provenance가 없으면 모델 호출 전에 실패합니다. 일반 Agent 답변도 atomic claim과 exact quote evidence를 내며, 30개 blinded human label·class balance·agreement·false-supported gate가 통과하지 않으면 groundedness를 NOT_EVALUABLE로 둡니다.",
  E: "retrieval trace에서 eligible evidence가 없으면 ABSTAIN, 상충 numeric/lineage evidence면 CONFLICT, sufficiency 조건을 충족할 때만 ANSWER를 결정합니다. source ID 존재만 근거로 인정하지 않고 선택·제외 이유와 typed reason을 저장합니다. Agent instruction은 EVIDENCE_SUFFICIENT가 아니면 답변이나 초안을 생성하지 않게 하며, 최신 문서 우선은 명시적 lineage가 있을 때만 적용하고 임의 추정은 하지 않습니다.",
  F: "인용은 persisted chunk의 원문 excerpt·page range·sourceId와 연결합니다. claim-span-verifier-v1은 quote의 exact character span, claim token/숫자 coverage, title/body의 모든 atomic sentence coverage, 상충 numeric evidence를 검사합니다. PASS인 경우에만 verified hash를 설정하므로 자연스러움보다 원문 일치와 검증 가능성을 우선합니다.",
  G: "실패는 taxonomy와 evaluation artifact로 보존하고 고정 dataset의 baseline/candidate를 서로 다른 tenant·executionId·configuration hash로 독립 실행합니다. Agent case는 최소 3회 반복해야 하고 mean·worst·spread·passCount를 기록합니다. human label과 judge의 calibration label 수·agreement gate가 부족하면 judge metric은 publish할 수 없습니다. regression gate와 immutable configuration identity로 prompt/model/index 변경을 추적합니다.",
  H: "AgentRun·AgentStep에 input/output/cached token, estimated cost, run/step latency와 failure category를 기록합니다. controlled-live report는 query embedding, combined hybrid SQL, dedupe, reranking, context packing, Agent/tool/verifier와 indexing stage 표본을 분리해 p50/p95를 계산하며 vector·lexical·fusion을 하나의 SQL 경계보다 잘게 주장하지 않습니다. dry-run은 현재 가격표와 token ceiling으로 예상·hard-cap 비용을 mutation 전에 계산합니다. controlled-live 수치는 production 사용자 트래픽과 구분해 표시합니다.",
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function evaluateInterviewPromotion(input: Pick<
  InterviewAnswerSheetInput,
  "dataset" | "liveComparison"
>) {
  const reasons: string[] = [];
  if (
    input.dataset.status !== "APPROVED" ||
    input.dataset.approval?.reviewerType !== "HUMAN" ||
    !(input.dataset.approval.reviewerId ?? input.dataset.approval.reviewer)?.trim()
  ) reasons.push("APPROVED_HUMAN_DATASET_REQUIRED");
  const cycle = record(input.liveComparison);
  if (!cycle || cycle.version !== "press-rag-controlled-live-cycle/v1" || cycle.evidenceClass !== "CONTROLLED_LIVE") {
    reasons.push("CONTROLLED_LIVE_CYCLE_REQUIRED");
    return { eligible: false, reasons } as const;
  }
  if (!input.dataset.contentHash || cycle.datasetHash !== input.dataset.contentHash) reasons.push("DATASET_HASH_MISMATCH");
  const comparison = record(cycle.comparison);
  const baseline = record(comparison?.baseline);
  const candidate = record(comparison?.candidate);
  if (
    !baseline || !candidate ||
    typeof baseline.executionId !== "string" ||
    baseline.executionId === candidate.executionId ||
    typeof baseline.configurationHash !== "string" ||
    baseline.configurationHash === candidate.configurationHash
  ) reasons.push("INDEPENDENT_EXECUTIONS_REQUIRED");
  const calibration = record(cycle.calibration);
  if (calibration?.status !== "PASS") reasons.push("PASSING_CALIBRATION_REQUIRED");
  if (
    !record(baseline?.stageLatency) || Object.keys(record(baseline?.stageLatency)!).length === 0 ||
    !record(candidate?.stageLatency) || Object.keys(record(candidate?.stageLatency)!).length === 0
  ) reasons.push("MEASURED_STAGE_EVIDENCE_REQUIRED");
  if (
    typeof baseline?.totalCostMicros !== "number" ||
    typeof candidate?.totalCostMicros !== "number" ||
    !record(baseline?.componentCostMicros) ||
    !record(candidate?.componentCostMicros) ||
    typeof record(baseline?.componentCostMicros)?.queryEmbedding !== "number" ||
    typeof record(baseline?.componentCostMicros)?.agent !== "number" ||
    typeof record(candidate?.componentCostMicros)?.queryEmbedding !== "number" ||
    typeof record(candidate?.componentCostMicros)?.queryRewrite !== "number" ||
    typeof record(candidate?.componentCostMicros)?.reranking !== "number" ||
    typeof record(candidate?.componentCostMicros)?.agent !== "number" ||
    typeof calibration?.totalCostMicros !== "number"
  ) reasons.push("MEASURED_COST_EVIDENCE_REQUIRED");
  const gate = record(cycle.regressionGate);
  if (gate?.disposition !== "PROMOTE") reasons.push("PASSING_REGRESSION_GATE_REQUIRED");
  const caseStudy = record(cycle.caseStudy);
  if (
    caseStudy?.valid !== true ||
    caseStudy.evidenceClass !== "CONTROLLED_LIVE" ||
    caseStudy.datasetHash !== input.dataset.contentHash
  ) reasons.push("VALID_CONTROLLED_LIVE_CASE_STUDY_REQUIRED");
  if (cycle.deploymentAuthorized !== false) reasons.push("DEPLOYMENT_AUTHORIZATION_MUST_REMAIN_FALSE");
  return { eligible: reasons.length === 0, reasons } as const;
}

function parseCatalog(text: string) {
  const detailed = [...text.matchAll(/^- `([A-H]\d{2})` (.+)$/gm)].map(
    ([, id, question]) => ({ id, question }),
  );
  const priority = [...text.matchAll(/^- `(P\d{2})` (.+)$/gm)].map(
    ([, id, question]) => ({ id, question }),
  );
  return { detailed, priority };
}

function matrixEntry(matrixText: string, id: string) {
  const expression = new RegExp(
    "^- \\[(implemented|partial|missing)\\] `" +
      id +
      "` — [^\\n]+\\n([\\s\\S]*?)(?=\\n- \\[(?:implemented|partial|missing)\\] `[A-H]\\d{2}`|\\n## Priority)",
    "m",
  );
  const match = matrixText.match(expression);
  if (!match) throw new Error(`INTERVIEW_MATRIX_ENTRY_MISSING:${id}`);
  const field = (name: string) =>
    match[2].match(new RegExp(`^  - ${name}: (.+)$`, "m"))?.[1] ?? "missing";
  return {
    status: match[1],
    evidence: field("Evidence"),
    code: field("Code"),
    tests: field("Tests"),
    artifacts: field("Artifacts"),
    gap: field("Gap"),
  };
}

export function buildInterviewAnswerSheet(input: InterviewAnswerSheetInput) {
  const catalog = parseCatalog(input.catalogText);
  if (catalog.detailed.length !== 70) {
    throw new Error(`INTERVIEW_DETAILED_COUNT_MISMATCH:${catalog.detailed.length}`);
  }
  if (catalog.priority.length !== 10) {
    throw new Error(`INTERVIEW_PRIORITY_COUNT_MISMATCH:${catalog.priority.length}`);
  }
  const promotion = evaluateInterviewPromotion(input);
  const hasLiveComparison = promotion.eligible;
  const controlledCycle = record(input.liveComparison);
  const hasControlledLiveEvidence = controlledCycle?.version === "press-rag-controlled-live-cycle/v1";
  const comparison = record(controlledCycle?.comparison);
  const baseline = record(comparison?.baseline);
  const candidate = record(comparison?.candidate);
  const caseStudy = record(controlledCycle?.caseStudy);
  const measuredSummary = hasControlledLiveEvidence
    ? `실측 baseline→candidate: Recall@5 ${baseline?.retrievalRecallAt5 ?? "N/A"}→${candidate?.retrievalRecallAt5 ?? "N/A"}, answerability ${baseline?.answerabilityAccuracy ?? "N/A"}→${candidate?.answerabilityAccuracy ?? "N/A"}, Agent completion ${baseline?.agentCompletionRate ?? "N/A"}→${candidate?.agentCompletionRate ?? "N/A"}, P95 ${baseline?.p95LatencyMs ?? "N/A"}ms→${candidate?.p95LatencyMs ?? "N/A"}ms, 비용 ${baseline?.totalCostMicros ?? "N/A"}→${candidate?.totalCostMicros ?? "N/A"} micro-USD.`
    : "";
  const lines = [
    "PressTuner RAG INTERVIEW ANSWER",
    "================================",
    `EVIDENCE_STATUS: ${hasLiveComparison ? "LIVE_COMPARISON_ATTACHED" : hasControlledLiveEvidence ? "CONTROLLED_LIVE_NOT_PROMOTED" : "NOT_INTERVIEW_FINAL"}`,
    `RUNTIME_CONFIGURATION_HASH: ${input.runtimeIdentity.contentHash}`,
    `CHUNKING_IDENTITY: ${input.runtimeIdentity.identity.chunking.version}`,
    `RETRIEVAL_IDENTITY: ${input.runtimeIdentity.identity.retrieval.version}`,
    `VERIFIER_IDENTITY: ${input.runtimeIdentity.identity.verifier.version}`,
    `DATASET_VERSION: ${input.dataset.version ?? "UNKNOWN"}`,
    `DATASET_STATUS: ${input.dataset.status ?? "UNKNOWN"}`,
    `DATASET_CASE_COUNT: ${input.dataset.cases?.length ?? 0}`,
    `HUMAN_REVIEWER: ${input.dataset.approval?.reviewerId ?? input.dataset.approval?.reviewer ?? "MISSING"}`,
    `PROMOTION_BLOCKERS: ${promotion.reasons.join(",") || "NONE"}`,
    "",
    hasControlledLiveEvidence
      ? "중요: 아래 수치는 승인된 controlled-live 평가이며 production 사용자 트래픽 수치가 아닙니다. 회귀 gate가 거부한 후보는 배포하지 않았습니다."
      : "중요: live comparison artifact가 없으면 이 문서의 구현 설명은 코드·테스트 근거이고, 품질 개선률·운영 지연·운영 비용 실측이 아닙니다.",
    "",
    "[DETAILED QUESTIONS — 70]",
    "",
  ];

  for (const entry of catalog.detailed) {
    const evidence = matrixEntry(input.matrixText, entry.id);
    lines.push(
      `[${entry.id}] ${entry.question}`,
      `상태: ${evidence.status}`,
      `답변: ${DOMAIN_ANSWERS[entry.id[0]]}${hasControlledLiveEvidence && ["D", "G", "H"].includes(entry.id[0]) ? ` ${measuredSummary}` : ""}`,
      `근거 코드: ${evidence.code}`,
      `근거 테스트: ${evidence.tests}`,
      `근거 artifact: ${evidence.artifacts}`,
      `남은 gap: ${evidence.gap}`,
      "",
    );
  }

  lines.push("[PRIORITY CONCISE ANSWERS — 10]", "");
  for (const entry of catalog.priority) {
    const reference = entry.question.match(/`([A-H]\d{2})`/)?.[1];
    const domain = reference?.[0] ?? "A";
    lines.push(
      `[${entry.id}] ${entry.question}`,
      `답변: ${DOMAIN_ANSWERS[domain]}${hasControlledLiveEvidence && ["D", "G", "H"].includes(domain) ? ` ${measuredSummary}` : ""}`,
      "",
    );
  }

  lines.push(
    "[REPRESENTATIVE FAILURE → IMPROVEMENT CASE]",
    "",
    hasControlledLiveEvidence
      ? `CONTROLLED_LIVE_COMPARISON: ${measuredSummary}`
      : "NOT_EXECUTED: DRAFT v4에는 human reviewer/approval provenance가 없어 controlled-live executor가 모델 호출 전에 차단합니다.",
    hasControlledLiveEvidence
      ? `실패: ${caseStudy?.failure ?? "CASE_STUDY_MISSING"}`
      : "확인된 구현상 실패: 모든 문서에 하나의 chunk profile을 적용하면 이력서·사실·스타일 문서 구조 차이가 runtime identity에 드러나지 않았습니다.",
    hasControlledLiveEvidence
      ? `가설: ${caseStudy?.hypothesis ?? "CASE_STUDY_MISSING"}`
      : "원인: scheduler가 module-level env profile 하나를 모든 문서에 재사용했습니다.",
    hasControlledLiveEvidence
      ? `변경: ${caseStudy?.change ?? "CASE_STUDY_MISSING"}`
      : "변경: 기본 page-char-v1은 유지하고 명시적 ROLE_AWARE_CANDIDATE에서 persisted classificationOverride별 semantic profile을 선택하도록 변경했습니다.",
    hasControlledLiveEvidence
      ? `독립 비교: ${caseStudy?.independentComparison ?? "CASE_STUDY_MISSING"}`
      : "회귀 보호: domain resolver test, worker source-contract test, main upload DB test, configuration identity test를 추가했습니다.",
    hasControlledLiveEvidence
      ? `트레이드오프: ${caseStudy?.tradeoffs ?? "CASE_STUDY_MISSING"}`
      : "전후 수치: 아직 없음. human approval, 독립 baseline/candidate 실행, 최소 3회 Agent 반복, judge calibration 전에는 개선 수치를 주장하지 않습니다.",
    hasControlledLiveEvidence
      ? `게이트 결과: ${caseStudy?.gateResult ?? "CASE_STUDY_MISSING"}`
      : "배포 판단: controlled-live 근거가 생기기 전에는 후보를 승격하지 않습니다.",
    "",
  );
  return `${lines.join("\n")}\n`;
}

export function validateInterviewAnswerSheet(text: string) {
  const detailedIds = [...text.matchAll(/^\[([A-H]\d{2})\] /gm)].map((match) => match[1]);
  const priorityIds = [...text.matchAll(/^\[(P\d{2})\] /gm)].map((match) => match[1]);
  if (detailedIds.length !== 70 || new Set(detailedIds).size !== 70) {
    throw new Error("INTERVIEW_DETAILED_QUESTION_COVERAGE_INVALID");
  }
  if (priorityIds.length !== 10 || new Set(priorityIds).size !== 10) {
    throw new Error("INTERVIEW_PRIORITY_QUESTION_COVERAGE_INVALID");
  }
  if (!text.includes("RUNTIME_CONFIGURATION_HASH:")) {
    throw new Error("INTERVIEW_RUNTIME_HASH_MISSING");
  }
  if (text.includes("EVIDENCE_STATUS: NOT_INTERVIEW_FINAL") && !text.includes("NOT_EXECUTED:")) {
    throw new Error("INTERVIEW_UNEXECUTED_EVIDENCE_DISCLOSURE_MISSING");
  }
  return { detailedQuestionCount: 70, priorityQuestionCount: 10 } as const;
}
