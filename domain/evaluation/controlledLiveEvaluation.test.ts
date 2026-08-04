import assert from "node:assert/strict";
import test from "node:test";

import {
  ControlledLiveEvaluationError,
  assertIndependentControlledLiveExecutions,
  buildJudgeCalibration,
  createPressAgentEvaluationExecutor,
  evaluateJudgeDependentMetric,
  parseControlledLiveDataset,
  summarizeRepeatedMetric,
} from "./controlledLiveEvaluation";

const CONFIGURATION_HASH = "a".repeat(64);
const OTHER_CONFIGURATION_HASH = "b".repeat(64);

type ControlledLiveDatasetCaseForMutation = {
  id: string;
  kind: "RETRIEVAL_ONLY" | "AGENT";
  prompt: string;
  corpusId: string;
  expectedDocumentIds: readonly string[];
};

function datasetInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const documents = Array.from({ length: 40 }, (_, index) => ({
    id: `document-${index + 1}`,
    title: `Document ${index + 1}`,
    filePath: `evals/press-rag/controlled-live/fixtures/document-${index + 1}.pdf`,
    fileSha256: `${(index % 10).toString()}`.repeat(64),
    provenance: {
      origin: "test-fixture",
      sourceManifest: "domain/evaluation/controlledLiveEvaluation.test.ts",
      sourceUrl: null,
    },
    role: "FACT" as const,
  }));
  const cases = documents.map((document, index) => ({
    id: `case-${index + 1}`,
    kind: index % 10 >= 8 ? ("AGENT" as const) : ("RETRIEVAL_ONLY" as const),
    tags: [
      ["REPRESENTATIVE"],
      ["TABLE"],
      ["OCR"],
      ["VERSION"],
      ["CONFLICT"],
      ["UNANSWERABLE"],
      ["PROMPT_INJECTION"],
      ["AUTHORIZATION_POLICY"],
      ["DRAFT_CLAIM_VERIFICATION"],
      ["REPRESENTATIVE"],
    ][index % 10],
    requiresClaimEvidence: index % 10 === 8,
    prompt: `Question ${index + 1}`,
    corpusId: "corpus-main",
    expectedDocumentIds: [document.id],
    expectedSpanIds: [`${document.id}:span-1`],
    requiredFacts: [{ key: "answer", value: `Ground truth ${index + 1}` }],
    forbiddenFacts: [],
    forbiddenSourceIds: [],
    expectedAnswerability: index % 10 === 4 ? ("ABSTAIN" as const) : ("ANSWER" as const),
    expectedTools:
      index % 10 === 8
        ? ["search_knowledge", "draft_press_release", "verify_claims"]
        : index % 10 >= 8
          ? ["search_knowledge"]
          : [],
    expectedConflict: index % 10 === 4 ? ("ABSTAIN" as const) : ("NONE" as const),
    expectedAbstentionReason: index % 10 === 4 ? "SOURCE_CONFLICT" : null,
    annotation: {
      rationale: `Reviewed rationale ${index + 1}`,
      author: { type: "AI" as const, id: "hermes" },
      reviewer: { type: "HUMAN" as const, id: "reviewer-123" },
      reviewedAt: "2026-08-03T11:00:00.000Z",
    },
  }));
  const partitions = {
    development: cases.slice(0, 10).map(({ id }) => id),
    regression: cases.slice(10, 20).map(({ id }) => id),
    adversarial: cases.slice(20, 30).map(({ id }) => id),
    holdout: cases.slice(30).map(({ id }) => id),
  };
  return {
    version: "press-agent-controlled-live/v1",
    createdAt: "2026-08-03T10:00:00.000Z",
    author: { type: "AI", id: "hermes" },
    status: "APPROVED",
    approval: {
      reviewerType: "HUMAN",
      reviewerId: "reviewer-123",
      approvedAt: "2026-08-03T12:00:00.000Z",
    },
    corpora: [
      {
        id: "corpus-main",
        version: "corpus-v1",
        documents,
      },
    ],
    cases,
    partitions,
    ...overrides,
  };
}

function approvedDataset() {
  return parseControlledLiveDataset(datasetInput());
}

