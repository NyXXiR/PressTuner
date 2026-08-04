import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

const nonEmptyString = z.string().min(1);
const sha256String = z.string().regex(/^[a-f0-9]{64}$/);

const actorSchema = z
  .object({
    type: z.enum(["HUMAN", "AI"]),
    id: nonEmptyString,
  })
  .strict();
const humanActorSchema = z
  .object({ type: z.literal("HUMAN"), id: nonEmptyString })
  .strict();
const timestampSchema = z.string().datetime({ offset: true });

export const controlledLiveCaseTagSchema = z.enum([
  "REPRESENTATIVE",
  "TABLE",
  "OCR",
  "VERSION",
  "CONFLICT",
  "UNANSWERABLE",
  "PROMPT_INJECTION",
  "AUTHORIZATION_POLICY",
  "DRAFT_CLAIM_VERIFICATION",
]);

const sourceProvenanceSchema = z
  .object({
    origin: nonEmptyString,
    sourceManifest: nonEmptyString,
    sourceUrl: nonEmptyString.nullable(),
  })
  .strict();

const corpusDocumentSchema = z
  .object({
    id: nonEmptyString,
    title: z.string(),
    filePath: nonEmptyString,
    fileSha256: sha256String,
    provenance: sourceProvenanceSchema,
    role: z.enum([
      "FACT",
      "CAREER",
      "STYLE_POLICY",
      "STYLE_EXAMPLE",
      "IGNORE",
    ]),
  })
  .strict();

const corpusSchema = z
  .object({
    id: nonEmptyString,
    version: nonEmptyString,
    documents: z.array(corpusDocumentSchema),
  })
  .strict();

const requiredFactSchema = z
  .object({
    key: nonEmptyString,
    value: nonEmptyString,
    unit: nonEmptyString.optional(),
    effectivePeriod: nonEmptyString.optional(),
  })
  .strict();
const annotationSchema = z
  .object({
    rationale: nonEmptyString,
    author: actorSchema,
    reviewer: humanActorSchema.optional(),
    reviewedAt: timestampSchema.optional(),
  })
  .strict();

const controlledLiveCaseSchema = z
  .object({
    id: nonEmptyString,
    kind: z.enum(["RETRIEVAL_ONLY", "AGENT"]),
    tags: z.array(controlledLiveCaseTagSchema).min(1),
    requiresClaimEvidence: z.boolean(),
    prompt: z.string(),
    corpusId: nonEmptyString,
    expectedDocumentIds: z.array(nonEmptyString),
    expectedSpanIds: z.array(nonEmptyString),
    requiredFacts: z.array(requiredFactSchema),
    forbiddenFacts: z.array(nonEmptyString),
    forbiddenSourceIds: z.array(nonEmptyString),
    expectedAnswerability: z.enum(["ANSWER", "ABSTAIN"]),
    expectedTools: z.array(
      z.enum([
        "search_knowledge",
        "compare_sources",
        "draft_press_release",
        "verify_claims",
        "apply_press_release",
      ]),
    ),
    expectedConflict: z.enum(["NONE", "COMPARE", "ABSTAIN"]),
    expectedAbstentionReason: nonEmptyString.nullable(),
    annotation: annotationSchema,
  })
  .strict();

const approvalSchema = z
  .object({
    reviewerType: z.string(),
    reviewerId: z.string(),
    approvedAt: z.string(),
  })
  .strict();

const partitionsSchema = z
  .object({
    development: z.array(nonEmptyString),
    regression: z.array(nonEmptyString),
    adversarial: z.array(nonEmptyString),
    holdout: z.array(nonEmptyString),
  })
  .strict();

/**
 * Structural schema for serialized controlled-live datasets. Cross-reference,
 * approval, partition, identity, and immutability invariants are enforced by
 * parseControlledLiveDataset, which is the domain boundary.
 */
export const controlledLiveDatasetSchema = z
  .object({
    id: nonEmptyString.optional(),
    contentHash: sha256String.optional(),
    version: nonEmptyString,
    createdAt: timestampSchema,
    author: actorSchema,
    status: z.enum(["DRAFT", "APPROVED"]),
    approval: approvalSchema.optional(),
    corpora: z.array(corpusSchema),
    cases: z.array(controlledLiveCaseSchema).min(40).max(60),
    partitions: partitionsSchema,
  })
  .strict();

type ControlledLiveDatasetInput = z.infer<typeof controlledLiveDatasetSchema>;

type DeepReadonly<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type ControlledLiveDatasetCase = DeepReadonly<
  z.infer<typeof controlledLiveCaseSchema>
>;
export type ControlledLiveCorpus = DeepReadonly<z.infer<typeof corpusSchema>>;
export type ControlledLiveDataset = DeepReadonly<
  Omit<ControlledLiveDatasetInput, "id" | "contentHash"> & {
    id: string;
    contentHash: string;
  }
