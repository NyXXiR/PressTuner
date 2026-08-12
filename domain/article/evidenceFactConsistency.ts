import { createHash } from "node:crypto";

export const EVIDENCE_FACT_CONSISTENCY_REQUIREMENT_ID = "evidence-fact-consistency" as const;
export const EVIDENCE_FACT_CONSISTENCY_SOURCE_PREFIX =
  "verification:evidence-fact-consistency:" as const;

export type EvidenceFactLineage = Readonly<{
  documentId: string;
  sourceVersion: number;
  chunkId: string;
  pageStart: number;
  pageEnd: number;
  excerpt: string;
}>;

export type EvidenceFactSource = EvidenceFactLineage &
  Readonly<{ content: string }>;

export type NormalizedEvidenceAssertion = Readonly<{
  subject: string;
  period: string;
  metric: "revenue" | "operating-profit" | "net-profit";
  unit: "KRW";
  value: string;
  key: string;
  assertionId: string;
  lineage?: EvidenceFactLineage;
}>;

export type EvidenceFactConsistencyDetails = Readonly<{
  kind: "EVIDENCE_FACT_CONSISTENCY";
  counts: Readonly<{
    checked: number;
    matched: number;
    draftConflict: number;
    sourceConflict: number;
    notEvaluable: number;
  }>;
  riskCategoryCounts: Readonly<{
    NUMBER: number;
    PERIOD: number;
    DATE: number;
    PERSON: number;
    TITLE: number;
    DIRECT_QUOTE: number;
    OTHER: number;
  }>;
  documentRefs: readonly string[];
  factRefs: readonly string[];
  claimRefs: readonly string[];
}>;

export type EvidenceFactConsistencyFinding = Readonly<{
  reasonCode: "DRAFT_CONFLICT" | "SOURCE_CONFLICT";
  result: "BLOCK";
  riskCategory: "NUMBER";
  evidenceAssertionIds: readonly string[];
}>;

export type EvidenceFactConsistencyEvaluation = Readonly<{
  verdict: "PASS" | "BLOCK" | "NOT_EVALUABLE";
  details: EvidenceFactConsistencyDetails;
  assertions: readonly NormalizedEvidenceAssertion[];
  matchedAssertions: readonly NormalizedEvidenceAssertion[];
  findings: readonly EvidenceFactConsistencyFinding[];
}>;

const METRIC_ALIASES = new Map<string, NormalizedEvidenceAssertion["metric"]>([
  ["매출", "revenue"],
  ["매출액", "revenue"],
  ["영업이익", "operating-profit"],
  ["순이익", "net-profit"],
]);

const UNIT_SCALE = new Map<string, string>([
  ["원", "1"],
  ["krw", "1"],
  ["₩", "1"],
  ["만원", "10000"],
  ["천만원", "10000000"],
  ["억원", "100000000"],
]);

const ASSERTION = /(?:^|[.!?。！？\n]\s*)([^\d\n.!?。！？]{0,100}?)(\d{4})\s*년(?:도)?\s*(매출액?|영업\s*이익|순\s*이익)\s*(?:은|는|이|가)?\s*(\d[\d,\s]*(?:\.\d+)?)\s*(억\s*원|천\s*만\s*원|만\s*원|원|krw|₩)(?:을|를|은|는|이|가)?(?=$|[\s,.;:!?。！？])/giu;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeRef(value: string) {
  return `sha256:${sha256(value)}`;
}

function normalizeSubject(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/[,:：·\-–—]+$/u, "")
    .replace(/\s*(?:은|는|이|가|의)\s*$/u, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

function normalizeAlias(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, "").toLocaleLowerCase("en-US");
}

function canonicalDecimal(integer: string, fraction: string) {
  const normalizedInteger = integer.replace(/^0+(?=\d)/u, "") || "0";
  const normalizedFraction = fraction.replace(/0+$/u, "");
  return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger;
}

/** Exact decimal multiplication by an integer currency scale; no Number conversion. */
export function normalizeKrwDecimal(value: string, unit: string): string | null {
  const normalizedValue = value.normalize("NFKC").replace(/[\s,]/gu, "");
  if (!/^\d+(?:\.\d+)?$/u.test(normalizedValue)) return null;
  const scale = UNIT_SCALE.get(normalizeAlias(unit));
  if (!scale) return null;
  const [integer = "0", fraction = ""] = normalizedValue.split(".");
  const digits = `${integer}${fraction}`.replace(/^0+(?=\d)/u, "") || "0";
  const product = BigInt(digits) * BigInt(scale);
  if (fraction.length === 0) return product.toString();
  const padded = product.toString().padStart(fraction.length + 1, "0");
  const split = padded.length - fraction.length;
  return canonicalDecimal(padded.slice(0, split), padded.slice(split));
}

function assertionIdentity(assertion: Pick<NormalizedEvidenceAssertion, "key" | "value">) {
  return `${assertion.key}\u0000${assertion.value}`;
}

