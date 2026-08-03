import { z } from "zod";

import {
  calculateRagMetrics,
  type RagEvaluationResult,
} from "./ragMetrics";

export const PRESS_RAG_VERSIONS = [
  "press-rag-v1",
  "press-rag-v2",
  "press-rag-v3",
] as const;
export const PRESS_RAG_ROLES = [
  "FACT",
  "STYLE_POLICY",
  "STYLE_EXAMPLE",
  "IGNORE",
] as const;
export const PRESS_RAG_VERIFICATION_SEVERITIES = [
  "PASS",
  "WARN",
  "BLOCK",
] as const;

export type PressRagVersion = (typeof PRESS_RAG_VERSIONS)[number];
export type PressRagRole = (typeof PRESS_RAG_ROLES)[number];
export type PressRagVerificationSeverity =
  (typeof PRESS_RAG_VERIFICATION_SEVERITIES)[number];

const nonEmptyString = z.string().min(1);
const uniqueStringArray = z.array(nonEmptyString);
const roleSchema = z.enum(PRESS_RAG_ROLES);
const verificationSchema = z.enum(PRESS_RAG_VERIFICATION_SEVERITIES);

const datasetCaseSchema = z
  .object({
    id: nonEmptyString,
    question: z.string(),
    expectedDocumentIds: uniqueStringArray,
    expectedUnanswerable: z.boolean(),
    expectedConflict: z.boolean(),
    scenario: z
      .enum(["ROLE_ISOLATION", "ACCEPTANCE", "VERIFICATION", "CITATION"])
      .optional(),
    expectedRoles: z.array(roleSchema).optional(),
    acceptedCandidateIds: uniqueStringArray.optional(),
    excludedDocumentIds: uniqueStringArray.optional(),
    expectedFinalDocumentIds: uniqueStringArray.optional(),
    expectedVerification: verificationSchema.optional(),
  })
  .passthrough();

const datasetSchema = z
  .object({
    version: z.string(),
    cases: z.array(datasetCaseSchema),
  })
  .passthrough();

const corpusDocumentSchema = z
  .object({
    id: nonEmptyString,
    title: z.string(),
    content: z.string(),
    role: roleSchema.optional(),
  })
  .passthrough();

const corpusSchema = z
  .object({
    version: z.string(),
    documents: z.array(corpusDocumentSchema),
  })
  .passthrough();

const citationSchema = z
  .object({ documentId: nonEmptyString, supported: z.boolean() })
  .strict();
const claimSchema = z.object({ grounded: z.boolean() }).strict();

const measuredResultSchema = z
  .object({
    caseId: nonEmptyString,
    retrievedDocumentIds: uniqueStringArray,
    citations: z.array(citationSchema),
    claims: z.array(claimSchema),
    predictedUnanswerable: z.boolean(),
    detectedConflict: z.boolean(),
    latencyMs: z.unknown(),
    costMicros: z.unknown(),
    usedRoles: z.array(roleSchema).optional(),
    acceptedCandidateIds: uniqueStringArray.optional(),
    usedDocumentIds: uniqueStringArray.optional(),
    finalDocumentIds: uniqueStringArray.optional(),
    predictedVerification: verificationSchema.optional(),
  })
  .passthrough();

const resultArtifactSchema = z
  .object({
    datasetVersion: nonEmptyString.optional(),
    corpusVersion: nonEmptyString.optional(),
    model: nonEmptyString.optional(),
    judgeModel: nonEmptyString.optional(),
    promptVersion: nonEmptyString.optional(),
    retrievalVersion: nonEmptyString.optional(),
    toolsetVersion: nonEmptyString.optional(),
    configVersion: nonEmptyString.optional(),
    collectedAt: nonEmptyString.optional(),
    results: z.array(measuredResultSchema),
  })
  .strict();

export type PressRagDatasetCase = z.infer<typeof datasetCaseSchema>;
export type PressRagDataset = z.infer<typeof datasetSchema> & {
  version: PressRagVersion;
};
export type PressRagCorpusDocument = z.infer<typeof corpusDocumentSchema>;
export type PressRagCorpus = z.infer<typeof corpusSchema> & {
  version: PressRagVersion;
};
export type PressRagMeasuredResult = z.infer<typeof measuredResultSchema> & {
  latencyMs: number;
  costMicros: number;
};
export type PressRagResultArtifact = Omit<
  z.infer<typeof resultArtifactSchema>,
  "results"
> & { results: PressRagMeasuredResult[] };