>;

export class ControlledLiveEvaluationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "ControlledLiveEvaluationError";
    this.code = code;
  }
}

function fail(code: string): never {
  throw new ControlledLiveEvaluationError(code);
}

function sortForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForCanonicalJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, sortForCanonicalJson(child)]),
    );
  }
  return value;
}

export function controlledLiveCanonicalJson(value: unknown): string {
  return JSON.stringify(sortForCanonicalJson(value));
}

export function hashControlledLiveContent(value: unknown): string {
  return createHash("sha256")
    .update(controlledLiveCanonicalJson(value))
    .digest("hex");
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): DeepReadonly<T> {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value as DeepReadonly<T>;
  }
  const objectValue = value as object;
  if (seen.has(objectValue)) return value as DeepReadonly<T>;
  seen.add(objectValue);
  for (const child of Object.values(objectValue)) deepFreeze(child, seen);
  return Object.freeze(value) as DeepReadonly<T>;
}

function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function datasetHashBody(dataset: ControlledLiveDatasetInput) {
  // Approval is workflow metadata, not dataset content. A reviewed DRAFT can
  // therefore become APPROVED without changing the identity of what was reviewed.
  return {
    version: dataset.version,
    createdAt: dataset.createdAt,
    author: dataset.author,
    corpora: dataset.corpora,
    cases: dataset.cases.map((entry) => ({
      ...entry,
      annotation: {
        rationale: entry.annotation.rationale,
        author: entry.annotation.author,
      },
    })),
    partitions: dataset.partitions,
  };
}

