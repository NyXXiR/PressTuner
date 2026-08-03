import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildPressRagReport,
  parsePressRagFixtures,
  parsePressRagResultArtifact,
  type PressRagMeasuredResult,
} from "./pressRagEvaluation";

function fixture(version: "v1" | "v2" | "v3") {
  return {
    dataset: JSON.parse(
      readFileSync(`evals/press-rag/${version}/cases.json`, "utf8"),
    ),
    corpus: JSON.parse(
      readFileSync(`evals/press-rag/${version}/corpus.json`, "utf8"),
    ),
  };
}

function expectError(action: () => unknown, code: string) {
  assert.throws(action, (error: unknown) => {
    assert.equal(error instanceof Error && error.message, code);
    return true;
  });
}

function legacyResult(caseId: string): PressRagMeasuredResult {
  return {
    caseId,
    retrievedDocumentIds: [],
    citations: [],
    claims: [],
    predictedUnanswerable: false,
    detectedConflict: false,
    latencyMs: 0,
    costMicros: 0,
  };
}

function artifactFor(dataset: { cases: Array<{ id: string }> }): {
  results: PressRagMeasuredResult[];
} {
  return { results: dataset.cases.map(({ id }) => legacyResult(id)) };
}

test("all checked-in dataset/corpus versions pass one validator", () => {
  assert.equal(parsePressRagFixtures(fixture("v1")).dataset.version, "press-rag-v1");
  assert.equal(parsePressRagFixtures(fixture("v2")).dataset.version, "press-rag-v2");
  assert.equal(parsePressRagFixtures(fixture("v3")).dataset.version, "press-rag-v3");
});

test("fixture validation rejects version, identity, reference, and v2 contract errors", () => {
  const v2 = fixture("v2");
  expectError(
    () => parsePressRagFixtures({ ...v2, dataset: { ...v2.dataset, version: "press-rag-v4" } }),
    "EVAL_UNSUPPORTED_DATASET_VERSION",
  );
  expectError(
    () => parsePressRagFixtures({ ...v2, corpus: { ...v2.corpus, version: "press-rag-v4" } }),
    "EVAL_UNSUPPORTED_CORPUS_VERSION",
  );
  expectError(
    () => parsePressRagFixtures({ ...v2, corpus: { ...v2.corpus, version: "press-rag-v1" } }),
    "EVAL_DATASET_CORPUS_VERSION_MISMATCH",
  );
  expectError(
    () => parsePressRagFixtures({ ...v2, dataset: { ...v2.dataset, cases: [...v2.dataset.cases, v2.dataset.cases[0]] } }),
    `EVAL_DATASET_CASE_IDS_MUST_BE_UNIQUE:${v2.dataset.cases[0].id}`,
  );
  expectError(
    () => parsePressRagFixtures({ ...v2, corpus: { ...v2.corpus, documents: [...v2.corpus.documents, v2.corpus.documents[0]] } }),
    `EVAL_CORPUS_DOCUMENT_IDS_MUST_BE_UNIQUE:${v2.corpus.documents[0].id}`,
  );

  const cases = structuredClone(v2.dataset.cases);
  delete cases[0].expectedRoles;
  expectError(
    () => parsePressRagFixtures({ ...v2, dataset: { ...v2.dataset, cases } }),
    `EVAL_V2_EXPECTATIONS_REQUIRED:${cases[0].id}`,
  );

  for (const [field, code] of [
    ["expectedDocumentIds", "EVAL_EXPECTED_DOCUMENT_UNKNOWN"],
    ["excludedDocumentIds", "EVAL_EXCLUDED_DOCUMENT_UNKNOWN"],
  ] as const) {
    const invalid = structuredClone(v2.dataset.cases);
    invalid[0][field] = ["missing-document"];
    expectError(
      () => parsePressRagFixtures({ ...v2, dataset: { ...v2.dataset, cases: invalid } }),
      `${code}:${invalid[0].id}:missing-document`,
    );
  }

  const finalNotRetrieved = structuredClone(v2.dataset.cases);
  finalNotRetrieved[0].expectedFinalDocumentIds = ["fact-results"];
  expectError(
    () => parsePressRagFixtures({ ...v2, dataset: { ...v2.dataset, cases: finalNotRetrieved } }),
    `EVAL_V2_FINAL_SOURCE_NOT_RETRIEVED:${finalNotRetrieved[0].id}:fact-results`,
  );

  const nonFactFinal = structuredClone(v2.dataset.cases);
  nonFactFinal[0].expectedDocumentIds = ["policy-house"];
  nonFactFinal[0].expectedFinalDocumentIds = ["policy-house"];
  expectError(
    () => parsePressRagFixtures({ ...v2, dataset: { ...v2.dataset, cases: nonFactFinal } }),
    `EVAL_V2_FINAL_SOURCE_MUST_BE_FACT:${nonFactFinal[0].id}:policy-house`,
  );
});

