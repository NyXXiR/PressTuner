import {
  ControlledLiveEvaluationError,
  parseControlledLiveDataset,
  type ControlledLiveDataset,
  type ControlledLiveDatasetCase,
} from "./controlledLiveEvaluation";
import {
  derivePressRagRecordedExecutionRef,
  PRESS_RAG_RECORDED_EXECUTION_REF_VERSION,
} from "./pressRagRecordedExecutionIdentity";
import { scanSensitiveText } from "./sensitiveDataRedaction";

type DemoPreset =
  | "retrieval"
  | "grounded-answer"
  | "abstention"
  | "conflict"
  | "safety";
type CheckStatus = "MATCH" | "MISMATCH" | "NOT_EVALUABLE";
type OutcomeStatus = "COMPLETED" | "FAILED";

export type PressRagRecordedOutcome = Readonly<{
  runIndex: number;
  recordedExecutionRefVersion: typeof PRESS_RAG_RECORDED_EXECUTION_REF_VERSION;
  recordedExecutionRef: string;
  status: OutcomeStatus;
  errorCode: string | null;
  finalAnswer: string | null;
  summary: string | null;
  cannotAnswer: boolean | null;
  latencyMs: number;
  costMicros: number;
  retrieval: readonly Readonly<{
    rank: number;
    logicalDocumentId: string;
    filename: string;
    pageStart: number;
    pageEnd: number;
    score: number | null;
    expected: boolean;
  }>[];
  citations: readonly Readonly<{
    sourceLabel: string;
    logicalDocumentId: string;
    filename: string;
    pageStart: number;
    pageEnd: number;
    expected: boolean;
  }>[];
  verification: Readonly<{
    mode: "ANSWER" | "ABSTENTION" | null;
    status: "PASS" | "FAIL" | null;
    supportedClaims: number;
    totalClaims: number;
    claims: readonly Readonly<{
      status: "SUPPORTED" | "UNSUPPORTED";
      text: string;
      evidence: readonly Readonly<{
        sourceLabel: string;
        pageStart: number;
        pageEnd: number;
      }>[];
    }>[];
  }>;
  fallback: Readonly<{
    mode: "EXTRACTIVE" | "ABSTENTION" | null;
    reason: string | null;
  }>;
  tools: readonly Readonly<{
    sequence: number;
    toolName:
      | "search_knowledge"
      | "compare_sources"
      | "draft_press_release"
      | "verify_claims"
      | "apply_press_release";
    status: "COMPLETED" | "FAILED";
    latencyMs: number;
  }>[];
  checks: Readonly<{
    retrieval: CheckStatus;
    answerability: CheckStatus;
    citations: CheckStatus;
    forbiddenSources: CheckStatus;
    verification: CheckStatus;
    expectedTools: CheckStatus;
  }>;
}>;

export type PressRagDemoViewModel = Readonly<{
  evidence: Readonly<{
    datasetVersion: string;
    approvedAt: string;
    approvedCaseCount: number;
    replayNotice: string;
    baseline: Readonly<{
      label: "Baseline v1";
      completedAt: string;
      configurationHash: string;
    }>;
    candidate: Readonly<{
      label: "Candidate v3 optimized";
      completedAt: string;
      configurationHash: string;
    }>;
  }>;
  scenarios: readonly Readonly<{
    preset: DemoPreset;
    label: string;
    description: string;
    caseId: string;
    prompt: string;
    partition: "development" | "regression" | "adversarial" | "holdout";
    tags: readonly string[];
    expectation: Readonly<{
      answerability: "ANSWER" | "ABSTAIN";
      abstentionReason: string | null;
      conflict: "NONE" | "COMPARE" | "ABSTAIN";
      requiresClaimEvidence: boolean;
      expectedTools: readonly string[];
      expectedDocuments: readonly Readonly<{ logicalId: string; title: string }>[];
      requiredFacts: readonly Readonly<{ key: string; value: string }>[];
    }>;
    runs: readonly Readonly<{
      runIndex: number;
      baseline: PressRagRecordedOutcome;
      candidate: PressRagRecordedOutcome;
    }>[];
  }>[];
}>;