export function parseControlledLiveDataset(
  input: unknown,
): ControlledLiveDataset {
  // Preserve the public deterministic code while also encoding the bound in
  // the exported Zod schema.
  if (
    input !== null &&
    typeof input === "object" &&
    Array.isArray((input as { cases?: unknown }).cases) &&
    ((input as { cases: unknown[] }).cases.length < 40 ||
      (input as { cases: unknown[] }).cases.length > 60)
  ) {
    fail("CONTROLLED_LIVE_DATASET_CASE_COUNT_MUST_BE_40_TO_60");
  }
  const parsed = controlledLiveDatasetSchema.safeParse(input);
  if (!parsed.success) {
    fail("CONTROLLED_LIVE_INVALID_DATASET");
  }
  const dataset = parsed.data;

  if (dataset.cases.length < 40 || dataset.cases.length > 60) {
    fail("CONTROLLED_LIVE_DATASET_CASE_COUNT_MUST_BE_40_TO_60");
  }

  const duplicateCaseId = firstDuplicate(dataset.cases.map(({ id }) => id));
  if (duplicateCaseId !== undefined) {
    fail(`CONTROLLED_LIVE_DUPLICATE_CASE_ID:${duplicateCaseId}`);
  }
  const duplicateCorpusId = firstDuplicate(dataset.corpora.map(({ id }) => id));
  if (duplicateCorpusId !== undefined) {
    fail(`CONTROLLED_LIVE_DUPLICATE_CORPUS_ID:${duplicateCorpusId}`);
  }

  const corpusById = new Map(dataset.corpora.map((corpus) => [corpus.id, corpus]));
  for (const corpus of dataset.corpora) {
    const duplicateDocumentId = firstDuplicate(
      corpus.documents.map(({ id }) => id),
    );
    if (duplicateDocumentId !== undefined) {
      fail(
        `CONTROLLED_LIVE_DUPLICATE_DOCUMENT_ID:${corpus.id}:${duplicateDocumentId}`,
      );
    }
  }

  for (const entry of dataset.cases) {
    const corpus = corpusById.get(entry.corpusId);
    if (corpus === undefined) {
      fail(`CONTROLLED_LIVE_UNKNOWN_CORPUS:${entry.id}:${entry.corpusId}`);
    }
    const duplicateExpectedDocumentId = firstDuplicate(
      entry.expectedDocumentIds,
    );
    if (duplicateExpectedDocumentId !== undefined) {
      fail(
        `CONTROLLED_LIVE_DUPLICATE_EXPECTED_DOCUMENT_ID:${entry.id}:${duplicateExpectedDocumentId}`,
      );
    }
    const documentIds = new Set(corpus.documents.map(({ id }) => id));
    for (const documentId of entry.expectedDocumentIds) {
      if (!documentIds.has(documentId)) {
        fail(`CONTROLLED_LIVE_UNKNOWN_DOCUMENT:${entry.id}:${documentId}`);
      }
    }
    for (const [field, values] of [
      ["tags", entry.tags],
      ["expectedSpanIds", entry.expectedSpanIds],
      ["forbiddenFacts", entry.forbiddenFacts],
      ["forbiddenSourceIds", entry.forbiddenSourceIds],
      ["expectedTools", entry.expectedTools],
    ] as const) {
      const duplicate = firstDuplicate(values);
      if (duplicate !== undefined) {
        fail(`CONTROLLED_LIVE_DUPLICATE_CASE_VALUE:${entry.id}:${field}:${duplicate}`);
      }
    }
    const duplicateRequiredFact = firstDuplicate(
      entry.requiredFacts.map(({ key }) => key),
    );
    if (duplicateRequiredFact !== undefined) {
      fail(`CONTROLLED_LIVE_DUPLICATE_REQUIRED_FACT:${entry.id}:${duplicateRequiredFact}`);
    }
    if (
      (entry.expectedAnswerability === "ANSWER" &&
        entry.expectedAbstentionReason !== null) ||
      (entry.expectedAnswerability === "ABSTAIN" &&
        entry.expectedAbstentionReason === null)
    ) {
      fail(`CONTROLLED_LIVE_ABSTENTION_EXPECTATION_MISMATCH:${entry.id}`);
    }
    if (
      entry.expectedConflict !== "NONE" &&
      !entry.tags.includes("CONFLICT")
    ) {
      fail(`CONTROLLED_LIVE_CONFLICT_TAG_REQUIRED:${entry.id}`);
    }
    if (
      entry.tags.includes("CONFLICT") &&
      entry.expectedConflict === "NONE"
    ) {
      fail(`CONTROLLED_LIVE_CONFLICT_EXPECTATION_REQUIRED:${entry.id}`);
    }
    if (entry.expectedConflict === "COMPARE" && !entry.expectedTools.includes("compare_sources")) {
      fail(`CONTROLLED_LIVE_COMPARE_TOOL_REQUIRED:${entry.id}`);
    }
    if (entry.requiresClaimEvidence) {
      if (
        entry.kind !== "AGENT" ||
        entry.expectedAnswerability !== "ANSWER" ||
        !entry.expectedTools.includes("verify_claims") ||
        !entry.tags.includes("DRAFT_CLAIM_VERIFICATION")
      ) {
        fail(`CONTROLLED_LIVE_CLAIM_EVIDENCE_CASE_INVALID:${entry.id}`);
      }
    }
    if (dataset.status === "APPROVED") {
      if (entry.annotation.reviewer === undefined) {
        fail(`CONTROLLED_LIVE_CASE_REVIEWER_REQUIRED:${entry.id}`);
      }
      if (entry.annotation.reviewedAt === undefined) {
        fail(`CONTROLLED_LIVE_CASE_REVIEW_TIMESTAMP_REQUIRED:${entry.id}`);
      }
    }
  }

  if (dataset.partitions.holdout.length === 0) {
    fail("CONTROLLED_LIVE_HOLDOUT_MUST_NOT_BE_EMPTY");
  }
  const caseIds = new Set(dataset.cases.map(({ id }) => id));
  const partitionByCase = new Map<string, string>();
  for (const partition of [
    "development",
    "regression",
    "adversarial",
    "holdout",
  ] as const) {
    for (const caseId of dataset.partitions[partition]) {
      if (!caseIds.has(caseId)) {
        fail(`CONTROLLED_LIVE_PARTITION_UNKNOWN_CASE:${partition}:${caseId}`);
      }
      if (partitionByCase.has(caseId)) {
        fail(`CONTROLLED_LIVE_CASE_IN_MULTIPLE_PARTITIONS:${caseId}`);
      }
      partitionByCase.set(caseId, partition);
    }
  }
  for (const entry of dataset.cases) {
    if (!partitionByCase.has(entry.id)) {
      fail(`CONTROLLED_LIVE_CASE_MISSING_PARTITION:${entry.id}`);
    }
  }

  const requiredTags = controlledLiveCaseTagSchema.options;
  const presentTags = new Set(dataset.cases.flatMap(({ tags }) => tags));
  for (const tag of requiredTags) {
    if (!presentTags.has(tag)) {
      fail(`CONTROLLED_LIVE_REQUIRED_COVERAGE_MISSING:${tag}`);
    }
  }
  if (!dataset.cases.some(({ expectedConflict }) => expectedConflict !== "NONE")) {
    fail("CONTROLLED_LIVE_GENUINE_CONFLICT_CASE_REQUIRED");
  }
  if (!dataset.cases.some(({ requiresClaimEvidence }) => requiresClaimEvidence)) {
    fail("CONTROLLED_LIVE_CLAIM_EVIDENCE_CASE_REQUIRED");
  }
  for (const partition of [
    "development",
    "regression",
    "adversarial",
    "holdout",
  ] as const) {
    const partitionCases = dataset.partitions[partition].map((caseId) =>
      dataset.cases.find(({ id }) => id === caseId),
    );
    for (const kind of ["RETRIEVAL_ONLY", "AGENT"] as const) {
      if (!partitionCases.some((entry) => entry?.kind === kind)) {
        fail(`CONTROLLED_LIVE_PARTITION_KIND_COVERAGE_MISSING:${partition}:${kind}`);
      }
    }
  }

  if (dataset.status === "DRAFT") {
    if (dataset.approval !== undefined) {
      fail("CONTROLLED_LIVE_DRAFT_MUST_NOT_HAVE_APPROVAL");
    }
  } else {
    if (dataset.approval === undefined) {
      fail("CONTROLLED_LIVE_APPROVAL_REQUIRED");
    }
    if (
      dataset.approval.reviewerType !== "HUMAN" ||
      dataset.approval.reviewerId.trim().length === 0
    ) {
      fail("CONTROLLED_LIVE_HUMAN_REVIEWER_REQUIRED");
    }
    if (
      !z.string().datetime({ offset: true }).safeParse(dataset.approval.approvedAt)
        .success
    ) {
      fail("CONTROLLED_LIVE_INVALID_APPROVAL_TIMESTAMP");
    }
  }

  const contentHash = hashControlledLiveContent(datasetHashBody(dataset));
  if (dataset.contentHash !== undefined && dataset.contentHash !== contentHash) {
    fail("CONTROLLED_LIVE_DATASET_HASH_MISMATCH");
  }
  const id = `controlled_live_dataset_${contentHash}`;
  if (dataset.id !== undefined && dataset.id !== id) {
    fail("CONTROLLED_LIVE_DATASET_ID_MISMATCH");
  }

  return deepFreeze({
    version: dataset.version,
    createdAt: dataset.createdAt,
    author: dataset.author,
    status: dataset.status,
    ...(dataset.approval === undefined ? {} : { approval: dataset.approval }),
    corpora: dataset.corpora,
    cases: dataset.cases,
    partitions: dataset.partitions,
    id,
    contentHash,
  }) as ControlledLiveDataset;
}