test("artifact coverage errors are distinct and duplicates fail first", () => {
  const parsed = parsePressRagFixtures(fixture("v1"));
  const valid = artifactFor(parsed.dataset);
  const duplicate = structuredClone(valid);
  duplicate.results[1].caseId = duplicate.results[0].caseId;
  expectError(
    () => parsePressRagResultArtifact(duplicate, parsed),
    `EVAL_RESULT_CASE_IDS_MUST_BE_UNIQUE:${duplicate.results[0].caseId}`,
  );
  expectError(
    () => parsePressRagResultArtifact({ results: valid.results.slice(1) }, parsed),
    `EVAL_MISSING_CASE:${valid.results[0].caseId}`,
  );
  const unknown = structuredClone(valid);
  unknown.results[0].caseId = "unknown";
  expectError(
    () => parsePressRagResultArtifact(unknown, parsed),
    "EVAL_UNKNOWN_CASE:unknown",
  );
  assert.equal(
    parsePressRagResultArtifact({ results: [...valid.results].reverse() }, parsed).results.length,
    30,
  );
});

test("artifact validation rejects invalid measurements, versions, identities, and duplicate IDs", () => {
  const parsed = parsePressRagFixtures(fixture("v1"));
  const valid = artifactFor(parsed.dataset);
  for (const [field, value, code] of [
    ["latencyMs", Number.NaN, "EVAL_INVALID_LATENCY_MS"],
    ["latencyMs", Number.POSITIVE_INFINITY, "EVAL_INVALID_LATENCY_MS"],
    ["latencyMs", -1, "EVAL_INVALID_LATENCY_MS"],
    ["costMicros", Number.NEGATIVE_INFINITY, "EVAL_INVALID_COST_MICROS"],
    ["costMicros", -1, "EVAL_INVALID_COST_MICROS"],
  ] as const) {
    const artifact = structuredClone(valid);
    artifact.results[0][field] = value;
    expectError(
      () => parsePressRagResultArtifact(artifact, parsed),
      `${code}:${artifact.results[0].caseId}`,
    );
  }
  expectError(
    () => parsePressRagResultArtifact({ ...valid, datasetVersion: "press-rag-v2" }, parsed),
    "EVAL_RESULT_DATASET_VERSION_MISMATCH",
  );
  expectError(
    () => parsePressRagResultArtifact({ ...valid, corpusVersion: "press-rag-v2" }, parsed),
    "EVAL_RESULT_CORPUS_VERSION_MISMATCH",
  );
  expectError(
    () => parsePressRagResultArtifact({ ...valid, promptVersion: "" }, parsed),
    "EVAL_INVALID_RESULT_ARTIFACT",
  );
  const duplicateIds = structuredClone(valid);
  duplicateIds.results[0].retrievedDocumentIds = ["x", "x"];
  expectError(
    () => parsePressRagResultArtifact(duplicateIds, parsed),
    `EVAL_RESULT_ID_ARRAY_MUST_BE_UNIQUE:${duplicateIds.results[0].caseId}:retrievedDocumentIds:x`,
  );
  const malformedOptional = structuredClone(valid) as unknown as {
    results: Array<Record<string, unknown>>;
  };
  malformedOptional.results[0].usedRoles = ["NOT_A_ROLE"];
  expectError(
    () => parsePressRagResultArtifact(malformedOptional, parsed),
    "EVAL_INVALID_RESULT_ARTIFACT",
  );
});