function authorization(overrides: Record<string, unknown> = {}) {
  return {
    executor: "live",
    operatorAuthorized: true,
    allowModelSpend: true,
    maxCostMicros: 1_000_000,
    ...overrides,
  };
}

let adapterFixtureNumber = 0;

function adapterFixture(options: {
  actualConfigurationHash?: string;
  costMicros?: number;
  failCase?: string;
  duplicateCaseRunId?: boolean;
  cleanupFailure?: boolean;
} = {}) {
  const fixtureNumber = (adapterFixtureNumber += 1);
  const events: string[] = [];
  const caseInputs: Array<Record<string, unknown>> = [];
  let runNumber = 0;
  const run = async (input: Record<string, unknown>) => {
    const entry = input.case as { id: string };
    const runIndex = input.runIndex as number;
    events.push(`run:${entry.id}:${runIndex}`);
    caseInputs.push(input);
    if (options.failCase === entry.id) throw new Error("adapter exploded");
    runNumber += 1;
    return {
      caseRunId: options.duplicateCaseRunId
        ? "case-run-duplicate"
        : `case-run-${fixtureNumber}-${runNumber}`,
      costMicros: options.costMicros ?? 10,
      latencyMs: 5,
      result: { passed: true, rank: 1 },
    };
  };
  const adapter = {
    async createIsolatedTenant() {
      events.push("create-tenant");
      return { tenantId: "tenant-isolated" };
    },
    async materializeCorpusThroughProductPath(input: {
      corpus: { id: string };
    }) {
      events.push(`materialize:${input.corpus.id}`);
    },
    async readRuntimeConfigurationHash() {
      events.push("read-runtime-configuration");
      return options.actualConfigurationHash ?? CONFIGURATION_HASH;
    },
    executeRetrievalCase: run,
    executeAgentCase: run,
    async cleanupIsolatedTenant() {
      events.push("cleanup-tenant");
      if (options.cleanupFailure) throw new Error("cleanup exploded");
    },
  };
  return { adapter, caseInputs, events };
}

function expectCode(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof ControlledLiveEvaluationError);
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  };
}

test("controlled-live dataset has a stable canonical hash and is deeply immutable", () => {
  const first = approvedDataset();
  const reordered = parseControlledLiveDataset({
    partitions: (datasetInput().partitions as Record<string, unknown>),
    cases: datasetInput().cases,
    corpora: datasetInput().corpora,
    approval: datasetInput().approval,
    status: "APPROVED",
    author: datasetInput().author,
    createdAt: datasetInput().createdAt,
    version: "press-agent-controlled-live/v1",
  });

  assert.match(first.contentHash, /^[a-f0-9]{64}$/);
  assert.equal(first.id, `controlled_live_dataset_${first.contentHash}`);
  assert.equal(reordered.contentHash, first.contentHash);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.cases), true);
  assert.equal(Object.isFrozen(first.cases[0]), true);
  assert.equal(Object.isFrozen(first.corpora[0].documents), true);
  assert.equal(Object.isFrozen(first.partitions.holdout), true);
  assert.throws(
    () =>
      (first.cases as unknown as ControlledLiveDatasetCaseForMutation[]).push(
        first.cases[0],
      ),
    TypeError,
  );

  const withDeclaredIdentity = parseControlledLiveDataset({
    ...datasetInput(),
    id: first.id,
    contentHash: first.contentHash,
  });
  assert.equal(withDeclaredIdentity.contentHash, first.contentHash);
  assert.throws(
    () =>
      parseControlledLiveDataset({
        ...datasetInput(),
        contentHash: "f".repeat(64),
      }),
    expectCode("CONTROLLED_LIVE_DATASET_HASH_MISMATCH"),
  );
});