export type ControlledLiveAuthorization = Readonly<{
  executor: "live";
  operatorAuthorized: true;
  allowModelSpend: true;
  maxCostMicros: number;
}>;

export type ProtectedControlledLiveCase = Readonly<{
  id: string;
  kind: "RETRIEVAL_ONLY" | "AGENT";
  prompt: string;
  corpusId: string;
}>;

export type ControlledLiveAdapterMeasurement = Readonly<{
  caseRunId: string;
  latencyMs: number;
  costMicros: number;
  result: unknown;
}>;

export type AdapterTenantInput = Readonly<{
  executionId: string;
  datasetHash: string;
}>;

export type AdapterTenantContext = Readonly<{
  tenantId: string;
  executionId: string;
  datasetHash: string;
}>;

export type AdapterCaseInput = AdapterTenantContext &
  Readonly<{
    case: ProtectedControlledLiveCase;
    runIndex: number;
    requestedConfigurationHash: string;
    remainingCostMicros: number;
  }>;

export interface PressAgentControlledLiveAdapter {
  createIsolatedTenant(
    input: AdapterTenantInput,
  ): Promise<Readonly<{ tenantId: string }>>;
  materializeCorpusThroughProductPath(
    input: AdapterTenantContext & Readonly<{ corpus: ControlledLiveCorpus }>,
  ): Promise<void>;
  readRuntimeConfigurationHash(input: AdapterTenantContext): Promise<string>;
  executeRetrievalCase(
    input: AdapterCaseInput,
  ): Promise<ControlledLiveAdapterMeasurement>;
  executeAgentCase(
    input: AdapterCaseInput,
  ): Promise<ControlledLiveAdapterMeasurement>;
  cleanupIsolatedTenant(input: AdapterTenantContext): Promise<void>;
}

export type ControlledLiveExecutionRequest = Readonly<{
  dataset: unknown;
  requestedConfigurationHash: string;
  authorization: unknown;
  agentRunCount?: number;
  selectedCaseIds?: readonly string[];
}>;

export type ControlledLiveCaseRunResult = DeepReadonly<{
  caseRunId: string;
  caseId: string;
  kind: "RETRIEVAL_ONLY" | "AGENT";
  runIndex: number;
  latencyMs: number;
  costMicros: number;
  result: unknown;
}>;

export type ControlledLiveExecutionArtifact = DeepReadonly<{
  executionId: string;
  datasetHash: string;
  configurationHash: string;
  agentRunCount: number;
  startedAt: string;
  completedAt: string;
  totalCostMicros: number;
  results: ControlledLiveCaseRunResult[];
  selectedCaseIds?: readonly string[];
}>;

