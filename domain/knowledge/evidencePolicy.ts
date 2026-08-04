import { createHash } from "node:crypto";

export type EvidenceCandidate = {
  sourceId: string;
  documentId: string;
  sourceVersion: number;
  content: string;
  fusedScore: number;
};

export type EvidenceAssertion = {
  key: string;
  normalizedValue: string;
  sourceId: string;
  documentId: string;
  sourceVersion: number;
  verifiedSpan: string;
};

export type EvidenceReasonCode =
  | "NO_SELECTED_EVIDENCE"
  | "BELOW_MINIMUM_SCORE"
  | "EVIDENCE_TOO_SHORT"
  | "NUMERIC_SPAN_MISSING"
  | "DOCUMENT_DIVERSITY_MISSING"
  | "SOURCE_COUNT_MISSING";

export type EvidenceConflict = {
  key: string;
  sourceIds: string[];
  values: string[];
  resolution: "NEWEST_SAME_DOCUMENT" | "UNRESOLVED_CROSS_DOCUMENT";
  winningSourceId?: string;
};

export type EvidenceRequirement = {
  minimumSources: number;
  minimumDistinctDocuments: number;
  requiresNumericSpan: boolean;
};

export const DEFAULT_EVIDENCE_POLICY = Object.freeze({
  version: "press-evidence-policy-v1",
  minimumFusedScore: 0.01,
  minimumEvidenceChars: 24,
  sameDocumentConflictResolution: "NEWEST_SOURCE_VERSION" as const,
});

function normalizedText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, canonical(entry)]),
  );
}

function inputHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export function buildEvidenceRequirement(query: string): EvidenceRequirement {
  const normalized = normalizedText(query).toLocaleLowerCase("ko-KR");
  const isComparison =
    /비교|차이|대비|대조|versus|\bvs\.?\b/.test(normalized);
  const requiresNumericSpan =
    /얼마|몇\s*(?:개|명|건|년|월|일)?|매출|금액|수치|비율|퍼센트|%|증가율|감소율/.test(
      normalized,
    );
  return {
    minimumSources: 1,
    minimumDistinctDocuments: isComparison ? 2 : 1,
    requiresNumericSpan,
  };
}

function assertionsByFact(assertions: readonly EvidenceAssertion[]) {
  const groups = new Map<string, EvidenceAssertion[]>();
  for (const assertion of assertions) {
    const group = groups.get(assertion.key) ?? [];
    group.push(assertion);
    groups.set(assertion.key, group);
  }
  return groups;
}

function assertAssertionLineage(
  assertion: EvidenceAssertion,
  candidateBySourceId: ReadonlyMap<string, EvidenceCandidate>,
) {
  const source = candidateBySourceId.get(assertion.sourceId);
  if (
    !source ||
    source.documentId !== assertion.documentId ||
    source.sourceVersion !== assertion.sourceVersion ||
    !normalizedText(source.content).includes(normalizedText(assertion.verifiedSpan)) ||
    !normalizedText(assertion.verifiedSpan).includes(
      normalizedText(assertion.normalizedValue),
    )
  ) {
    throw new Error(`EVIDENCE_ASSERTION_SPAN_INVALID:${assertion.sourceId}`);
  }
}

function evaluateConflicts(args: {
  assertions: readonly EvidenceAssertion[];
  candidates: readonly EvidenceCandidate[];
}) {
  const candidateBySourceId = new Map(
    args.candidates.map((candidate) => [candidate.sourceId, candidate]),
  );
  for (const assertion of args.assertions) {
    assertAssertionLineage(assertion, candidateBySourceId);
  }

  const conflicts: EvidenceConflict[] = [];
  const supersededSourceIds = new Set<string>();
  let hasUnresolvedConflict = false;
  for (const [key, group] of assertionsByFact(args.assertions)) {
    const uniqueValues = [...new Set(group.map((item) => item.normalizedValue))];
    if (uniqueValues.length <= 1) continue;
    const documentIds = new Set(group.map((item) => item.documentId));
    const sourceIds = group.map((item) => item.sourceId);
    if (documentIds.size === 1) {
      const ranked = [...group].sort(
        (a, b) => b.sourceVersion - a.sourceVersion,
      );
      const winner = ranked[0];
      const tiedNewest = ranked.filter(
        (item) => item.sourceVersion === winner.sourceVersion,
      );
      if (
        new Set(tiedNewest.map((item) => item.normalizedValue)).size > 1
      ) {
        hasUnresolvedConflict = true;
        conflicts.push({
          key,
          sourceIds,
          values: uniqueValues,
          resolution: "UNRESOLVED_CROSS_DOCUMENT",
        });
        continue;
      }
      for (const item of group) {
        if (item.sourceId !== winner.sourceId) {
          supersededSourceIds.add(item.sourceId);
        }
      }
      conflicts.push({
        key,
        sourceIds,
        values: uniqueValues,
        resolution: "NEWEST_SAME_DOCUMENT",
        winningSourceId: winner.sourceId,
      });
      continue;
    }
    hasUnresolvedConflict = true;
    conflicts.push({
      key,
      sourceIds,
      values: uniqueValues,
      resolution: "UNRESOLVED_CROSS_DOCUMENT",
    });
  }
  return { conflicts, supersededSourceIds, hasUnresolvedConflict };
}

