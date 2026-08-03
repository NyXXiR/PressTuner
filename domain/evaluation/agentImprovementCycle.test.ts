import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AGENT_IMPROVEMENT_CYCLE_VERSION,
  CONTROLLED_REPLAY_GATE_POLICY,
  buildControlledReplayCandidate,
  buildControlledReplayImprovementCycle,
  compareImprovementExperiments,
  deriveImprovementSignals,
  evaluateImprovementReleaseGate,
  parseAgentImprovementCycleArtifact,
  promoteRegressionCandidates,
} from "./agentImprovementCycle";
import {
  parsePressRagFixtures,
  parsePressRagResultArtifact,
} from "./pressRagEvaluation";

const DATASET_PATH = "evals/press-rag/v1/cases.json";
const CORPUS_PATH = "evals/press-rag/v1/corpus.json";
const RESULT_PATH = "evals/press-rag/v1/results-2026-07-23.json";
const GENERATED_PATH =
  "evals/press-rag/improvement/controlled-replay-v1.json";

function loadSources() {
  const fixtures = parsePressRagFixtures({
    dataset: JSON.parse(readFileSync(DATASET_PATH, "utf8")),
    corpus: JSON.parse(readFileSync(CORPUS_PATH, "utf8")),
  });
  const artifact = parsePressRagResultArtifact(
    JSON.parse(readFileSync(RESULT_PATH, "utf8")),
    fixtures,
  );
  return { fixtures, artifact };
}