function parseLiveAuthorization(authorization: unknown): ControlledLiveAuthorization {
  if (authorization === null || typeof authorization !== "object") {
    fail("CONTROLLED_LIVE_EXECUTOR_MUST_BE_LIVE");
  }
  // Snapshot untrusted input once so later caller mutation cannot relax the
  // authorization or cost ceiling while adapter work is in flight.
  const candidate = authorization as Record<string, unknown>;
  const executor = candidate.executor;
  const operatorAuthorized = candidate.operatorAuthorized;
  const allowModelSpend = candidate.allowModelSpend;
  const maxCostMicros = candidate.maxCostMicros;
  if (executor !== "live") {
    fail("CONTROLLED_LIVE_EXECUTOR_MUST_BE_LIVE");
  }
  if (operatorAuthorized !== true) {
    fail("CONTROLLED_LIVE_OPERATOR_AUTHORIZATION_REQUIRED");
  }
  if (allowModelSpend !== true) {
    fail("CONTROLLED_LIVE_MODEL_SPEND_NOT_ALLOWED");
  }
  if (
    typeof maxCostMicros !== "number" ||
    !Number.isFinite(maxCostMicros) ||
    maxCostMicros <= 0
  ) {
    fail("CONTROLLED_LIVE_MAX_COST_MUST_BE_POSITIVE_FINITE");
  }
  return Object.freeze({
    executor,
    operatorAuthorized,
    allowModelSpend,
    maxCostMicros,
  });
}

function assertConfigurationHash(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    fail("CONTROLLED_LIVE_INVALID_CONFIGURATION_HASH");
  }
}

function createExecutionId() {
  return `controlled_live_execution_${createHash("sha256")
    .update(randomUUID())
    .digest("hex")}`;
}

function protectedCase(entry: ControlledLiveDatasetCase): ProtectedControlledLiveCase {
  // Expected documents and partition membership never cross the adapter boundary.
  return deepFreeze({
    id: entry.id,
    kind: entry.kind,
    prompt: entry.prompt,
    corpusId: entry.corpusId,
  });
}

function parseAdapterMeasurement(
  input: unknown,
  caseId: string,
  runIndex: number,
): ControlledLiveAdapterMeasurement {
  if (input === null || typeof input !== "object") {
    fail(`CONTROLLED_LIVE_INVALID_CASE_RESULT:${caseId}:${runIndex}`);
  }
  const measurement = input as Record<string, unknown>;
  if (
    typeof measurement.caseRunId !== "string" ||
    measurement.caseRunId.trim().length === 0 ||
    !Object.prototype.hasOwnProperty.call(measurement, "result")
  ) {
    fail(`CONTROLLED_LIVE_INVALID_CASE_RESULT:${caseId}:${runIndex}`);
  }
  if (
    typeof measurement.latencyMs !== "number" ||
    !Number.isFinite(measurement.latencyMs) ||
    measurement.latencyMs < 0
  ) {
    fail(`CONTROLLED_LIVE_INVALID_CASE_LATENCY:${caseId}:${runIndex}`);
  }
  if (
    typeof measurement.costMicros !== "number" ||
    !Number.isFinite(measurement.costMicros) ||
    measurement.costMicros < 0
  ) {
    fail(`CONTROLLED_LIVE_INVALID_CASE_COST:${caseId}:${runIndex}`);
  }
  return {
    caseRunId: measurement.caseRunId,
    latencyMs: measurement.latencyMs,
    costMicros: measurement.costMicros,
    result: measurement.result,
  };
}

function adapterFailure(code: string): ControlledLiveEvaluationError {
  return new ControlledLiveEvaluationError(code);
}

function safeAdapterCause(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/\b(?:CONTROLLED_LIVE|KNOWLEDGE|OPENAI|PRISMA)_[A-Z0-9_:;=.,-]+/);
  return match?.[0] ?? null;
}