test("dataset requires 40-60 unique cases and valid corpus/document references", () => {
  const base = datasetInput();
  assert.throws(
    () =>
      parseControlledLiveDataset({
        ...base,
        cases: (base.cases as unknown[]).slice(0, 39),
      }),
    expectCode("CONTROLLED_LIVE_DATASET_CASE_COUNT_MUST_BE_40_TO_60"),
  );

  const duplicateCases = [...(base.cases as Array<Record<string, unknown>>)].map(
    (entry) => ({ ...entry }),
  );
  duplicateCases[1].id = duplicateCases[0].id;
  assert.throws(
    () => parseControlledLiveDataset({ ...base, cases: duplicateCases }),
    expectCode("CONTROLLED_LIVE_DUPLICATE_CASE_ID:case-1"),
  );

  const unknownCorpusCases = [
    ...(base.cases as Array<Record<string, unknown>>),
  ].map((entry) => ({ ...entry }));
  unknownCorpusCases[0].corpusId = "missing-corpus";
  assert.throws(
    () => parseControlledLiveDataset({ ...base, cases: unknownCorpusCases }),
    expectCode("CONTROLLED_LIVE_UNKNOWN_CORPUS:case-1:missing-corpus"),
  );

  const unknownDocumentCases = [
    ...(base.cases as Array<Record<string, unknown>>),
  ].map((entry) => ({ ...entry }));
  unknownDocumentCases[0].expectedDocumentIds = ["missing-document"];
  assert.throws(
    () => parseControlledLiveDataset({ ...base, cases: unknownDocumentCases }),
    expectCode(
      "CONTROLLED_LIVE_UNKNOWN_DOCUMENT:case-1:missing-document",
    ),
  );

  const duplicateDocumentInput = datasetInput();
  const corpora = structuredClone(duplicateDocumentInput.corpora) as Array<{
    documents: Array<{ id: string }>;
  }>;
  corpora[0].documents[1].id = corpora[0].documents[0].id;
  assert.throws(
    () => parseControlledLiveDataset({ ...duplicateDocumentInput, corpora }),
    expectCode("CONTROLLED_LIVE_DUPLICATE_DOCUMENT_ID:corpus-main:document-1"),
  );
});

test("every case belongs to exactly one partition and holdout cannot be omitted or leaked into case metadata", () => {
  const base = datasetInput();
  const duplicatePartitions = structuredClone(base.partitions) as Record<
    string,
    string[]
  >;
  duplicatePartitions.regression[0] = duplicatePartitions.development[0];
  assert.throws(
    () =>
      parseControlledLiveDataset({
        ...base,
        partitions: duplicatePartitions,
      }),
    expectCode("CONTROLLED_LIVE_CASE_IN_MULTIPLE_PARTITIONS:case-1"),
  );

  const missingPartitions = structuredClone(base.partitions) as Record<
    string,
    string[]
  >;
  missingPartitions.holdout = missingPartitions.holdout.slice(1);
  assert.throws(
    () =>
      parseControlledLiveDataset({ ...base, partitions: missingPartitions }),
    expectCode("CONTROLLED_LIVE_CASE_MISSING_PARTITION:case-31"),
  );

  const unknownPartitions = structuredClone(base.partitions) as Record<
    string,
    string[]
  >;
  unknownPartitions.holdout.push("unknown-case");
  assert.throws(
    () =>
      parseControlledLiveDataset({ ...base, partitions: unknownPartitions }),
    expectCode("CONTROLLED_LIVE_PARTITION_UNKNOWN_CASE:holdout:unknown-case"),
  );

  const emptyHoldout = structuredClone(base.partitions) as Record<string, string[]>;
  emptyHoldout.holdout = [];
  assert.throws(
    () => parseControlledLiveDataset({ ...base, partitions: emptyHoldout }),
    expectCode("CONTROLLED_LIVE_HOLDOUT_MUST_NOT_BE_EMPTY"),
  );

  const leakedCases = structuredClone(base.cases) as Array<Record<string, unknown>>;
  leakedCases[0].partition = "holdout";
  assert.throws(
    () => parseControlledLiveDataset({ ...base, cases: leakedCases }),
    expectCode("CONTROLLED_LIVE_INVALID_DATASET"),
  );
});