function buildArtifact() {
  const { fixtures, artifact } = loadSources();
  return buildControlledReplayImprovementCycle({
    fixtures,
    artifact,
    sourcePaths: {
      dataset: DATASET_PATH,
      corpus: CORPUS_PATH,
      result: RESULT_PATH,
    },
  });
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

test("strict parser accepts the generated shape and rejects malformed contracts", () => {
  const valid = buildArtifact();
  assert.equal(
    parseAgentImprovementCycleArtifact(valid).version,
    AGENT_IMPROVEMENT_CYCLE_VERSION,
  );

  for (const mutate of [
    (value: Record<string, unknown>) => (value.version = "wrong"),
    (value: Record<string, unknown>) => (value.extra = true),
    (value: Record<string, any>) => (value.source.extra = true),
    (value: Record<string, unknown>) => (value.generatedAt = "not-a-date"),
    (value: Record<string, any>) =>
      (value.comparison.citationPrecision.delta = Number.NaN),
    (value: Record<string, any>) =>
      value.signals.push(clone(value.signals[0])),
    (value: Record<string, any>) =>
      value.regressionCandidates.push(clone(value.regressionCandidates[0])),
    (value: Record<string, any>) =>
      (value.regressionCandidates[0].sourceSignalIds = ["missing"]),
    (value: Record<string, any>) => value.lifecycle.reverse(),
    (value: Record<string, any>) =>
      (value.comparison.citationPrecision.delta = 0),
    (value: Record<string, any>) =>
      (value.comparison.citationRetention.rate = 1),
    (value: Record<string, any>) =>
      (value.gate.checks[0].status = "FAIL"),
    (value: Record<string, any>) => {
      value.humanReview.state = "APPROVED";
      value.humanReview.decision = "APPROVE";
    },
    (value: Record<string, any>) => (value.deploymentAuthorized = true),
  ]) {
    const invalid = clone(valid) as unknown as Record<string, unknown>;
    mutate(invalid);
    assert.throws(() => parseAgentImprovementCycleArtifact(invalid));
  }
});

test("derives deterministic category signals and promotes case candidates", () => {
  const { artifact } = loadSources();
  const representative = artifact.results.filter(({ caseId }) =>
    ["fact-02", "fact-04", "unknown-03"].includes(caseId),
  );
  const signals = deriveImprovementSignals({
    results: representative,
    sourceArtifactPath: RESULT_PATH,
  });
  assert.deepEqual(
    signals.map(({ caseId, category }) => [caseId, category]),
    [
      ["fact-02", "ungrounded_claim"],
      ["fact-04", "unsupported_citation"],
      ["fact-04", "ungrounded_claim"],
      ["unknown-03", "unsupported_citation"],
    ],
  );
  assert.deepEqual(signals[1].failingItemIndexes, [1, 2]);
  assert.deepEqual(signals[1].citationDocumentIds, [
    "campaign-plan",
    "product-brief",
  ]);

  const allSignals = deriveImprovementSignals({
    results: artifact.results,
    sourceArtifactPath: RESULT_PATH,
  });
  const candidates = promoteRegressionCandidates(allSignals);
  assert.equal(allSignals.length, 27);
  assert.equal(candidates.length, 19);
  assert.ok(
    candidates.every((candidate) =>
      candidate.sourceSignalIds.every((id) =>
        allSignals.some((signal) => signal.id === id),
      ),
    ),
  );
});

test("controlled replay filters only failed output and compares exact counts", () => {
  const { fixtures, artifact } = loadSources();
  const original = clone(artifact.results);
  const first = buildControlledReplayCandidate(artifact.results);
  const second = buildControlledReplayCandidate(artifact.results);
  assert.deepEqual(first, second);
  assert.deepEqual(artifact.results, original);

  for (let index = 0; index < first.length; index += 1) {
    assert.deepEqual(
      first[index].retrievedDocumentIds,
      artifact.results[index].retrievedDocumentIds,
    );
    assert.equal(
      first[index].predictedUnanswerable,
      artifact.results[index].predictedUnanswerable,
    );
    assert.equal(
      first[index].detectedConflict,
      artifact.results[index].detectedConflict,
    );
    assert.ok(first[index].citations.every(({ supported }) => supported));
    assert.ok(first[index].claims.every(({ grounded }) => grounded));
  }

  const comparison = compareImprovementExperiments({
    fixtures,
    baseline: artifact.results,
    candidate: first,
    candidateCostProvenance: "reused_baseline",
  });
  assert.deepEqual(comparison.citationPrecision, {
    baseline: { numerator: 31, denominator: 78, rate: 31 / 78 },
    candidate: { numerator: 31, denominator: 31, rate: 1 },
    delta: 1 - 31 / 78,
  });
  assert.deepEqual(comparison.groundedClaimRate, {
    baseline: { numerator: 20, denominator: 41, rate: 20 / 41 },
    candidate: { numerator: 20, denominator: 20, rate: 1 },
    delta: 1 - 20 / 41,
  });
  assert.deepEqual(comparison.citationRetention, {
    retained: 31,
    baseline: 78,
    rate: 31 / 78,
  });
  assert.deepEqual(comparison.claimRetention, {
    retained: 20,
    baseline: 41,
    rate: 20 / 41,
  });
  assert.deepEqual(comparison.tradeOffs, {
    removedCitations: 47,
    removedClaims: 21,
  });
  assert.deepEqual(comparison.cost, {
    baselineMicros: 36079,
    candidateMicros: 36079,
    deltaMicros: 0,
    increaseRate: 0,
    candidateEvidence: "reused_baseline",
  });
});

test("release gate exposes deletion and missing cost evidence", () => {
  const artifact = buildArtifact();
  const gate = evaluateImprovementReleaseGate(
    artifact.comparison,
    CONTROLLED_REPLAY_GATE_POLICY,
  );
  assert.deepEqual(
    gate.checks.map(({ check, status }) => [check, status]),
    [
      ["citation_quality", "PASS"],
      ["grounding_quality", "PASS"],
      ["citation_retention", "FAIL"],
      ["claim_retention", "FAIL"],
      ["cost_increase", "NOT_EVALUABLE"],
    ],
  );
  assert.equal(gate.automatedDisposition, "REVIEW_REQUIRED");
  assert.equal(gate.deploymentAuthorized, false);

  const healthy = clone(artifact.comparison);
  healthy.citationPrecision.candidate = {
    numerator: 32,
    denominator: 78,
    rate: 32 / 78,
  };
  healthy.citationPrecision.delta = 32 / 78 - 31 / 78;
  healthy.groundedClaimRate.candidate = {
    numerator: 21,
    denominator: 41,
    rate: 21 / 41,
  };
  healthy.groundedClaimRate.delta = 21 / 41 - 20 / 41;
  healthy.citationRetention = { retained: 78, baseline: 78, rate: 1 };
  healthy.claimRetention = { retained: 41, baseline: 41, rate: 1 };
  healthy.tradeOffs = { removedCitations: 0, removedClaims: 0 };
  healthy.cost.candidateEvidence = "independently_measured";
  const passing = evaluateImprovementReleaseGate(
    healthy,
    CONTROLLED_REPLAY_GATE_POLICY,
  );
  assert.ok(passing.checks.every(({ status }) => status === "PASS"));
  assert.equal(passing.automatedDisposition, "PASS");
  assert.equal(passing.deploymentAuthorized, false);
});

test("checked-in artifact parses and is reproducible in memory", () => {
  const checkedIn = JSON.parse(readFileSync(GENERATED_PATH, "utf8"));
  assert.deepEqual(parseAgentImprovementCycleArtifact(checkedIn), buildArtifact());
});