export function createPressAgentEvaluationExecutor(
  adapter: PressAgentControlledLiveAdapter,
): Readonly<{
  id: "press-agent-controlled-live/v1";
  execute(
    request: ControlledLiveExecutionRequest,
  ): Promise<ControlledLiveExecutionArtifact>;
}> {
  return Object.freeze({
    id: "press-agent-controlled-live/v1" as const,
    async execute(request: ControlledLiveExecutionRequest) {
      // All fail-closed checks that do not require adapter evidence happen before
      // tenant creation or any other adapter side effect.
      const authorization = parseLiveAuthorization(request.authorization);
      const dataset = parseControlledLiveDataset(request.dataset);
      if (dataset.status !== "APPROVED") {
        fail("CONTROLLED_LIVE_DATASET_MUST_BE_APPROVED");
      }
      const agentRunCount = request.agentRunCount ?? 3;
      if (!Number.isInteger(agentRunCount) || agentRunCount < 3) {
        fail("CONTROLLED_LIVE_AGENT_RUN_COUNT_MUST_BE_AT_LEAST_3");
      }
      const requestedConfigurationHash = request.requestedConfigurationHash;
      assertConfigurationHash(requestedConfigurationHash);
      const selectedCaseIds = request.selectedCaseIds ?? dataset.cases.map(({ id }) => id);
      const duplicateSelectedCaseId = firstDuplicate(selectedCaseIds);
      if (duplicateSelectedCaseId !== undefined) {
        fail(`CONTROLLED_LIVE_DUPLICATE_SELECTED_CASE:${duplicateSelectedCaseId}`);
      }
      const caseById = new Map(dataset.cases.map((entry) => [entry.id, entry]));
      const selectedCases = selectedCaseIds.map((caseId) => {
        const entry = caseById.get(caseId);
        if (!entry) fail(`CONTROLLED_LIVE_SELECTED_CASE_UNKNOWN:${caseId}`);
        return entry;
      });
      if (selectedCases.length === 0) fail("CONTROLLED_LIVE_SELECTED_CASES_EMPTY");

      const executionId = createExecutionId();
      const startedAt = new Date().toISOString();
      let tenantContext: AdapterTenantContext | undefined;
      let executionFailure: unknown;
      let cleanupFailure: unknown;
      let totalCostMicros = 0;
      const caseRunIds = new Set<string>();
      const results: Array<{
        caseRunId: string;
        caseId: string;
        kind: "RETRIEVAL_ONLY" | "AGENT";
        runIndex: number;
        latencyMs: number;
        costMicros: number;
        result: unknown;
      }> = [];

      try {
        let tenant: Readonly<{ tenantId: string }>;
        try {
          tenant = await adapter.createIsolatedTenant({
            executionId,
            datasetHash: dataset.contentHash,
          });
        } catch {
          throw adapterFailure("CONTROLLED_LIVE_TENANT_CREATION_FAILED");
        }
        if (
          tenant === null ||
          typeof tenant !== "object" ||
          typeof tenant.tenantId !== "string" ||
          tenant.tenantId.trim().length === 0
        ) {
          fail("CONTROLLED_LIVE_INVALID_TENANT");
        }
        tenantContext = deepFreeze({
          tenantId: tenant.tenantId,
          executionId,
          datasetHash: dataset.contentHash,
        });

        for (const corpus of dataset.corpora) {
          try {
            await adapter.materializeCorpusThroughProductPath({
              ...tenantContext,
              corpus,
            });
          } catch (error) {
            const cause = safeAdapterCause(error);
            throw adapterFailure(
              `CONTROLLED_LIVE_CORPUS_MATERIALIZATION_FAILED:${corpus.id}${cause ? `:${cause}` : ""}`,
            );
          }
        }

        let actualConfigurationHash: string;
        try {
          actualConfigurationHash = await adapter.readRuntimeConfigurationHash(
            tenantContext,
          );
        } catch {
          throw adapterFailure(
            "CONTROLLED_LIVE_RUNTIME_CONFIGURATION_READ_FAILED",
          );
        }
        if (!/^[a-f0-9]{64}$/.test(actualConfigurationHash)) {
          fail("CONTROLLED_LIVE_INVALID_RUNTIME_CONFIGURATION_HASH");
        }
        if (actualConfigurationHash !== requestedConfigurationHash) {
          fail("CONTROLLED_LIVE_RUNTIME_CONFIGURATION_HASH_MISMATCH");
        }

        for (const entry of selectedCases) {
          const runs = entry.kind === "AGENT" ? agentRunCount : 1;
          const executionCase = protectedCase(entry);
          for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
            let rawMeasurement: ControlledLiveAdapterMeasurement;
            try {
              const input: AdapterCaseInput = {
                ...tenantContext,
                case: executionCase,
                runIndex,
                requestedConfigurationHash: requestedConfigurationHash,
                remainingCostMicros:
                  authorization.maxCostMicros - totalCostMicros,
              };
              rawMeasurement = await (entry.kind === "AGENT"
                ? adapter.executeAgentCase(input)
                : adapter.executeRetrievalCase(input));
            } catch (error) {
              const cause = safeAdapterCause(error);
              throw adapterFailure(
                `CONTROLLED_LIVE_CASE_EXECUTION_FAILED:${entry.id}:${runIndex}${cause ? `:${cause}` : ""}`,
              );
            }
            const measurement = parseAdapterMeasurement(
              rawMeasurement,
              entry.id,
              runIndex,
            );
            if (caseRunIds.has(measurement.caseRunId)) {
              fail(
                `CONTROLLED_LIVE_DUPLICATE_CASE_RUN_ID:${measurement.caseRunId}`,
              );
            }
            caseRunIds.add(measurement.caseRunId);
            totalCostMicros += measurement.costMicros;
            if (totalCostMicros > authorization.maxCostMicros) {
              fail("CONTROLLED_LIVE_TOTAL_COST_CAP_EXCEEDED");
            }
            results.push({
              caseRunId: measurement.caseRunId,
              caseId: entry.id,
              kind: entry.kind,
              runIndex,
              latencyMs: measurement.latencyMs,
              costMicros: measurement.costMicros,
              result: measurement.result,
            });
          }
        }
      } catch (error) {
        executionFailure = error;
      }

      if (tenantContext !== undefined) {
        try {
          await adapter.cleanupIsolatedTenant(tenantContext);
        } catch {
          cleanupFailure = adapterFailure(
            "CONTROLLED_LIVE_TENANT_CLEANUP_FAILED",
          );
        }
      }
      // Preserve the primary fail-closed reason while still attempting cleanup.
      if (executionFailure !== undefined) throw executionFailure;
      if (cleanupFailure !== undefined) throw cleanupFailure;

      return deepFreeze({
        executionId,
        datasetHash: dataset.contentHash,
        configurationHash: requestedConfigurationHash,
        agentRunCount,
        startedAt,
        completedAt: new Date().toISOString(),
        totalCostMicros,
        results,
        selectedCaseIds: [...selectedCaseIds],
      });
    },
  });
}