export function decideEvidenceSufficiency(args: {
  query: string;
  candidates: readonly EvidenceCandidate[];
  assertions?: readonly EvidenceAssertion[];
  requirement?: EvidenceRequirement;
  policy?: typeof DEFAULT_EVIDENCE_POLICY;
}) {
  const policy = args.policy ?? DEFAULT_EVIDENCE_POLICY;
  const requirement = args.requirement ?? buildEvidenceRequirement(args.query);
  const assertions = args.assertions ?? [];
  const conflictEvaluation = evaluateConflicts({
    assertions,
    candidates: args.candidates,
  });
  const hash = inputHash({
    query: normalizedText(args.query),
    candidates: args.candidates,
    assertions,
    requirement,
    policy,
  });

  if (args.candidates.length === 0) {
    return {
      action: "ABSTAIN" as const,
      code: "INSUFFICIENT_EVIDENCE" as const,
      reasonCodes: ["NO_SELECTED_EVIDENCE"] as EvidenceReasonCode[],
      eligibleSourceIds: [] as string[],
      conflicts: [] as EvidenceConflict[],
      policyVersion: policy.version,
      requirement,
      decisionInputHash: hash,
    };
  }

  const reasonCodes: EvidenceReasonCode[] = [];
  if (
    args.candidates.every(
      (candidate) => candidate.fusedScore < policy.minimumFusedScore,
    )
  ) {
    reasonCodes.push("BELOW_MINIMUM_SCORE");
  }
  if (
    args.candidates.every(
      (candidate) =>
        normalizedText(candidate.content).length < policy.minimumEvidenceChars,
    )
  ) {
    reasonCodes.push("EVIDENCE_TOO_SHORT");
  }
  if (
    requirement.requiresNumericSpan &&
    args.candidates.every((candidate) => !/[0-9]+/.test(candidate.content))
  ) {
    reasonCodes.push("NUMERIC_SPAN_MISSING");
  }

  const eligible = args.candidates.filter(
    (candidate) =>
      candidate.fusedScore >= policy.minimumFusedScore &&
      normalizedText(candidate.content).length >= policy.minimumEvidenceChars &&
      (!requirement.requiresNumericSpan || /[0-9]+/.test(candidate.content)) &&
      !conflictEvaluation.supersededSourceIds.has(candidate.sourceId),
  );
  if (reasonCodes.length === 0) {
    if (eligible.length < requirement.minimumSources) {
      reasonCodes.push("SOURCE_COUNT_MISSING");
    }
    if (
      new Set(eligible.map((candidate) => candidate.documentId)).size <
      requirement.minimumDistinctDocuments
    ) {
      reasonCodes.push("DOCUMENT_DIVERSITY_MISSING");
    }
  }

  const base = {
    eligibleSourceIds: eligible.map((candidate) => candidate.sourceId),
    conflicts: conflictEvaluation.conflicts,
    policyVersion: policy.version,
    requirement,
    decisionInputHash: hash,
  };
  if (conflictEvaluation.hasUnresolvedConflict) {
    return {
      ...base,
      action: "COMPARE_SOURCES" as const,
      code: "SOURCE_CONFLICT" as const,
      reasonCodes,
    };
  }
  if (reasonCodes.length > 0) {
    return {
      ...base,
      action: "ABSTAIN" as const,
      code: "INSUFFICIENT_EVIDENCE" as const,
      reasonCodes,
    };
  }
  return {
    ...base,
    action: "ANSWER" as const,
    code: "EVIDENCE_SUFFICIENT" as const,
    reasonCodes,
  };
}
