export type DraftClaimEvidenceInput = {
  sourceId: string;
  quote: string;
};

export type DraftClaimInput = {
  id: string;
  text: string;
  evidence: readonly DraftClaimEvidenceInput[];
};

export type VerifiableSource = {
  sourceId: string;
  documentId: string;
  content: string;
  pageStart: number;
  pageEnd: number;
};

type VerifiedSpan = {
  sourceId: string;
  pageStart: number;
  pageEnd: number;
  start: number;
  end: number;
  quote: string;
};

type ClaimReasonCode =
  | "CITATION_INVALID"
  | "CLAIM_TOKEN_COVERAGE_MISSING"
  | "CONTRADICTORY_NUMERIC_EVIDENCE";

const ENDINGS = [
  "했습니다",
  "됩니다",
  "합니다",
  "입니다",
  "이었다",
  "되며",
  "이며",
  "이다",
  "한다",
  "된다",
  "였다",
  "했다",
];
const PARTICLES = [
  "으로",
  "에서",
  "에게",
  "부터",
  "까지",
  "처럼",
  "보다",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "와",
  "과",
  "의",
  "에",
  "로",
  "며",
];
const STOP_WORDS = new Set([
  "그리고",
  "그러나",
  "하지만",
  "또한",
  "대한",
  "통해",
]);

function normalizedSentence(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function comparisonText(value: string) {
  return normalizedSentence(value)
    .toLocaleLowerCase("ko-KR")
    .replace(/,/g, "")
    .replace(/\s+/g, " ");
}

function stripToken(token: string) {
  let value = token
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/,/g, "")
    .replace(/^[^0-9a-z가-힣%]+|[^0-9a-z가-힣%]+$/g, "");
  if (/^\d+(?:\.\d+)?(?:년|월|일)$/.test(value)) {
    return value.replace(/(?:년|월|일)$/, "");
  }
  for (const ending of ENDINGS) {
    if (value.length > ending.length + 1 && value.endsWith(ending)) {
      value = value.slice(0, -ending.length);
      break;
    }
  }
  for (const particle of PARTICLES) {
    if (value.length > particle.length + 1 && value.endsWith(particle)) {
      value = value.slice(0, -particle.length);
      break;
    }
  }
  return value;
}

function claimTokens(value: string) {
  const tokens = normalizedSentence(value)
    .split(/\s+/)
    .map(stripToken)
    .filter((token) => token.length >= 2 || /^\d/.test(token))
    .filter((token) => !STOP_WORDS.has(token));
  return [...new Set(tokens)];
}

type NumericFact = { value: string; unit: string };

function numericFacts(value: string): NumericFact[] {
  const matches = comparisonText(value).matchAll(
    /(\d+(?:\.\d+)?)(%|억원|만원|원|명|건|개|년|월|일)?/g,
  );
  return [...matches].map((match) => ({
    value: match[1],
    unit: match[2] ?? "NUMBER",
  }));
}

function hasContradictoryNumericEvidence(
  claimText: string,
  spans: readonly VerifiedSpan[],
) {
  if (spans.length < 2) return false;
  const expectedFacts = numericFacts(claimText);
  if (expectedFacts.length === 0) return false;
  const evidenceFacts = spans.flatMap((span) => numericFacts(span.quote));
  return expectedFacts.some((expected) =>
    evidenceFacts.some(
      (actual) =>
        actual.unit === expected.unit && actual.value !== expected.value,
    ),
  );
}

function splitBodySentences(body: string) {
  const sentences: string[] = [];
  for (const line of body.split(/\r?\n+/)) {
    const normalized = normalizedSentence(line);
    let start = 0;
    for (let index = 0; index < normalized.length; index += 1) {
      const character = normalized[index];
      if (![".", "!", "?"].includes(character)) continue;
      const decimalPoint =
        character === "." &&
        /\d/.test(normalized[index - 1] ?? "") &&
        /\d/.test(normalized[index + 1] ?? "");
      if (decimalPoint) continue;
      const sentence = normalizedSentence(normalized.slice(start, index + 1));
      if (sentence) sentences.push(sentence);
      start = index + 1;
    }
    const remainder = normalizedSentence(normalized.slice(start));
    if (remainder) sentences.push(remainder);
  }
  return sentences;
}

function splitDraftSentences(draft: { title: string; body: string }) {
  return [normalizedSentence(draft.title), ...splitBodySentences(draft.body)].filter(
    Boolean,
  );
}