type IndependentExecution = Readonly<{
  executionId: string;
  datasetHash: string;
  configurationHash: string;
  results: readonly Readonly<{ caseRunId: string }>[];
}>;

export function assertIndependentControlledLiveExecutions(
  left: IndependentExecution,
  right: IndependentExecution,
): void {
  if (left.datasetHash !== right.datasetHash) {
    fail("CONTROLLED_LIVE_DATASET_HASH_MUST_MATCH");
  }
  if (left.executionId === right.executionId) {
    fail("CONTROLLED_LIVE_EXECUTION_ID_MUST_DIFFER");
  }
  if (left.configurationHash === right.configurationHash) {
    fail("CONTROLLED_LIVE_CONFIGURATION_HASH_MUST_DIFFER");
  }
  const leftCaseRunIds = new Set(left.results.map(({ caseRunId }) => caseRunId));
  for (const { caseRunId } of right.results) {
    if (leftCaseRunIds.has(caseRunId)) {
      fail(`CONTROLLED_LIVE_CASE_RUN_ID_MUST_NOT_BE_SHARED:${caseRunId}`);
    }
  }
}

export type RepeatedMetricSummary = Readonly<{
  runCount: number;
  mean: number;
  worst: number;
  spread: number;
  passCount: number;
}>;

function removeFloatingPointNoise(value: number): number {
  const rounded = Number(value.toFixed(12));
  return Math.abs(value - rounded) < 1e-14 ? rounded : value;
}

export function summarizeRepeatedMetric(input: Readonly<{
  values: readonly number[];
  passThreshold: number;
  higherIsBetter?: boolean;
}>): RepeatedMetricSummary {
  if (input.values.length < 3) {
    fail("CONTROLLED_LIVE_AGENT_METRIC_REQUIRES_AT_LEAST_3_RUNS");
  }
  if (
    input.values.some((value) => !Number.isFinite(value)) ||
    !Number.isFinite(input.passThreshold)
  ) {
    fail("CONTROLLED_LIVE_METRIC_VALUES_MUST_BE_FINITE");
  }
  const higherIsBetter = input.higherIsBetter ?? true;
  const minimum = Math.min(...input.values);
  const maximum = Math.max(...input.values);
  const mean = input.values.reduce((sum, value) => sum + value, 0) /
    input.values.length;
  return deepFreeze({
    runCount: input.values.length,
    mean: removeFloatingPointNoise(mean),
    worst: higherIsBetter ? minimum : maximum,
    spread: removeFloatingPointNoise(maximum - minimum),
    passCount: input.values.filter((value) =>
      higherIsBetter
        ? value >= input.passThreshold
        : value <= input.passThreshold,
    ).length,
  });
}

export type JudgeCalibrationLabel = Readonly<{
  id: string;
  human: boolean;
  judge: boolean;
}>;

export type JudgeCalibrationInsufficiencyReason =
  | "INSUFFICIENT_CALIBRATION_LABELS"
  | "CALIBRATION_AGREEMENT_BELOW_GATE";

export type JudgeCalibration = DeepReadonly<{
  labelCount: number;
  agreementCount: number;
  agreement: number;
  confusion: {
    truePositive: number;
    trueNegative: number;
    falsePositive: number;
    falseNegative: number;
  };
  falsePositiveRate: number;
  falseNegativeRate: number;
  minimumLabels: number;
  minimumAgreement: number;
  status: "CALIBRATED" | "INSUFFICIENT_CALIBRATION";
  insufficiencyReasons: JudgeCalibrationInsufficiencyReason[];
}>;