test("DRAFT has no approval and APPROVED requires a human reviewer and timestamp", () => {
  assert.equal(
    parseControlledLiveDataset({
      ...datasetInput(),
      status: "DRAFT",
      approval: undefined,
    }).status,
    "DRAFT",
  );
  assert.throws(
    () =>
      parseControlledLiveDataset({
        ...datasetInput(),
        status: "DRAFT",
      }),
    expectCode("CONTROLLED_LIVE_DRAFT_MUST_NOT_HAVE_APPROVAL"),
  );
  assert.throws(
    () =>
      parseControlledLiveDataset({
        ...datasetInput(),
        status: "APPROVED",
        approval: undefined,
      }),
    expectCode("CONTROLLED_LIVE_APPROVAL_REQUIRED"),
  );
  assert.throws(
    () =>
      parseControlledLiveDataset({
        ...datasetInput(),
        approval: {
          reviewerType: "JUDGE",
          reviewerId: "model",
          approvedAt: "2026-08-03T12:00:00.000Z",
        },
      }),
    expectCode("CONTROLLED_LIVE_HUMAN_REVIEWER_REQUIRED"),
  );
  assert.throws(
    () =>
      parseControlledLiveDataset({
        ...datasetInput(),
        approval: {
          reviewerType: "HUMAN",
          reviewerId: "reviewer-123",
          approvedAt: "not-a-timestamp",
        },
      }),
    expectCode("CONTROLLED_LIVE_INVALID_APPROVAL_TIMESTAMP"),
  );
});

test("explicit live/spend/cost authorization is checked before any adapter side effect", async () => {
  const invalidAuthorizations = [
    [{ executor: "replay" }, "CONTROLLED_LIVE_EXECUTOR_MUST_BE_LIVE"],
    [
      { operatorAuthorized: false },
      "CONTROLLED_LIVE_OPERATOR_AUTHORIZATION_REQUIRED",
    ],
    [{ allowModelSpend: false }, "CONTROLLED_LIVE_MODEL_SPEND_NOT_ALLOWED"],
    [{ maxCostMicros: 0 }, "CONTROLLED_LIVE_MAX_COST_MUST_BE_POSITIVE_FINITE"],
    [
      { maxCostMicros: Number.POSITIVE_INFINITY },
      "CONTROLLED_LIVE_MAX_COST_MUST_BE_POSITIVE_FINITE",
    ],
  ] as const;

  for (const [override, code] of invalidAuthorizations) {
    const fixture = adapterFixture();
    const executor = createPressAgentEvaluationExecutor(fixture.adapter);
    await assert.rejects(
      executor.execute({
        dataset: approvedDataset(),
        requestedConfigurationHash: CONFIGURATION_HASH,
        authorization: authorization(override),
      }),
      expectCode(code),
    );
    assert.deepEqual(fixture.events, [], code);
  }
});

test("executor snapshots validated authorization before asynchronous adapter work", async () => {
  const fixture = adapterFixture({ costMicros: 60 });
  const mutableAuthorization = authorization({ maxCostMicros: 100 });
  const createTenant = fixture.adapter.createIsolatedTenant;
  fixture.adapter.createIsolatedTenant = async () => {
    mutableAuthorization.maxCostMicros = 1_000_000;
    return createTenant();
  };

  await assert.rejects(
    createPressAgentEvaluationExecutor(fixture.adapter).execute({
      dataset: approvedDataset(),
      requestedConfigurationHash: CONFIGURATION_HASH,
      authorization: mutableAuthorization,
    }),
    expectCode("CONTROLLED_LIVE_TOTAL_COST_CAP_EXCEEDED"),
  );
  assert.equal(
    fixture.events.filter((event) => event.startsWith("run:")).length,
    2,
  );
  assert.equal(fixture.events.at(-1), "cleanup-tenant");
});

test("executor rejects draft, bad run count, and invalid configuration hash before side effects", async () => {
  const draft = parseControlledLiveDataset({
    ...datasetInput(),
    status: "DRAFT",
    approval: undefined,
  });
  for (const [requestOverride, code] of [
    [
      { dataset: draft },
      "CONTROLLED_LIVE_DATASET_MUST_BE_APPROVED",
    ],
    [
      { agentRunCount: 2 },
      "CONTROLLED_LIVE_AGENT_RUN_COUNT_MUST_BE_AT_LEAST_3",
    ],
    [
      { requestedConfigurationHash: "not-a-hash" },
      "CONTROLLED_LIVE_INVALID_CONFIGURATION_HASH",
    ],
  ] as const) {
    const fixture = adapterFixture();
    const executor = createPressAgentEvaluationExecutor(fixture.adapter);
    const baseRequest = {
      dataset: approvedDataset(),
      requestedConfigurationHash: CONFIGURATION_HASH,
      authorization: authorization(),
    };
    await assert.rejects(
      executor.execute({ ...baseRequest, ...requestOverride }),
      expectCode(code),
    );
    assert.deepEqual(fixture.events, [], code);
  }
});

