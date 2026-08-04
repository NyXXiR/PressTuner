const IMPLEMENTED_IDS = new Set([
  "A01",
  "A02",
  "A03",
  "B01",
  "B03",
  "B04",
  "B05",
  "B06",
  "B07",
  "B08",
  "C01",
  "C02",
  "C03",
  "C04",
  "C06",
  "C07",
  "C08",
  "C09",
  "C10",
  "C11",
  "D01",
  "D02",
  "D03",
  "D04",
  "D05",
  "D06",
  "D07",
  "D08",
  "D09",
  "D10",
  "D11",
  "D12",
  "D13",
  "D15",
  "E01",
  "E02",
  "E03",
  "E04",
  "E05",
  "E06",
  "F01",
  "F02",
  "F03",
  "F04",
  "F05",
  "F06",
  "F07",
  "F08",
  "G01",
  "G02",
  "G03",
  "G04",
  "G05",
  "G06",
  "G07",
  "G08",
  "H01",
  "H02",
  "H03",
  "H04",
  "H07",
  "H08",
]);

const MISSING_IDS = new Set(["D14", "E07"]);

const DOMAIN_PROFILES = {
  A: {
    title: "전체 구조 및 구현 범위",
    evidence: "E-ARCH",
    code: "lib/services/press-agent/pressAgentRuntime.ts; domain/press-agent/runPolicy.ts",
    tests: "lib/services/press-agent/pressAgentRuntime.test.ts; domain/press-agent/runPolicy.test.ts",
    artifacts: "docs/press-rag-agent.md",
    target: "Phase 1-2 runtime/evaluation contracts",
    partialGap: "전체 parser-to-verifier 경로의 독립 실행 증거가 아직 부족함",
  },
  B: {
    title: "문서 처리와 청크 설계",
    evidence: "E-INGESTION",
    code: "../PressTuner-scheduler/src/workers/knowledgeHandler.ts; ../PressTuner-scheduler/src/domain/knowledgeParsing.ts; lib/services/knowledge/knowledgeDocumentService.ts",
    tests: "../PressTuner-scheduler/src/domain/knowledgeParsing.test.ts; ../PressTuner-scheduler/src/workers/knowledgeHandler.test.ts; lib/services/knowledge/knowledgeDocumentService.test.ts",
    artifacts: "evals/press-rag/controlled-live/corpus-v4-draft; runtime configuration identity",
    target: "Phase 2-5 ingestion/chunking",
    partialGap: "이미지 자체 OCR 실행과 복잡한 다단 레이아웃의 live 품질 실측은 부족함",
  },
  C: {
    title: "임베딩과 벡터 검색",
    evidence: "E-RETRIEVAL",
    code: "lib/services/knowledge/knowledgeRetrievalService.ts; domain/knowledge/retrievalPipeline.ts; domain/evaluation/pressRagRuntimeIdentity.ts",
    tests: "lib/services/knowledge/knowledgeRetrievalService.test.ts; domain/knowledge/retrievalPipeline.test.ts; domain/evaluation/pressRagRuntimeIdentity.test.ts",
    artifacts: "evals/press-rag/controlled-live/configurations/*.json; evals/press-rag/controlled-live/results/*.json",
    target: "Phase 2-6 retrieval experiments",
    partialGap: "approved corpus의 rewrite/reranker ablation과 식별자 검색 실측은 완료했으나 similarity threshold calibration은 별도 과제임",
  },
  D: {
    title: "평가 데이터와 지표",
    evidence: "E-EVAL",
    code: "domain/evaluation/controlledLiveEvaluation.ts; domain/evaluation/controlledLiveReport.ts; domain/evaluation/ragMetrics.ts",
    tests: "domain/evaluation/controlledLiveEvaluation.test.ts; domain/evaluation/controlledLiveReport.test.ts; scripts/generateControlledLiveDatasetDraft.test.ts",
    artifacts: "evals/press-rag/controlled-live/dataset-v4.approved.json (40 human-reviewed cases); controlled-live result artifacts",
    target: "Phase 5-6 controlled-live evaluation",
    partialGap: "40-case human review, 독립 반복 실행, 30-label Judge calibration을 완료했으며 실제 사용자 질문 대표성 검증은 별도 과제임",
  },
  E: {
    title: "답변 유보와 문서 충돌",
    evidence: "E-ABSTENTION",
    code: "domain/knowledge/evidencePolicy.ts; domain/press-agent/instructions.ts; lib/services/press-agent/pressAgentRuntime.ts",
    tests: "domain/knowledge/evidencePolicy.test.ts; domain/press-agent/instructions.test.ts; lib/services/press-agent/pressAgentRuntime.test.ts",
    artifacts: "approved controlled-live abstention/conflict executions and regression gate",
    target: "Phase 3-6 abstention/conflict calibration",
    partialGap: "approved live data의 abstention usability threshold calibration이 부족함",
  },
  F: {
    title: "인용과 생성 결과 검증",
    evidence: "E-CITATION",
    code: "domain/press-agent/claimSpanVerification.ts; lib/services/knowledge/agentKnowledgeCitationService.ts; lib/services/press-agent/pressAgentRuntime.ts",
    tests: "domain/press-agent/claimSpanVerification.test.ts; lib/services/knowledge/agentKnowledgeCitationService.test.ts; lib/services/press-agent/pressAgentRuntime.test.ts",
    artifacts: "claim-span-verifier-v5-extractive-recovery runtime identity and controlled-live fallback/recovery traces",
    target: "Phase 4 exact-span and claim verification",
    partialGap: "exact quote 검증, 안전 fallback, 30-label human-calibrated Judge를 controlled-live로 실측함",
  },
  G: {
    title: "회귀 평가와 개선 과정",
    evidence: "E-EXPERIMENT",
    code: "domain/evaluation/controlledLiveEvaluation.ts; domain/evaluation/controlledLiveReport.ts; domain/evaluation/regressionGate.ts; domain/evaluation/feedbackRegressionSignals.ts",
    tests: "domain/evaluation/controlledLiveEvaluation.test.ts; domain/evaluation/controlledLiveReport.test.ts; domain/evaluation/regressionGate.test.ts; domain/evaluation/feedbackRegressionSignals.test.ts",
    artifacts: "independent controlled-live baseline/candidate artifacts; deterministic artifacts remain labeled synthetic",
    target: "Phase 6-8 feedback/regression loop",
    partialGap: "approved live 반복과 회귀 gate가 실패 후보의 승격을 차단했으며 production promotion/rollback은 수행하지 않음",
  },
  H: {
    title: "성능과 비용",
    evidence: "E-OPS",
    code: "domain/press-agent/observability.ts; domain/press-agent/usage.ts; domain/evaluation/controlledLiveEvaluation.ts; domain/evaluation/controlledLiveReport.ts",
    tests: "domain/press-agent/observability.test.ts; domain/press-agent/usage.test.ts; domain/evaluation/controlledLiveReport.test.ts",
    artifacts: "approved controlled-live case/stage latency and component-cost artifacts",
    target: "Phase 7 observability and cost",
    partialGap: "controlled-live stage별 p50/p95와 비용은 측정했으나 production 사용자 트래픽 수치는 아님",
  },
};

