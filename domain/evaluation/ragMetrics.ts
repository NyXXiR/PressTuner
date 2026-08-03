export type RagEvaluationResult = {
  caseId: string;
  expectedDocumentIds: string[];
  retrievedDocumentIds: string[];
  citations: Array<{ documentId: string; supported: boolean }>;
  claims: Array<{ grounded: boolean }>;
  expectedUnanswerable: boolean;
  predictedUnanswerable: boolean;
  expectedConflict: boolean;
  detectedConflict: boolean;
  latencyMs: number;
  costMicros: number;
};

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function nullableRatio(numerator: number, denominator: number) {
  return denominator === 0 ? null : numerator / denominator;
}

export function percentile(values: number[], quantile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.max(0, Math.min(1, quantile)) * (sorted.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;
  return (
    sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight
  );
}

export function calculateRagMetrics(results: RagEvaluationResult[]) {
  const answerable = results.filter(
    (result) => result.expectedDocumentIds.length > 0,
  );
  const retrievalRecallAt5 = ratio(
    answerable.reduce((sum, result) => {
      const topFive = new Set(result.retrievedDocumentIds.slice(0, 5));
      const matches = result.expectedDocumentIds.filter((documentId) =>
        topFive.has(documentId),
      ).length;
      return sum + ratio(matches, result.expectedDocumentIds.length);
    }, 0),
    answerable.length,
  );
  const citations = results.flatMap((result) => result.citations);
  const claims = results.flatMap((result) => result.claims);
  const supportedCitationCount = citations.filter(
    (citation) => citation.supported,
  ).length;
  const groundedClaimCount = claims.filter((claim) => claim.grounded).length;

  return {
    caseCount: results.length,
    retrievalRecallAt5,
    citationPrecision: nullableRatio(supportedCitationCount, citations.length),
    supportedCitationCount,
    citationCount: citations.length,
    groundedClaimRate: nullableRatio(groundedClaimCount, claims.length),
    groundedClaimCount,
    claimCount: claims.length,
    unanswerableAccuracy: ratio(
      results.filter(
        (result) =>
          result.expectedUnanswerable === result.predictedUnanswerable,
      ).length,
      results.length,
    ),
    conflictDetectionAccuracy: ratio(
      results.filter(
        (result) => result.expectedConflict === result.detectedConflict,
      ).length,
      results.length,
    ),
    p50LatencyMs: percentile(
      results.map((result) => result.latencyMs),
      0.5,
    ),
    p95LatencyMs: percentile(
      results.map((result) => result.latencyMs),
      0.95,
    ),
    totalCostMicros: results.reduce(
      (sum, result) => sum + result.costMicros,
      0,
    ),
  };
}