test("executor runs an isolated product-path lifecycle, protects holdout expectations, and returns an immutable artifact", async () => {
  const fixture = adapterFixture();
  const executor = createPressAgentEvaluationExecutor(fixture.adapter);
  const request = {
    dataset: approvedDataset(),
    requestedConfigurationHash: CONFIGURATION_HASH,
    authorization: authorization(),
  };
  const first = await executor.execute(request);
  const secondFixture = adapterFixture();
  const second = await createPressAgentEvaluationExecutor(
    secondFixture.adapter,
  ).execute(request);

  assert.notEqual(first.executionId, second.executionId);
  assert.equal(first.datasetHash, request.dataset.contentHash);
  assert.equal(first.configurationHash, CONFIGURATION_HASH);
  assert.equal(first.totalCostMicros, 560);
  assert.equal(first.results.length, 56);
  assert.equal(
    first.results.filter(({ caseId }) => caseId === "case-1").length,
    1,
  );
  assert.equal(
    first.results.filter(({ caseId }) => caseId === "case-40").length,
    3,
  );
  assert.equal(new Set(first.results.map(({ caseRunId }) => caseRunId)).size, 56);
  assert.deepEqual(fixture.events.slice(0, 3), [
    "create-tenant",
    "materialize:corpus-main",
    "read-runtime-configuration",
  ]);
  assert.equal(fixture.events.at(-1), "cleanup-tenant");
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.results), true);
  assert.equal(Object.isFrozen(first.results[0].result), true);

  const holdoutRunInput = fixture.caseInputs.find(
    (input) => (input.case as { id: string }).id === "case-31",
  )!;
  assert.deepEqual(Object.keys(holdoutRunInput.case as object).sort(), [
    "corpusId",
    "id",
    "kind",
    "prompt",
  ]);
  assert.equal("partition" in holdoutRunInput, false);
  assert.equal("dataset" in holdoutRunInput, false);
});

test("executor can run a predeclared development subset without changing dataset identity", async () => {
  const fixture = adapterFixture();
  const dataset = approvedDataset();
  const artifact = await createPressAgentEvaluationExecutor(fixture.adapter).execute({
    dataset,
    requestedConfigurationHash: CONFIGURATION_HASH,
    authorization: authorization(),
    selectedCaseIds: ["case-1", "case-9"],
  });
  assert.equal(artifact.datasetHash, dataset.contentHash);
  assert.deepEqual(artifact.selectedCaseIds, ["case-1", "case-9"]);
  assert.equal(artifact.results.length, 4);

  const invalidFixture = adapterFixture();
  await assert.rejects(
    createPressAgentEvaluationExecutor(invalidFixture.adapter).execute({
      dataset,
      requestedConfigurationHash: CONFIGURATION_HASH,
      authorization: authorization(),
      selectedCaseIds: ["missing"],
    }),
    expectCode("CONTROLLED_LIVE_SELECTED_CASE_UNKNOWN:missing"),
  );
  assert.deepEqual(invalidFixture.events, []);
});

test("runtime configuration is attested before cases run and cleanup always occurs", async () => {
  const fixture = adapterFixture({
    actualConfigurationHash: OTHER_CONFIGURATION_HASH,
  });
  await assert.rejects(
    createPressAgentEvaluationExecutor(fixture.adapter).execute({
      dataset: approvedDataset(),
      requestedConfigurationHash: CONFIGURATION_HASH,
      authorization: authorization(),
    }),
    expectCode("CONTROLLED_LIVE_RUNTIME_CONFIGURATION_HASH_MISMATCH"),
  );
  assert.deepEqual(fixture.events, [
    "create-tenant",
    "materialize:corpus-main",
    "read-runtime-configuration",
    "cleanup-tenant",
  ]);
});