export type PressRagFixtures = {
  dataset: PressRagDataset;
  corpus: PressRagCorpus;
};

export type V2MetricSummary = {
  eligibleCaseCount: number;
  measuredCaseCount: number;
  passedCaseCount: number;
  coverage: number;
  score: number | null;
};

export type PressRagV2Metrics = {
  roleIsolation: V2MetricSummary;
  candidateAcceptance: V2MetricSummary;
  excludedSourceAvoidance: V2MetricSummary;
  finalDocumentSelection: V2MetricSummary;
  finalEvidenceEligibility: V2MetricSummary;
  verificationSeverityAccuracy: V2MetricSummary;
};

export type PressRagReport = Omit<PressRagResultArtifact, "results"> & {
  datasetVersion: PressRagVersion;
  corpusVersion: PressRagVersion;
  measuredAt: string;
  metrics: ReturnType<typeof calculateRagMetrics>;
  v2Metrics?: PressRagV2Metrics;
};

function fail(code: string): never {
  throw new Error(code);
}

function parseWithCode<T>(schema: z.ZodType<T>, value: unknown, code: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) fail(code);
  return parsed.data;
}

function supportedVersion(value: string, kind: "DATASET" | "CORPUS") {
  if (!(PRESS_RAG_VERSIONS as readonly string[]).includes(value)) {
    fail(`EVAL_UNSUPPORTED_${kind}_VERSION`);
  }
  return value as PressRagVersion;
}