test("reports preserve experiment identity and deterministic measurement time", () => {
  const fixtures = parsePressRagFixtures(fixture("v1"));
  const artifact = {
    ...artifactFor(fixtures.dataset),
    model: "model-a",
    judgeModel: "judge-a",
    promptVersion: "prompt-a",
    retrievalVersion: "retrieval-a",
    toolsetVersion: "tools-a",
    configVersion: "config-a",
    collectedAt: "2026-08-01T00:00:00Z",
  };
  const report = buildPressRagReport({ fixtures, artifact, measuredAt: "2026-08-03T00:00:00Z" });
  assert.deepEqual(
    Object.fromEntries(Object.keys(artifact).filter((key) => key !== "results").map((key) => [key, report[key as keyof typeof report]])),
    Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== "results")),
  );
  assert.equal(report.datasetVersion, "press-rag-v1");
  assert.equal(report.corpusVersion, "press-rag-v1");
  assert.equal(report.measuredAt, "2026-08-03T00:00:00Z");
  assert.equal("v2Metrics" in report, false);
});

test("v2 metrics score complete, partial, empty, and adversarial observations", () => {
  const fixtures = parsePressRagFixtures(fixture("v2"));
  const complete = artifactFor(fixtures.dataset);
  complete.results = fixtures.dataset.cases.map((entry) => ({
    ...legacyResult(entry.id),
    retrievedDocumentIds: entry.expectedDocumentIds,
    usedRoles: entry.expectedRoles!,
    acceptedCandidateIds: entry.acceptedCandidateIds!,
    usedDocumentIds: entry.expectedFinalDocumentIds!,
    finalDocumentIds: entry.expectedFinalDocumentIds!,
    predictedVerification: entry.expectedVerification!,
  }));
  const full = buildPressRagReport({ fixtures, artifact: complete, measuredAt: "now" });
  assert.ok(full.v2Metrics);
  for (const metric of Object.values(full.v2Metrics)) {
    assert.deepEqual(metric, {
      eligibleCaseCount: 30,
      measuredCaseCount: 30,
      passedCaseCount: 30,
      coverage: 1,
      score: 1,
    });
  }

  const partial = artifactFor(fixtures.dataset);
  partial.results[0].usedRoles = [];
  partial.results[0].acceptedCandidateIds = [];
  const partialReport = buildPressRagReport({ fixtures, artifact: partial, measuredAt: "now" });
  assert.deepEqual(partialReport.v2Metrics?.roleIsolation, {
    eligibleCaseCount: 30,
    measuredCaseCount: 1,
    passedCaseCount: 0,
    coverage: 1 / 30,
    score: 0,
  });
  assert.equal(partialReport.v2Metrics?.excludedSourceAvoidance.score, null);
  assert.equal(partialReport.v2Metrics?.excludedSourceAvoidance.coverage, 0);

  const measuredEmpty = artifactFor(fixtures.dataset);
  measuredEmpty.results[2].acceptedCandidateIds = [];
  assert.deepEqual(
    buildPressRagReport({ fixtures, artifact: measuredEmpty, measuredAt: "now" })
      .v2Metrics?.candidateAcceptance,
    {
      eligibleCaseCount: 30,
      measuredCaseCount: 1,
      passedCaseCount: 1,
      coverage: 1 / 30,
      score: 1,
    },
  );

  const adversarial = structuredClone(complete);
  adversarial.results[0].usedDocumentIds = [fixtures.dataset.cases[0].excludedDocumentIds![0]];
  adversarial.results[1].finalDocumentIds = ["policy-house"];
  adversarial.results[2].finalDocumentIds = ["fact-results"];
  adversarial.results[3].acceptedCandidateIds = ["extra"];
  adversarial.results[4].finalDocumentIds = ["extra"];
  adversarial.results[5].predictedVerification = "BLOCK";
  adversarial.results[8].acceptedCandidateIds = [];
  adversarial.results[8].finalDocumentIds = [];
  const failed = buildPressRagReport({ fixtures, artifact: adversarial, measuredAt: "now" });
  assert.equal(failed.v2Metrics?.excludedSourceAvoidance.passedCaseCount, 29);
  assert.equal(failed.v2Metrics?.finalEvidenceEligibility.passedCaseCount, 27);
  assert.equal(failed.v2Metrics?.candidateAcceptance.passedCaseCount, 28);
  assert.equal(failed.v2Metrics?.finalDocumentSelection.passedCaseCount, 26);
  assert.equal(failed.v2Metrics?.verificationSeverityAccuracy.passedCaseCount, 29);
});