test("case failures, duplicate run IDs, cost-cap breaches, and cleanup failures fail closed", async (t) => {
  await t.test("case failure", async () => {
    const fixture = adapterFixture({ failCase: "case-2" });
    await assert.rejects(
      createPressAgentEvaluationExecutor(fixture.adapter).execute({
        dataset: approvedDataset(),
        requestedConfigurationHash: CONFIGURATION_HASH,
        authorization: authorization(),
      }),
      expectCode("CONTROLLED_LIVE_CASE_EXECUTION_FAILED:case-2:1"),
    );
    assert.equal(fixture.events.at(-1), "cleanup-tenant");
  });

  await t.test("duplicate case run ID", async () => {
    const fixture = adapterFixture({ duplicateCaseRunId: true });
    await assert.rejects(
      createPressAgentEvaluationExecutor(fixture.adapter).execute({
        dataset: approvedDataset(),
        requestedConfigurationHash: CONFIGURATION_HASH,
        authorization: authorization(),
      }),
      expectCode("CONTROLLED_LIVE_DUPLICATE_CASE_RUN_ID:case-run-duplicate"),
    );
    assert.equal(fixture.events.at(-1), "cleanup-tenant");
  });

  await t.test("cost cap", async () => {
    const fixture = adapterFixture({ costMicros: 60 });
    await assert.rejects(
      createPressAgentEvaluationExecutor(fixture.adapter).execute({
        dataset: approvedDataset(),
        requestedConfigurationHash: CONFIGURATION_HASH,
        authorization: authorization({ maxCostMicros: 100 }),
      }),
      expectCode("CONTROLLED_LIVE_TOTAL_COST_CAP_EXCEEDED"),
    );
    assert.equal(
      fixture.events.filter((event) => event.startsWith("run:")).length,
      2,
    );
    assert.equal(fixture.events.at(-1), "cleanup-tenant");
  });

  await t.test("cleanup failure", async () => {
    const fixture = adapterFixture({ cleanupFailure: true });
    await assert.rejects(
      createPressAgentEvaluationExecutor(fixture.adapter).execute({
        dataset: approvedDataset(),
        requestedConfigurationHash: CONFIGURATION_HASH,
        authorization: authorization(),
      }),
      expectCode("CONTROLLED_LIVE_TENANT_CLEANUP_FAILED"),
    );
    assert.equal(fixture.events.at(-1), "cleanup-tenant");
  });
});

test("independent execution assertion rejects reused provenance and accepts clean comparisons", async () => {
  const request = {
    dataset: approvedDataset(),
    requestedConfigurationHash: CONFIGURATION_HASH,
    authorization: authorization(),
  };
  const left = await createPressAgentEvaluationExecutor(
    adapterFixture().adapter,
  ).execute(request);
  const right = await createPressAgentEvaluationExecutor(
    adapterFixture({ actualConfigurationHash: OTHER_CONFIGURATION_HASH }).adapter,
  ).execute({
    ...request,
    requestedConfigurationHash: OTHER_CONFIGURATION_HASH,
  });
  assert.doesNotThrow(() =>
    assertIndependentControlledLiveExecutions(left, right),
  );

  assert.throws(
    () =>
      assertIndependentControlledLiveExecutions(left, {
        ...right,
        executionId: left.executionId,
      }),
    expectCode("CONTROLLED_LIVE_EXECUTION_ID_MUST_DIFFER"),
  );
  assert.throws(
    () =>
      assertIndependentControlledLiveExecutions(left, {
        ...right,
        configurationHash: left.configurationHash,
      }),
    expectCode("CONTROLLED_LIVE_CONFIGURATION_HASH_MUST_DIFFER"),
  );
  assert.throws(
    () =>
      assertIndependentControlledLiveExecutions(left, {
        ...right,
        results: [
          { ...right.results[0], caseRunId: left.results[0].caseRunId },
          ...right.results.slice(1),
        ],
      }),
    expectCode(
      `CONTROLLED_LIVE_CASE_RUN_ID_MUST_NOT_BE_SHARED:${left.results[0].caseRunId}`,
    ),
  );
  assert.throws(
    () =>
      assertIndependentControlledLiveExecutions(left, {
        ...right,
        datasetHash: "c".repeat(64),
      }),
    expectCode("CONTROLLED_LIVE_DATASET_HASH_MUST_MATCH"),
  );
});