export class PressRagDemoPresentationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PressRagDemoPresentationError";
    this.code = code;
  }
}

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_CODE = /^[A-Z0-9_:-]{1,160}$/;
const TOOL_NAMES = new Set([
  "search_knowledge",
  "compare_sources",
  "draft_press_release",
  "verify_claims",
  "apply_press_release",
]);
const MAX = {
  answer: 16_000,
  collection: 100,
  filename: 255,
  prompt: 4_000,
  short: 512,
  text: 4_000,
  timeMs: 86_400_000,
  costMicros: 1_000_000_000,
} as const;

type UnknownRecord = Record<string, unknown>;
type ArtifactRun = Readonly<{
  caseId: string;
  caseRunId: string;
  kind: "RETRIEVAL_ONLY" | "AGENT";
  runIndex: number;
  latencyMs: number;
  costMicros: number;
  result: UnknownRecord;
}>;
type ValidArtifact = Readonly<{
  datasetHash: string;
  configurationHash: string;
  agentRunCount: number;
  completedAt: string;
  selectedCaseIds: readonly string[];
  runs: ReadonlyMap<string, ArtifactRun>;
}>;

const SCENARIO_COPY: Readonly<Record<DemoPreset, { label: string; description: string }>> = {
  retrieval: {
    label: "검색 정확도",
    description: "식별자가 있는 질문에서 기대 문서를 상위 검색 결과로 찾는지 확인합니다.",
  },
  "grounded-answer": {
    label: "근거 기반 답변",
    description: "최종 문장과 인용 근거가 검증을 통과했는지 비교합니다.",
  },
  abstention: {
    label: "답변 유보",
    description: "문서에 없는 미래 사실을 만들어내지 않고 답변을 유보하는지 확인합니다.",
  },
  conflict: {
    label: "상충 근거 비교",
    description: "서로 다른 문서의 사실을 합치지 않고 비교 도구로 구분하는지 확인합니다.",
  },
  safety: {
    label: "프롬프트 주입 방어",
    description: "문서 안의 지시나 예시를 실제 사실처럼 따르지 않는지 확인합니다.",
  },
};

function fail(code: string): never {
  throw new PressRagDemoPresentationError(code);
}

function record(value: unknown, code = "PRESS_RAG_DEMO_INVALID_ARTIFACT"): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as UnknownRecord;
}

function boundedString(value: unknown, max: number, code = "PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD") {
  if (typeof value !== "string" || value.length === 0 || value.length > max) fail(code);
  return value;
}

function publicProseString(value: unknown, max: number) {
  const prose = boundedString(value, max);
  if (scanSensitiveText(prose).containsSensitiveData) {
    fail("PRESS_RAG_DEMO_SENSITIVE_PRESENTATION_FIELD");
  }
  return prose;
}

function nullablePublicProseString(value: unknown, max: number) {
  if (value === null || value === undefined) return null;
  return publicProseString(value, max);
}

function nullableString(value: unknown, max: number) {
  if (value === null || value === undefined) return null;
  return boundedString(value, max);
}

function integer(value: unknown, min: number, max: number, code: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail(code);
  return value;
}

function finite(value: unknown, min: number, max: number, code: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) fail(code);
  return value;
}

function timestamp(value: unknown) {
  if (typeof value !== "string" || value.length > 64 || !/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
    fail("PRESS_RAG_DEMO_INVALID_TIMESTAMP");
  }
  return value;
}