export function parseEvidenceAssertions(
  text: string,
  lineage?: EvidenceFactLineage,
): NormalizedEvidenceAssertion[] {
  const normalized = text.normalize("NFKC");
  const parsed: NormalizedEvidenceAssertion[] = [];
  ASSERTION.lastIndex = 0;
  for (const match of normalized.matchAll(ASSERTION)) {
    const subject = normalizeSubject(match[1] ?? "");
    const period = match[2];
    const metric = METRIC_ALIASES.get(normalizeAlias(match[3] ?? ""));
    const value = normalizeKrwDecimal(match[4] ?? "", match[5] ?? "");
    if (!period || !metric || value === null) continue;
    const key = [subject, period, metric, "KRW"].join("\u001f");
    const identity = `${key}\u0000${value}${lineage ? `\u0000${lineage.documentId}\u0000${lineage.sourceVersion}\u0000${lineage.chunkId}` : ""}`;
    parsed.push({
      subject,
      period,
      metric,
      unit: "KRW",
      value,
      key,
      assertionId: `efc:${sha256(identity)}`,
      ...(lineage ? { lineage } : {}),
    });
  }
  return [...new Map(parsed.map((item) => [assertionIdentity(item), item])).values()]
    .sort((a, b) => assertionIdentity(a).localeCompare(assertionIdentity(b)));
}

function uniqueSortedRefs(values: readonly string[]) {
  return [...new Set(values)].sort().slice(0, 32);
}

export function evidenceFactText(value: unknown, depth = 0): string {
  if (depth > 8 || value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => evidenceFactText(item, depth + 1)).filter(Boolean).join("\n");
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => evidenceFactText((value as Record<string, unknown>)[key], depth + 1))
    .filter(Boolean)
    .join("\n");
  return "";
}

export function evaluateEvidenceFactConsistency(args: {
  draftText: string;
  sources: readonly EvidenceFactSource[];
}): EvidenceFactConsistencyEvaluation {
  const draftAssertions = parseEvidenceAssertions(args.draftText);
  const sourceAssertions = args.sources.flatMap(({ content: _content, ...lineage }) =>
    parseEvidenceAssertions(_content, lineage),
  );
  const sourceByKey = new Map<string, NormalizedEvidenceAssertion[]>();
  for (const assertion of sourceAssertions) {
    sourceByKey.set(assertion.key, [...(sourceByKey.get(assertion.key) ?? []), assertion]);
  }

  const counts = {
    checked: Math.max(1, draftAssertions.length),
    matched: 0,
    draftConflict: 0,
    sourceConflict: 0,
    notEvaluable: 0,
  };
  const findings: EvidenceFactConsistencyFinding[] = [];
  const matchedAssertions: NormalizedEvidenceAssertion[] = [];
  const comparedSourceAssertions: NormalizedEvidenceAssertion[] = [];

  if (draftAssertions.length === 0) {
    counts.notEvaluable = 1;
  } else {
    for (const draft of draftAssertions) {
      const evidence = sourceByKey.get(draft.key) ?? [];
      comparedSourceAssertions.push(...evidence);
      if (evidence.length === 0) {
        counts.notEvaluable += 1;
        continue;
      }
      const values = new Set(evidence.map((item) => item.value));
      if (values.size > 1) {
        counts.sourceConflict += 1;
        findings.push({
          reasonCode: "SOURCE_CONFLICT",
          result: "BLOCK",
          riskCategory: "NUMBER",
          evidenceAssertionIds: uniqueSortedRefs(evidence.map((item) => item.assertionId)),
        });
      } else if (values.has(draft.value)) {
        counts.matched += 1;
        matchedAssertions.push(...evidence);
      } else {
        counts.draftConflict += 1;
        findings.push({
          reasonCode: "DRAFT_CONFLICT",
          result: "BLOCK",
          riskCategory: "NUMBER",
          evidenceAssertionIds: uniqueSortedRefs(evidence.map((item) => item.assertionId)),
        });
      }
    }
  }

  const details: EvidenceFactConsistencyDetails = {
    kind: "EVIDENCE_FACT_CONSISTENCY",
    counts,
    riskCategoryCounts: {
      NUMBER: counts.checked,
      PERIOD: 0,
      DATE: 0,
      PERSON: 0,
      TITLE: 0,
      DIRECT_QUOTE: 0,
      OTHER: 0,
    },
    documentRefs: uniqueSortedRefs(
      comparedSourceAssertions.flatMap((item) => item.lineage ? [safeRef(`document:${item.lineage.documentId}`)] : []),
    ),
    factRefs: uniqueSortedRefs(
      comparedSourceAssertions.flatMap((item) => item.lineage
        ? [safeRef(`fact:${item.lineage.documentId}:${item.lineage.sourceVersion}:${item.lineage.chunkId}`)]
        : []),
    ),
    // Draft claims do not currently have opaque persisted identifiers. Never derive
    // a telemetry reference from low-entropy claim text, dates, or amounts.
    claimRefs: [],
  };
  const verdict = findings.length > 0
    ? "BLOCK"
    : counts.matched > 0 && counts.notEvaluable === 0
      ? "PASS"
      : "NOT_EVALUABLE";
  return {
    verdict,
    details,
    assertions: sourceAssertions,
    matchedAssertions: [...new Map(matchedAssertions.map((item) => [item.assertionId, item])).values()],
    findings,
  };
}