const MISSING_GAPS = {
  B02: "OCR·이미지·표·다단 레이아웃 전용 parser가 없음",
  C05: "similarity threshold와 calibration 절차가 없음",
  C10: "별도 cross-encoder 또는 LLM reranker가 없음",
  C11: "query rewrite 또는 multi-query 실행 경로가 없음",
  D08: "LLM Judge와 human label의 calibration 자료가 없음",
  D14: "평가셋의 실제 사용자 질문 대표성 검증이 없음",
  D15: "holdout 또는 train/dev/test 분할이 없음",
  E02: "문서 부재와 retrieval miss를 결정적으로 분리하는 신호가 없음",
  E07: "abstention threshold와 usability calibration이 없음",
  G05: "동일 configuration 반복 실행과 분산·통계 비교가 없음",
  H02: "실제 stage별 latency 측정 artifact가 없음",
};

function parseCatalog(catalogText) {
  const detailed = [...catalogText.matchAll(/^- `([A-H]\d{2})` (.+)$/gm)].map(
    ([, id, question]) => ({ id, question }),
  );
  const priority = [...catalogText.matchAll(/^- `(P\d{2})` (.+)$/gm)].map(
    ([, id, body]) => ({
      id,
      body,
      references: [...body.matchAll(/`([A-H]\d{2})`/g)].map((match) => match[1]),
    }),
  );
  return { detailed, priority };
}