test("repeated metric summary reports mean, worst, spread, and pass count with at least three agent runs", () => {
  assert.deepEqual(
    summarizeRepeatedMetric({
      values: [0.9, 0.7, 0.8],
      passThreshold: 0.8,
    }),
    {
      runCount: 3,
      mean: 0.8,
      worst: 0.7,
      spread: 0.2,
      passCount: 2,
    },
  );
  assert.deepEqual(
    summarizeRepeatedMetric({
      values: [100, 130, 110],
      passThreshold: 120,
      higherIsBetter: false,
    }),
    {
      runCount: 3,
      mean: 340 / 3,
      worst: 130,
      spread: 30,
      passCount: 2,
    },
  );
  assert.throws(
    () => summarizeRepeatedMetric({ values: [1, 1], passThreshold: 1 }),
    expectCode("CONTROLLED_LIVE_AGENT_METRIC_REQUIRES_AT_LEAST_3_RUNS"),
  );
  assert.throws(
    () =>
      summarizeRepeatedMetric({
        values: [1, Number.NaN, 1],
        passThreshold: 1,
      }),
    expectCode("CONTROLLED_LIVE_METRIC_VALUES_MUST_BE_FINITE"),
  );
});

test("human-vs-judge calibration exposes confusion and gates judge-dependent metrics", () => {
  const labels = [
    { id: "1", human: true, judge: true },
    { id: "2", human: true, judge: false },
    { id: "3", human: false, judge: true },
    { id: "4", human: false, judge: false },
    { id: "5", human: true, judge: true },
  ];
  const calibrated = buildJudgeCalibration({
    labels,
    minimumLabels: 5,
    minimumAgreement: 0.6,
  });
  assert.deepEqual(calibrated.confusion, {
    truePositive: 2,
    trueNegative: 1,
    falsePositive: 1,
    falseNegative: 1,
  });
  assert.equal(calibrated.labelCount, 5);
  assert.equal(calibrated.agreementCount, 3);
  assert.equal(calibrated.agreement, 0.6);
  assert.equal(calibrated.falsePositiveRate, 0.5);
  assert.equal(calibrated.falseNegativeRate, 1 / 3);
  assert.equal(calibrated.status, "CALIBRATED");
  assert.deepEqual(
    evaluateJudgeDependentMetric({ value: 0.75, calibration: calibrated }),
    { status: "EVALUABLE", value: 0.75 },
  );
  assert.deepEqual(
    evaluateJudgeDependentMetric({
      value: 0.75,
      calibration: { ...calibrated, labelCount: 0, status: "CALIBRATED" },
    }),
    {
      status: "NOT_EVALUABLE",
      reason: "INSUFFICIENT_CALIBRATION_LABELS",
    },
  );

  const tooFew = buildJudgeCalibration({
    labels: labels.slice(0, 4),
    minimumLabels: 5,
    minimumAgreement: 0.5,
  });
  assert.equal(tooFew.status, "INSUFFICIENT_CALIBRATION");
  assert.deepEqual(
    evaluateJudgeDependentMetric({ value: 1, calibration: tooFew }),
    {
      status: "NOT_EVALUABLE",
      reason: "INSUFFICIENT_CALIBRATION_LABELS",
    },
  );

  const lowAgreement = buildJudgeCalibration({
    labels,
    minimumLabels: 5,
    minimumAgreement: 0.8,
  });
  assert.equal(lowAgreement.status, "INSUFFICIENT_CALIBRATION");
  assert.deepEqual(
    evaluateJudgeDependentMetric({ value: 1, calibration: lowAgreement }),
    {
      status: "NOT_EVALUABLE",
      reason: "CALIBRATION_AGREEMENT_BELOW_GATE",
    },
  );
});