function firstDuplicate(values: string[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}

function requireUnique(
  values: string[],
  code: string,
  suffix = "",
) {
  const duplicate = firstDuplicate(values);
  if (duplicate !== undefined) fail(`${code}${suffix}:${duplicate}`);
}

export function parsePressRagFixtures(input: {
  dataset: unknown;
  corpus: unknown;
}): PressRagFixtures {
  const datasetValue = parseWithCode(
    datasetSchema,
    input.dataset,
    "EVAL_INVALID_DATASET",
  );
  const corpusValue = parseWithCode(
    corpusSchema,
    input.corpus,
    "EVAL_INVALID_CORPUS",
  );
  const datasetVersion = supportedVersion(datasetValue.version, "DATASET");
  const corpusVersion = supportedVersion(corpusValue.version, "CORPUS");

  requireUnique(
    datasetValue.cases.map(({ id }) => id),
    "EVAL_DATASET_CASE_IDS_MUST_BE_UNIQUE",
  );
  requireUnique(
    corpusValue.documents.map(({ id }) => id),
    "EVAL_CORPUS_DOCUMENT_IDS_MUST_BE_UNIQUE",
  );
  if (datasetValue.cases.length < 30 || datasetValue.cases.length > 50) {
    fail("EVAL_DATASET_CASE_COUNT_MUST_BE_30_TO_50");
  }
  if (datasetVersion !== corpusVersion) {
    fail("EVAL_DATASET_CORPUS_VERSION_MISMATCH");
  }

  const documentById = new Map(
    corpusValue.documents.map((document) => [document.id, document]),
  );
  for (const entry of datasetValue.cases) {
    requireUnique(
      entry.expectedDocumentIds,
      "EVAL_DATASET_ID_ARRAY_MUST_BE_UNIQUE",
      `:${entry.id}:expectedDocumentIds`,
    );
    for (const documentId of entry.expectedDocumentIds) {
      if (!documentById.has(documentId)) {
        fail(`EVAL_EXPECTED_DOCUMENT_UNKNOWN:${entry.id}:${documentId}`);
      }
    }

    if (datasetVersion === "press-rag-v1") continue;
    if (
      entry.scenario === undefined ||
      entry.expectedRoles === undefined ||
      entry.acceptedCandidateIds === undefined ||
      entry.excludedDocumentIds === undefined ||
      entry.expectedFinalDocumentIds === undefined ||
      entry.expectedVerification === undefined
    ) {
      fail(`EVAL_V2_EXPECTATIONS_REQUIRED:${entry.id}`);
    }
    requireUnique(
      entry.expectedRoles,
      "EVAL_DATASET_ROLE_ARRAY_MUST_BE_UNIQUE",
      `:${entry.id}:expectedRoles`,
    );
    for (const field of [
      "acceptedCandidateIds",
      "excludedDocumentIds",
      "expectedFinalDocumentIds",
    ] as const) {
      requireUnique(
        entry[field]!,
        "EVAL_DATASET_ID_ARRAY_MUST_BE_UNIQUE",
        `:${entry.id}:${field}`,
      );
    }
    for (const documentId of entry.excludedDocumentIds) {
      if (!documentById.has(documentId)) {
        fail(`EVAL_EXCLUDED_DOCUMENT_UNKNOWN:${entry.id}:${documentId}`);
      }
    }
    for (const documentId of entry.expectedFinalDocumentIds) {
      if (!entry.expectedDocumentIds.includes(documentId)) {
        fail(`EVAL_V2_FINAL_SOURCE_NOT_RETRIEVED:${entry.id}:${documentId}`);
      }
      if (documentById.get(documentId)?.role !== "FACT") {
        fail(`EVAL_V2_FINAL_SOURCE_MUST_BE_FACT:${entry.id}:${documentId}`);
      }
    }
  }

  if (
    datasetVersion === "press-rag-v2" &&
    corpusValue.documents.some((document) => document.role === undefined)
  ) {
    fail("EVAL_V2_CORPUS_ROLE_REQUIRED");
  }

  return {
    dataset: { ...datasetValue, version: datasetVersion },
    corpus: { ...corpusValue, version: corpusVersion },
  };
}

const measuredIdArrayFields = [
  "retrievedDocumentIds",
  "acceptedCandidateIds",
  "usedDocumentIds",
  "finalDocumentIds",
] as const;

export function parsePressRagResultArtifact(
  input: unknown,
  fixtures: PressRagFixtures,
): PressRagResultArtifact {
  const artifact = parseWithCode(
    resultArtifactSchema,
    input,
    "EVAL_INVALID_RESULT_ARTIFACT",
  );
  if (
    artifact.datasetVersion !== undefined &&
    artifact.datasetVersion !== fixtures.dataset.version
  ) {
    fail("EVAL_RESULT_DATASET_VERSION_MISMATCH");
  }
  if (
    artifact.corpusVersion !== undefined &&
    artifact.corpusVersion !== fixtures.corpus.version
  ) {
    fail("EVAL_RESULT_CORPUS_VERSION_MISMATCH");
  }

  const duplicateCaseId = firstDuplicate(
    artifact.results.map(({ caseId }) => caseId),
  );
  if (duplicateCaseId !== undefined) {
    fail(`EVAL_RESULT_CASE_IDS_MUST_BE_UNIQUE:${duplicateCaseId}`);
  }
  const expectedIds = new Set(fixtures.dataset.cases.map(({ id }) => id));
  const actualIds = new Set(artifact.results.map(({ caseId }) => caseId));
  const unknown = [...actualIds].filter((id) => !expectedIds.has(id)).sort();
  if (unknown.length) fail(`EVAL_UNKNOWN_CASE:${unknown.join(",")}`);
  const missing = [...expectedIds].filter((id) => !actualIds.has(id)).sort();
  if (missing.length) fail(`EVAL_MISSING_CASE:${missing.join(",")}`);

  for (const result of artifact.results) {
    if (
      typeof result.latencyMs !== "number" ||
      !Number.isFinite(result.latencyMs) ||
      result.latencyMs < 0
    ) {
      fail(`EVAL_INVALID_LATENCY_MS:${result.caseId}`);
    }
    if (
      typeof result.costMicros !== "number" ||
      !Number.isFinite(result.costMicros) ||
      result.costMicros < 0
    ) {
      fail(`EVAL_INVALID_COST_MICROS:${result.caseId}`);
    }
    for (const field of measuredIdArrayFields) {
      const values = result[field];
      if (values !== undefined) {
        requireUnique(
          values,
          "EVAL_RESULT_ID_ARRAY_MUST_BE_UNIQUE",
          `:${result.caseId}:${field}`,
        );
      }
    }
    if (result.usedRoles !== undefined) {
      requireUnique(
        result.usedRoles,
        "EVAL_RESULT_ROLE_ARRAY_MUST_BE_UNIQUE",
        `:${result.caseId}:usedRoles`,
      );
    }
  }

  return artifact as PressRagResultArtifact;
}

function sameSet(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}

function summarize(outcomes: Array<boolean | undefined>): V2MetricSummary {
  const measured = outcomes.filter(
    (outcome): outcome is boolean => outcome !== undefined,
  );
  const passedCaseCount = measured.filter(Boolean).length;
  return {
    eligibleCaseCount: outcomes.length,
    measuredCaseCount: measured.length,
    passedCaseCount,
    coverage: outcomes.length === 0 ? 0 : measured.length / outcomes.length,
    score: measured.length === 0 ? null : passedCaseCount / measured.length,
  };
}

function calculateV2Metrics(
  fixtures: PressRagFixtures,
  results: PressRagMeasuredResult[],
): PressRagV2Metrics {
  const resultById = new Map(results.map((result) => [result.caseId, result]));
  const documentById = new Map(
    fixtures.corpus.documents.map((document) => [document.id, document]),
  );
  const cases = fixtures.dataset.cases;

  return {
    roleIsolation: summarize(
      cases.map((entry) => {
        const actual = resultById.get(entry.id)?.usedRoles;
        return actual === undefined
          ? undefined
          : sameSet(actual, entry.expectedRoles ?? []);
      }),
    ),
    candidateAcceptance: summarize(
      cases.map((entry) => {
        const actual = resultById.get(entry.id)?.acceptedCandidateIds;
        return actual === undefined
          ? undefined
          : sameSet(actual, entry.acceptedCandidateIds ?? []);
      }),
    ),
    excludedSourceAvoidance: summarize(
      cases.map((entry) => {
        const actual = resultById.get(entry.id)?.usedDocumentIds;
        return actual === undefined
          ? undefined
          : actual.every(
              (documentId) =>
                !(entry.excludedDocumentIds ?? []).includes(documentId),
            );
      }),
    ),
    finalDocumentSelection: summarize(
      cases.map((entry) => {
        const actual = resultById.get(entry.id)?.finalDocumentIds;
        return actual === undefined
          ? undefined
          : sameSet(actual, entry.expectedFinalDocumentIds ?? []);
      }),
    ),
    finalEvidenceEligibility: summarize(
      cases.map((entry) => {
        const result = resultById.get(entry.id);
        const actual = result?.finalDocumentIds;
        return actual === undefined
          ? undefined
          : actual.every(
              (documentId) =>
                result!.retrievedDocumentIds.includes(documentId) &&
                documentById.get(documentId)?.role === "FACT",
            );
      }),
    ),
    verificationSeverityAccuracy: summarize(
      cases.map((entry) => {
        const actual = resultById.get(entry.id)?.predictedVerification;
        return actual === undefined
          ? undefined
          : actual === entry.expectedVerification;
      }),
    ),
  };
}

export function buildPressRagReport(input: {
  fixtures: PressRagFixtures;
  artifact: unknown;
  measuredAt?: string;
}): PressRagReport {
  const artifact = parsePressRagResultArtifact(input.artifact, input.fixtures);
  const expectedById = new Map(
    input.fixtures.dataset.cases.map((entry) => [entry.id, entry]),
  );
  const legacyResults: RagEvaluationResult[] = artifact.results.map((result) => {
    const expected = expectedById.get(result.caseId)!;
    return {
      caseId: result.caseId,
      expectedDocumentIds: expected.expectedDocumentIds,
      retrievedDocumentIds: result.retrievedDocumentIds,
      citations: result.citations,
      claims: result.claims,
      expectedUnanswerable: expected.expectedUnanswerable,
      predictedUnanswerable: result.predictedUnanswerable,
      expectedConflict: expected.expectedConflict,
      detectedConflict: result.detectedConflict,
      latencyMs: result.latencyMs,
      costMicros: result.costMicros,
    };
  });
  const identity = {
    ...(artifact.model === undefined ? {} : { model: artifact.model }),
    ...(artifact.judgeModel === undefined
      ? {}
      : { judgeModel: artifact.judgeModel }),
    ...(artifact.promptVersion === undefined
      ? {}
      : { promptVersion: artifact.promptVersion }),
    ...(artifact.retrievalVersion === undefined
      ? {}
      : { retrievalVersion: artifact.retrievalVersion }),
    ...(artifact.toolsetVersion === undefined
      ? {}
      : { toolsetVersion: artifact.toolsetVersion }),
    ...(artifact.configVersion === undefined
      ? {}
      : { configVersion: artifact.configVersion }),
    ...(artifact.collectedAt === undefined
      ? {}
      : { collectedAt: artifact.collectedAt }),
  };
  const report: PressRagReport = {
    ...identity,
    datasetVersion: input.fixtures.dataset.version,
    corpusVersion: input.fixtures.corpus.version,
    measuredAt: input.measuredAt ?? new Date().toISOString(),
    metrics: calculateRagMetrics(legacyResults),
  };
  if (input.fixtures.dataset.version === "press-rag-v2") {
    report.v2Metrics = calculateV2Metrics(input.fixtures, artifact.results);
  }
  return report;
}