function statusFor(id) {
  if (IMPLEMENTED_IDS.has(id)) return "implemented";
  if (MISSING_IDS.has(id)) return "missing";
  return "partial";
}

export function buildRagCapabilityMatrix(catalogText) {
  const { detailed, priority } = parseCatalog(catalogText);
  const lines = [
    "# PressTuner RAG capability matrix",
    "",
    "> Generated from `.agent-work/rag-interview-readiness/QUESTION_CATALOG.md`.",
    "> `implemented` requires reachable code and a direct automated test. Synthetic or replay evidence is never reported as production measurement.",
    "",
    "## Status legend",
    "",
    "- `implemented`: 현재 runtime 경로와 직접 테스트가 모두 존재",
    "- `partial`: 일부 runtime/test 근거는 있으나 질문 전체 또는 실측 근거가 부족",
    "- `missing`: 실행 가능한 구현 또는 검증 근거가 없음",
    "",
    "## Evidence registry",
    "",
  ];

  for (const [domain, profile] of Object.entries(DOMAIN_PROFILES)) {
    lines.push(
      `- \`${profile.evidence}\` (${domain}. ${profile.title})`,
      `  - Code: ${profile.code}`,
      `  - Tests: ${profile.tests}`,
      `  - Artifacts: ${profile.artifacts}`,
    );
  }

  lines.push("", "## Detailed questions — 70", "");
  for (const { id, question } of detailed) {
    const status = statusFor(id);
    const profile = DOMAIN_PROFILES[id[0]];
    const evidenceClass =
      status === "implemented"
        ? "code_and_test"
        : status === "missing"
          ? "missing"
          : "code_and_test_with_gap";
    const gap =
      status === "implemented"
        ? "없음(현재 질문 범위)"
        : status === "missing"
          ? MISSING_GAPS[id]
          : profile.partialGap;
    lines.push(
      `- [${status}] \`${id}\` — ${question}`,
      `  - Evidence: ${profile.evidence}`,
      `  - Code: ${profile.code}`,
      `  - Tests: ${profile.tests}`,
      `  - Artifacts: ${profile.artifacts}`,
      `  - Evidence class: ${evidenceClass}`,
      `  - Gap: ${gap}`,
      `  - Target: ${profile.target}`,
    );
  }

  lines.push("", "## Priority concise aliases — 10", "");
  for (const { id, body, references } of priority) {
    lines.push(
      `- \`${id}\` alias → ${references.map((ref) => `\`${ref}\``).join(", ")} — ${body}`,
    );
  }
  lines.push(
    "",
    "## Current baseline truth",
    "",
    "- 실제 chunking: `page-char-v1`, target 1,400 chars, overlap 200 chars.",
    "- 실제 retrieval: team/generation/role-scoped pgvector cosine + PostgreSQL `simple` FTS, equal-weight RRF(k=60), 기본 top-k 8.",
    "- baseline은 별도 reranker/query rewrite가 없고, versioned model rewrite/listwise reranker 및 role-aware chunk 후보를 독립 실행함.",
    "- deterministic experiment artifact는 synthetic contract replay이며 product runtime 실행 또는 production 측정을 주장하지 않음.",
    "- runtime identity는 prompt/tool content hash와 실제 retrieval constants에서 생성됨.",
    "",
  );
  return lines.join("\n");
}

export function validateRagCapabilityMatrix({ catalogText, matrixText }) {
  const catalog = parseCatalog(catalogText);
  if (catalog.detailed.length !== 70) {
    throw new Error(`CATALOG_DETAILED_QUESTION_COUNT_MISMATCH:${catalog.detailed.length}`);
  }
  if (catalog.priority.length !== 10) {
    throw new Error(`CATALOG_PRIORITY_QUESTION_COUNT_MISMATCH:${catalog.priority.length}`);
  }

  const entries = [...
    matrixText.matchAll(/^- \[(implemented|partial|missing)\] `([A-H]\d{2})` — (.+)$/gm),
  ].map((match) => ({
    status: match[1],
    id: match[2],
    question: match[3],
    offset: match.index,
  }));
  if (entries.length !== 70) {
    throw new Error(`MATRIX_DETAILED_QUESTION_COUNT_MISMATCH:${entries.length}`);
  }
  const byId = new Map();
  for (const entry of entries) {
    if (byId.has(entry.id)) throw new Error(`MATRIX_QUESTION_DUPLICATE:${entry.id}`);
    byId.set(entry.id, entry);
  }

  const statusCounts = { implemented: 0, partial: 0, missing: 0 };
  for (const expected of catalog.detailed) {
    const actual = byId.get(expected.id);
    if (!actual) throw new Error(`MATRIX_QUESTION_MISSING:${expected.id}`);
    if (actual.question !== expected.question) {
      throw new Error(`MATRIX_QUESTION_TEXT_MISMATCH:${expected.id}`);
    }
    const expectedStatus = statusFor(expected.id);
    if (actual.status !== expectedStatus) {
      throw new Error(`MATRIX_IMPLEMENTED_STATUS_NOT_SUPPORTED:${expected.id}`);
    }
    statusCounts[actual.status] += 1;

    const start = actual.offset;
    const next = entries.find((candidate) => candidate.offset > start)?.offset;
    const block = matrixText.slice(start, next ?? matrixText.indexOf("## Priority", start));
    for (const field of [
      "Evidence:",
      "Code:",
      "Tests:",
      "Artifacts:",
      "Evidence class:",
      "Gap:",
      "Target:",
    ]) {
      if (!block.includes(field)) {
        throw new Error(`MATRIX_FIELD_MISSING:${expected.id}:${field}`);
      }
    }
    if (actual.status === "implemented" && !block.includes("Evidence class: code_and_test")) {
      throw new Error(`MATRIX_IMPLEMENTED_EVIDENCE_INSUFFICIENT:${expected.id}`);
    }
    if (actual.status === "missing" && !block.includes("Evidence class: missing")) {
      throw new Error(`MATRIX_MISSING_EVIDENCE_CLASS_INVALID:${expected.id}`);
    }
  }

  const aliases = [...matrixText.matchAll(/^- `(P\d{2})` alias → ([^—]+) —/gm)].map(
    ([, id, references]) => ({
      id,
      references: [...references.matchAll(/`([A-H]\d{2})`/g)].map(
        (match) => match[1],
      ),
    }),
  );
  if (aliases.length !== 10) {
    throw new Error(`MATRIX_PRIORITY_ALIAS_COUNT_MISMATCH:${aliases.length}`);
  }
  const aliasIds = new Set(aliases.map((entry) => entry.id));
  for (const expected of catalog.priority) {
    if (!aliasIds.has(expected.id)) throw new Error(`MATRIX_PRIORITY_ALIAS_MISSING:${expected.id}`);
  }
  for (const alias of aliases) {
    if (alias.references.length === 0 || alias.references.some((id) => !byId.has(id))) {
      throw new Error(`MATRIX_PRIORITY_ALIAS_INVALID:${alias.id}`);
    }
  }

  return {
    detailedQuestionCount: entries.length,
    priorityAliasCount: aliases.length,
    statusCounts,
  };
}