function array(value: unknown, code = "PRESS_RAG_DEMO_INVALID_ARTIFACT") {
  if (!Array.isArray(value) || value.length > MAX.collection) fail(code);
  return value;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function parseDataset(input: unknown) {
  try {
    const dataset = parseControlledLiveDataset(input);
    if (dataset.status !== "APPROVED" || dataset.approval === undefined) fail("PRESS_RAG_DEMO_DATASET_NOT_APPROVED");
    return dataset;
  } catch (error) {
    if (error instanceof PressRagDemoPresentationError) throw error;
    if (error instanceof ControlledLiveEvaluationError) fail("PRESS_RAG_DEMO_INVALID_DATASET");
    throw error;
  }
}

function validateArtifact(input: unknown, dataset: ControlledLiveDataset): ValidArtifact {
  const raw = record(input);
  const executionId = boundedString(raw.executionId, 160, "PRESS_RAG_DEMO_INVALID_RUN_METADATA");
  if (!/^controlled_live_execution_[a-f0-9]{64}$/.test(executionId)) fail("PRESS_RAG_DEMO_INVALID_RUN_METADATA");
  const datasetHash = boundedString(raw.datasetHash, 64, "PRESS_RAG_DEMO_INVALID_HASH");
  const configurationHash = boundedString(raw.configurationHash, 64, "PRESS_RAG_DEMO_INVALID_HASH");
  if (!SHA256.test(datasetHash) || !SHA256.test(configurationHash)) fail("PRESS_RAG_DEMO_INVALID_HASH");
  if (datasetHash !== dataset.contentHash) fail("PRESS_RAG_DEMO_DATASET_HASH_MISMATCH");

  const startedAt = timestamp(raw.startedAt);
  const completedAt = timestamp(raw.completedAt);
  if (Date.parse(completedAt) < Date.parse(startedAt)) fail("PRESS_RAG_DEMO_INVALID_TIMESTAMP");
  const agentRunCount = integer(raw.agentRunCount, 1, 10, "PRESS_RAG_DEMO_INVALID_RUN_METADATA");
  const totalCostMicros = integer(raw.totalCostMicros, 0, MAX.costMicros, "PRESS_RAG_DEMO_INVALID_COST");
  const knownCases = new Map(dataset.cases.map((entry) => [entry.id, entry]));
  const selectedCaseIds = array(raw.selectedCaseIds, "PRESS_RAG_DEMO_INVALID_RUN_METADATA").map((id) =>
    boundedString(id, MAX.short, "PRESS_RAG_DEMO_INVALID_RUN_METADATA"),
  );
  if (new Set(selectedCaseIds).size !== selectedCaseIds.length) fail("PRESS_RAG_DEMO_INVALID_RUN_METADATA");

  const runs = new Map<string, ArtifactRun>();
  let summedCost = 0;
  for (const value of array(raw.results)) {
    const result = record(value);
    const caseId = boundedString(result.caseId, MAX.short, "PRESS_RAG_DEMO_INVALID_RUN_METADATA");
    const expectedCase = knownCases.get(caseId);
    if (expectedCase === undefined) fail("PRESS_RAG_DEMO_UNKNOWN_CASE");
    if (!selectedCaseIds.includes(caseId)) fail("PRESS_RAG_DEMO_INVALID_RUN_METADATA");
    const caseRunId = boundedString(result.caseRunId, 160, "PRESS_RAG_DEMO_INVALID_RUN_METADATA");
    if (result.kind !== expectedCase.kind) fail("PRESS_RAG_DEMO_CASE_KIND_MISMATCH");
    const runIndex = integer(result.runIndex, 1, 10, "PRESS_RAG_DEMO_INVALID_RUN_METADATA");
    const latencyMs = finite(result.latencyMs, 0, MAX.timeMs, "PRESS_RAG_DEMO_INVALID_LATENCY");
    const costMicros = integer(result.costMicros, 0, MAX.costMicros, "PRESS_RAG_DEMO_INVALID_COST");
    const key = `${caseId}:${runIndex}`;
    if (runs.has(key)) fail("PRESS_RAG_DEMO_DUPLICATE_RUN");
    const resultBody = record(result.result);
    validateDocumentMappings(resultBody, expectedCase, dataset);
    runs.set(key, {
      caseId,
      caseRunId,
      kind: expectedCase.kind,
      runIndex,
      latencyMs,
      costMicros,
      result: resultBody,
    });
    summedCost += costMicros;
  }
  if (summedCost !== totalCostMicros) fail("PRESS_RAG_DEMO_TOTAL_COST_MISMATCH");

  for (const caseId of selectedCaseIds) {
    const expectedCase = knownCases.get(caseId);
    if (expectedCase === undefined) fail("PRESS_RAG_DEMO_UNKNOWN_CASE");
    const expectedRuns = expectedCase.kind === "RETRIEVAL_ONLY" ? 1 : agentRunCount;
    for (let runIndex = 1; runIndex <= expectedRuns; runIndex += 1) {
      if (!runs.has(`${caseId}:${runIndex}`)) fail("PRESS_RAG_DEMO_RUN_COVERAGE_MISMATCH");
    }
    const actualCount = [...runs.values()].filter((run) => run.caseId === caseId).length;
    if (actualCount !== expectedRuns) fail("PRESS_RAG_DEMO_RUN_COVERAGE_MISMATCH");
  }

  return { datasetHash, configurationHash, agentRunCount, completedAt, selectedCaseIds, runs };
}

function sameCoverage(left: ValidArtifact, right: ValidArtifact) {
  if (
    left.selectedCaseIds.length !== right.selectedCaseIds.length ||
    left.selectedCaseIds.some((id, index) => right.selectedCaseIds[index] !== id) ||
    left.agentRunCount !== right.agentRunCount
  ) {
    fail("PRESS_RAG_DEMO_ARTIFACT_COVERAGE_MISMATCH");
  }
}

function partitionFor(dataset: ControlledLiveDataset, caseId: string) {
  for (const name of ["development", "regression", "adversarial", "holdout"] as const) {
    if (dataset.partitions[name].includes(caseId)) return name;
  }
  fail("PRESS_RAG_DEMO_INVALID_DATASET");
}

function selectScenarios(dataset: ControlledLiveDataset) {
  const find = (preset: DemoPreset, predicate: (entry: ControlledLiveDatasetCase) => boolean) => {
    const entry = dataset.cases.find(predicate);
    if (entry === undefined) fail(`PRESS_RAG_DEMO_MISSING_PRESET:${preset}`);
    return { preset, entry };
  };
  return [
    find("retrieval", (entry) => entry.kind === "RETRIEVAL_ONLY" && entry.tags.includes("REPRESENTATIVE") && entry.expectedAnswerability === "ANSWER"),
    find("grounded-answer", (entry) => entry.kind === "AGENT" && entry.expectedAnswerability === "ANSWER" && entry.requiresClaimEvidence),
    find("abstention", (entry) => entry.kind === "AGENT" && entry.expectedAnswerability === "ABSTAIN" && entry.tags.includes("UNANSWERABLE")),
    find("conflict", (entry) => entry.kind === "AGENT" && entry.tags.includes("CONFLICT") && entry.expectedConflict === "COMPARE"),
    find("safety", (entry) => entry.kind === "AGENT" && entry.expectedAnswerability === "ABSTAIN" && entry.tags.includes("PROMPT_INJECTION")),
  ] as const;
}

function corpusDocuments(dataset: ControlledLiveDataset, entry: ControlledLiveDatasetCase) {
  const corpus = dataset.corpora.find(({ id }) => id === entry.corpusId);
  if (corpus === undefined) fail("PRESS_RAG_DEMO_INVALID_DATASET");
  return new Map(corpus.documents.map((document) => [document.id, document]));
}

function validateDocumentMappings(
  result: UnknownRecord,
  entry: ControlledLiveDatasetCase,
  dataset: ControlledLiveDataset,
) {
  const mapping = record(result.documentIdMap);
  const product = record(result.productResult);
  const documents = corpusDocuments(dataset, entry);
  const sourceCollections =
    entry.kind === "RETRIEVAL_ONLY"
      ? [product.hits, product.citations]
      : [product.citations];
  for (const collection of sourceCollections) {
    for (const value of array(collection)) {
      const source = record(value);
      mappedDocument(source.documentId, mapping, documents);
    }
  }
}

function mappedDocument(
  internalId: unknown,
  mapping: UnknownRecord,
  documents: ReturnType<typeof corpusDocuments>,
) {
  const id = boundedString(internalId, MAX.short);
  const logicalId = mapping[id];
  if (typeof logicalId !== "string") fail("PRESS_RAG_DEMO_DOCUMENT_MAPPING_MISSING");
  const document = documents.get(logicalId);
  if (document === undefined) fail("PRESS_RAG_DEMO_DOCUMENT_MAPPING_INVALID");
  return {
    logicalId: boundedString(logicalId, MAX.short),
    filename: publicProseString(document.title, MAX.filename),
  };
}

function pageRange(source: UnknownRecord) {
  const pageStart = integer(source.pageStart, 1, 100_000, "PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
  const pageEnd = integer(source.pageEnd, pageStart, 100_000, "PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
  return { pageStart, pageEnd };
}

function projectSources(
  rawSources: unknown,
  mapping: UnknownRecord,
  documents: ReturnType<typeof corpusDocuments>,
  expected: ReadonlySet<string>,
  withScore: boolean,
) {
  return array(rawSources).slice(0, 5).map((value, index) => {
    const source = record(value);
    const document = mappedDocument(source.documentId, mapping, documents);
    const pages = pageRange(source);
    const score = withScore ? finite(source.score, 0, 1, "PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD") : null;
    return {
      rank: index + 1,
      logicalDocumentId: document.logicalId,
      filename: document.filename,
      pageStart: pages.pageStart,
      pageEnd: pages.pageEnd,
      score,
      expected: expected.has(document.logicalId),
    };
  });
}

function projectCitations(
  rawSources: unknown,
  mapping: UnknownRecord,
  documents: ReturnType<typeof corpusDocuments>,
  expected: ReadonlySet<string>,
) {
  return array(rawSources).map((value) => {
    const source = record(value);
    const document = mappedDocument(source.documentId, mapping, documents);
    const pages = pageRange(source);
    return {
      sourceLabel: publicProseString(source.sourceId, MAX.short),
      logicalDocumentId: document.logicalId,
      filename: document.filename,
      pageStart: pages.pageStart,
      pageEnd: pages.pageEnd,
      expected: expected.has(document.logicalId),
    };
  });
}

function projectVerification(
  output: UnknownRecord | null,
): PressRagRecordedOutcome["verification"] {
  const empty = { mode: null, status: null, supportedClaims: 0, totalClaims: 0, claims: [] } as const;
  if (output === null || output.claimVerification === null || output.claimVerification === undefined) return empty;
  const raw = record(output.claimVerification);
  if (raw.mode !== "ANSWER" && raw.mode !== "ABSTENTION") fail("PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
  if (raw.status !== "PASS" && raw.status !== "FAIL") fail("PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
  const claims = array(raw.claims).slice(0, 20).map((value) => {
    const claim = record(value);
    if (claim.status !== "SUPPORTED" && claim.status !== "UNSUPPORTED") fail("PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
    const evidence = array(claim.spans).slice(0, 10).map((spanValue) => {
      const span = record(spanValue);
      return {
        sourceLabel: publicProseString(span.sourceId, MAX.short),
        ...pageRange(span),
      };
    });
    return {
      status: claim.status as "SUPPORTED" | "UNSUPPORTED",
      text: publicProseString(claim.text, MAX.text),
      evidence,
    };
  });
  return {
    mode: raw.mode as "ANSWER" | "ABSTENTION",
    status: raw.status as "PASS" | "FAIL",
    supportedClaims: claims.filter(({ status }) => status === "SUPPORTED").length,
    totalClaims: claims.length,
    claims,
  };
}

function projectFallback(
  output: UnknownRecord | null,
): PressRagRecordedOutcome["fallback"] {
  if (output === null) {
    return { mode: null, reason: null } as const;
  }
  const fallbackValue = output.verificationFallback ?? output.abstentionRecovery;
  if (fallbackValue === null || fallbackValue === undefined) {
    return { mode: null, reason: null } as const;
  }
  const fallback = record(fallbackValue);
  if (output.verificationFallback === undefined && output.abstentionRecovery !== undefined) {
    const reason = nullableString(fallback.reason, MAX.short);
    if (reason !== null && !SAFE_CODE.test(reason)) fail("PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
    return { mode: "EXTRACTIVE", reason };
  }
  if (fallback.mode !== "EXTRACTIVE" && fallback.mode !== "ABSTENTION") fail("PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
  const reason = nullableString(fallback.reason, MAX.short);
  if (reason !== null && !SAFE_CODE.test(reason)) fail("PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
  return { mode: fallback.mode as "EXTRACTIVE" | "ABSTENTION", reason };
}

function projectTools(rawSteps: unknown): PressRagRecordedOutcome["tools"] {
  const tools: Array<PressRagRecordedOutcome["tools"][number]> = [];
  for (const value of array(rawSteps)) {
    const step = record(value);
    if (step.kind !== "TOOL") continue;
    if (typeof step.toolName !== "string" || !TOOL_NAMES.has(step.toolName)) fail("PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
    if (step.status !== "COMPLETED" && step.status !== "FAILED") fail("PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
    tools.push({
      sequence: integer(step.sequence, 1, MAX.collection, "PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD"),
      toolName: step.toolName as PressRagRecordedOutcome["tools"][number]["toolName"],
      status: step.status as "COMPLETED" | "FAILED",
      latencyMs: finite(step.latencyMs, 0, MAX.timeMs, "PRESS_RAG_DEMO_INVALID_LATENCY"),
    });
  }
  return tools;
}

function check(condition: boolean | null): CheckStatus {
  return condition === null ? "NOT_EVALUABLE" : condition ? "MATCH" : "MISMATCH";
}

function projectOutcome(
  run: ArtifactRun,
  entry: ControlledLiveDatasetCase,
  dataset: ControlledLiveDataset,
): PressRagRecordedOutcome {
  const result = run.result;
  const mapping = record(result.documentIdMap);
  const product = record(result.productResult);
  const documents = corpusDocuments(dataset, entry);
  const expected = new Set(entry.expectedDocumentIds);
  let status: OutcomeStatus;
  let errorCode: string | null;
  let output: UnknownRecord | null;
  let rawCitations: unknown;
  let rawHits: unknown;
  let rawSteps: unknown;

  if (run.kind === "RETRIEVAL_ONLY") {
    status = "COMPLETED";
    errorCode = null;
    output = null;
    rawHits = product.hits;
    rawCitations = product.citations;
    rawSteps = [];
  } else {
    if (product.status !== "COMPLETED" && product.status !== "FAILED") fail("PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
    status = product.status;
    errorCode = nullableString(product.errorCode, 160);
    if (errorCode !== null && !SAFE_CODE.test(errorCode)) fail("PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
    output = product.output === null ? null : record(product.output);
    rawCitations = product.citations;
    rawHits = product.citations;
    rawSteps = product.steps;
  }

  const finalAnswer = output === null ? null : nullablePublicProseString(output.answer, MAX.answer);
  const summary = output === null ? null : nullablePublicProseString(output.summary, MAX.text);
  const cannotAnswer = output === null ? null : typeof output.cannotAnswer === "boolean" ? output.cannotAnswer : fail("PRESS_RAG_DEMO_INVALID_PRESENTATION_FIELD");
  const retrieval = projectSources(rawHits, mapping, documents, expected, run.kind === "RETRIEVAL_ONLY");
  const citations = projectCitations(rawCitations, mapping, documents, expected);
  const verification = projectVerification(output);
  const fallback = projectFallback(output);
  const tools = projectTools(rawSteps);
  const retrievedIds = new Set(retrieval.map(({ logicalDocumentId }) => logicalDocumentId));
  const citationIds = new Set(citations.map(({ logicalDocumentId }) => logicalDocumentId));
  const toolNames = new Set(tools.map(({ toolName }) => toolName));
  const expectedAnswer = entry.expectedAnswerability === "ANSWER";
  const evaluable = status === "COMPLETED";

  return {
    runIndex: run.runIndex,
    recordedExecutionRefVersion: PRESS_RAG_RECORDED_EXECUTION_REF_VERSION,
    recordedExecutionRef: derivePressRagRecordedExecutionRef(run.caseRunId),
    status,
    errorCode,
    finalAnswer,
    summary,
    cannotAnswer,
    latencyMs: run.latencyMs,
    costMicros: run.costMicros,
    retrieval,
    citations,
    verification,
    fallback,
    tools,
    checks: {
      retrieval: check(entry.expectedDocumentIds.every((id) => retrievedIds.has(id))),
      answerability: check(evaluable && cannotAnswer !== null ? cannotAnswer !== expectedAnswer : null),
      citations: check(
        evaluable
          ? expectedAnswer
            ? citations.length > 0 && [...citationIds].every((id) => expected.has(id))
            : citations.length === 0
          : null,
      ),
      forbiddenSources: check(evaluable ? [...citationIds].every((id) => !entry.forbiddenSourceIds.includes(id)) : null),
      verification: check(
        evaluable
          ? entry.requiresClaimEvidence
            ? verification.status === "PASS" && verification.supportedClaims === verification.totalClaims
            : verification.status === null || verification.status === "PASS"
          : null,
      ),
      expectedTools: check(evaluable ? entry.expectedTools.every((name) => toolNames.has(name)) : null),
    },
  };
}

export function presentPressRagDemo(input: Readonly<{
  dataset: unknown;
  baseline: unknown;
  candidate: unknown;
}>): PressRagDemoViewModel {
  const dataset = parseDataset(input.dataset);
  const baseline = validateArtifact(input.baseline, dataset);
  const candidate = validateArtifact(input.candidate, dataset);
  sameCoverage(baseline, candidate);
  const scenarios = selectScenarios(dataset).map(({ preset, entry }) => {
    const documents = corpusDocuments(dataset, entry);
    const runCount = entry.kind === "RETRIEVAL_ONLY" ? 1 : baseline.agentRunCount;
    const runs = Array.from({ length: runCount }, (_, index) => {
      const runIndex = index + 1;
      const baselineRun = baseline.runs.get(`${entry.id}:${runIndex}`);
      const candidateRun = candidate.runs.get(`${entry.id}:${runIndex}`);
      if (baselineRun === undefined || candidateRun === undefined) fail("PRESS_RAG_DEMO_ARTIFACT_COVERAGE_MISMATCH");
      return {
        runIndex,
        baseline: projectOutcome(baselineRun, entry, dataset),
        candidate: projectOutcome(candidateRun, entry, dataset),
      };
    });
    return {
      preset,
      label: SCENARIO_COPY[preset].label,
      description: SCENARIO_COPY[preset].description,
      caseId: boundedString(entry.id, MAX.short),
      prompt: publicProseString(entry.prompt, MAX.prompt),
      partition: partitionFor(dataset, entry.id),
      tags: entry.tags.map((tag) => boundedString(tag, MAX.short)),
      expectation: {
        answerability: entry.expectedAnswerability,
        abstentionReason: entry.expectedAbstentionReason,
        conflict: entry.expectedConflict,
        requiresClaimEvidence: entry.requiresClaimEvidence,
        expectedTools: entry.expectedTools.map((tool) => boundedString(tool, MAX.short)),
        expectedDocuments: entry.expectedDocumentIds.map((logicalId) => {
          const document = documents.get(logicalId);
          if (document === undefined) fail("PRESS_RAG_DEMO_INVALID_DATASET");
          return { logicalId: boundedString(logicalId, MAX.short), title: publicProseString(document.title, MAX.filename) };
        }),
        requiredFacts: entry.requiredFacts.map(({ key, value }) => ({
          key: boundedString(key, MAX.short),
          value: publicProseString(value, MAX.text),
        })),
      },
      runs,
    };
  });

  return deepFreeze({
    evidence: {
      datasetVersion: boundedString(dataset.version, MAX.short),
      approvedAt: timestamp(dataset.approval!.approvedAt),
      approvedCaseCount: dataset.cases.length,
      replayNotice: "새 요청을 실행하지 않고, 승인된 controlled-live 기록을 재생합니다.",
      baseline: {
        label: "Baseline v1" as const,
        completedAt: baseline.completedAt,
        configurationHash: baseline.configurationHash,
      },
      candidate: {
        label: "Candidate v3 optimized" as const,
        completedAt: candidate.completedAt,
        configurationHash: candidate.configurationHash,
      },
    },
    scenarios,
  }) as PressRagDemoViewModel;
}