export function verifyDraftClaimSpans(args: {
  draft: { title: string; body: string };
  claims: readonly DraftClaimInput[];
  sources: readonly VerifiableSource[];
}) {
  const sourceById = new Map(
    args.sources.map((source) => [source.sourceId, source]),
  );
  const draftSentences = splitDraftSentences(args.draft);
  const draftSentenceSet = new Set(draftSentences.map(normalizedSentence));
  const claimSentenceSet = new Set(
    args.claims.map((claim) => normalizedSentence(claim.text)),
  );
  const uncoveredDraftSentences = draftSentences.filter(
    (sentence) => !claimSentenceSet.has(normalizedSentence(sentence)),
  );
  const invalidCitations: Array<{
    claimId: string;
    sourceId: string;
    reason: "SOURCE_NOT_FOUND" | "QUOTE_NOT_FOUND";
  }> = [];

  const claims = args.claims.map((claim) => {
    const spans: VerifiedSpan[] = [];
    for (const evidence of claim.evidence) {
      const source = sourceById.get(evidence.sourceId);
      if (!source) {
        invalidCitations.push({
          claimId: claim.id,
          sourceId: evidence.sourceId,
          reason: "SOURCE_NOT_FOUND",
        });
        continue;
      }
      const start = source.content.indexOf(evidence.quote);
      if (start < 0 || !evidence.quote.trim()) {
        invalidCitations.push({
          claimId: claim.id,
          sourceId: evidence.sourceId,
          reason: "QUOTE_NOT_FOUND",
        });
        continue;
      }
      spans.push({
        sourceId: source.sourceId,
        pageStart: source.pageStart,
        pageEnd: source.pageEnd,
        start,
        end: start + evidence.quote.length,
        quote: evidence.quote,
      });
    }

    const isTitle = normalizedSentence(claim.text) === normalizedSentence(args.draft.title);
    const requiredTokens = isTitle ? [] : claimTokens(claim.text);
    const combinedEvidence = comparisonText(
      spans.map((span) => span.quote).join(" "),
    );
    const missingClaimTokens = requiredTokens.filter(
      (token) => !combinedEvidence.includes(comparisonText(token)),
    );
    const reasonCodes: ClaimReasonCode[] = [];
    if (spans.length !== claim.evidence.length || spans.length === 0) {
      reasonCodes.push("CITATION_INVALID");
    }
    if (missingClaimTokens.length > 0) {
      reasonCodes.push("CLAIM_TOKEN_COVERAGE_MISSING");
    }
    if (hasContradictoryNumericEvidence(claim.text, spans)) {
      reasonCodes.length = 0;
      reasonCodes.push("CONTRADICTORY_NUMERIC_EVIDENCE");
    }
    if (!draftSentenceSet.has(normalizedSentence(claim.text))) {
      reasonCodes.push("CLAIM_TOKEN_COVERAGE_MISSING");
    }
    return {
      id: claim.id,
      text: claim.text,
      status: reasonCodes.length === 0 ? ("SUPPORTED" as const) : ("UNSUPPORTED" as const),
      spans,
      missingClaimTokens,
      reasonCodes: [...new Set(reasonCodes)],
    };
  });

  const unsupportedClaimIds = claims
    .filter((claim) => claim.status === "UNSUPPORTED")
    .map((claim) => claim.id);
  const status =
    invalidCitations.length === 0 &&
    uncoveredDraftSentences.length === 0 &&
    unsupportedClaimIds.length === 0
      ? ("PASS" as const)
      : ("FAIL" as const);
  return {
    version: "claim-span-verifier-v1",
    status,
    claims,
    invalidCitations,
    uncoveredDraftSentences,
    unsupportedClaimIds,
  };
}

export function verifyAgentAnswerClaimSpans(args: {
  answer: string;
  cannotAnswer: boolean;
  claims: readonly DraftClaimInput[];
  sources: readonly VerifiableSource[];
}) {
  if (args.cannotAnswer) {
    if (args.claims.length > 0) {
      throw new Error("PRESS_AGENT_ABSTENTION_CLAIMS_NOT_ALLOWED");
    }
    return {
      version: "claim-span-verifier-v1" as const,
      mode: "ABSTENTION" as const,
      status: "PASS" as const,
      claims: [],
      invalidCitations: [],
      uncoveredDraftSentences: [],
      unsupportedClaimIds: [],
    };
  }
  if (args.claims.length === 0) {
    throw new Error("PRESS_AGENT_FACTUAL_CLAIMS_REQUIRED");
  }
  return {
    ...verifyDraftClaimSpans({
      draft: { title: "", body: args.answer },
      claims: args.claims,
      sources: args.sources,
    }),
    mode: "ANSWER" as const,
  };
}