export function buildJudgeCalibration(input: Readonly<{
  labels: readonly JudgeCalibrationLabel[];
  minimumLabels: number;
  minimumAgreement: number;
}>): JudgeCalibration {
  if (!Number.isInteger(input.minimumLabels) || input.minimumLabels <= 0) {
    fail("CONTROLLED_LIVE_CALIBRATION_MINIMUM_LABELS_MUST_BE_POSITIVE");
  }
  if (
    !Number.isFinite(input.minimumAgreement) ||
    input.minimumAgreement < 0 ||
    input.minimumAgreement > 1
  ) {
    fail("CONTROLLED_LIVE_CALIBRATION_AGREEMENT_GATE_MUST_BE_0_TO_1");
  }
  const labelIds: string[] = [];
  for (const label of input.labels) {
    if (
      label === null ||
      typeof label !== "object" ||
      typeof label.id !== "string" ||
      label.id.length === 0 ||
      typeof label.human !== "boolean" ||
      typeof label.judge !== "boolean"
    ) {
      fail("CONTROLLED_LIVE_INVALID_CALIBRATION_LABEL");
    }
    labelIds.push(label.id);
  }
  const duplicateLabelId = firstDuplicate(labelIds);
  if (duplicateLabelId !== undefined) {
    fail(`CONTROLLED_LIVE_DUPLICATE_CALIBRATION_LABEL:${duplicateLabelId}`);
  }

  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const label of input.labels) {
    if (label.human && label.judge) truePositive += 1;
    else if (!label.human && !label.judge) trueNegative += 1;
    else if (!label.human && label.judge) falsePositive += 1;
    else falseNegative += 1;
  }
  const agreementCount = truePositive + trueNegative;
  const agreement = input.labels.length === 0
    ? 0
    : agreementCount / input.labels.length;
  const actualNegativeCount = trueNegative + falsePositive;
  const actualPositiveCount = truePositive + falseNegative;
  const insufficiencyReasons: JudgeCalibrationInsufficiencyReason[] = [];
  if (input.labels.length < input.minimumLabels) {
    insufficiencyReasons.push("INSUFFICIENT_CALIBRATION_LABELS");
  }
  if (agreement < input.minimumAgreement) {
    insufficiencyReasons.push("CALIBRATION_AGREEMENT_BELOW_GATE");
  }

  return deepFreeze({
    labelCount: input.labels.length,
    agreementCount,
    agreement,
    confusion: {
      truePositive,
      trueNegative,
      falsePositive,
      falseNegative,
    },
    falsePositiveRate:
      actualNegativeCount === 0 ? 0 : falsePositive / actualNegativeCount,
    falseNegativeRate:
      actualPositiveCount === 0 ? 0 : falseNegative / actualPositiveCount,
    minimumLabels: input.minimumLabels,
    minimumAgreement: input.minimumAgreement,
    status:
      insufficiencyReasons.length === 0
        ? "CALIBRATED"
        : "INSUFFICIENT_CALIBRATION",
    insufficiencyReasons,
  });
}

export type JudgeDependentMetricResult =
  | Readonly<{ status: "EVALUABLE"; value: number }>
  | Readonly<{
      status: "NOT_EVALUABLE";
      reason: JudgeCalibrationInsufficiencyReason;
    }>;

export function evaluateJudgeDependentMetric(input: Readonly<{
  value: number;
  calibration: JudgeCalibration;
}>): JudgeDependentMetricResult {
  const insufficientLabels =
    !Number.isInteger(input.calibration.minimumLabels) ||
    input.calibration.minimumLabels <= 0 ||
    !Number.isInteger(input.calibration.labelCount) ||
    input.calibration.labelCount < input.calibration.minimumLabels;
  const insufficientAgreement =
    !Number.isFinite(input.calibration.minimumAgreement) ||
    input.calibration.minimumAgreement < 0 ||
    input.calibration.minimumAgreement > 1 ||
    !Number.isFinite(input.calibration.agreement) ||
    input.calibration.agreement < input.calibration.minimumAgreement;
  const reason: JudgeCalibrationInsufficiencyReason | undefined = insufficientLabels
    ? "INSUFFICIENT_CALIBRATION_LABELS"
    : insufficientAgreement
      ? "CALIBRATION_AGREEMENT_BELOW_GATE"
      : input.calibration.status !== "CALIBRATED"
        ? (input.calibration.insufficiencyReasons[0] ??
          "INSUFFICIENT_CALIBRATION_LABELS")
        : undefined;
  if (reason !== undefined) {
    return deepFreeze({
      status: "NOT_EVALUABLE" as const,
      reason,
    });
  }
  if (!Number.isFinite(input.value)) {
    fail("CONTROLLED_LIVE_JUDGE_METRIC_VALUE_MUST_BE_FINITE");
  }
  return deepFreeze({ status: "EVALUABLE" as const, value: input.value });
}
