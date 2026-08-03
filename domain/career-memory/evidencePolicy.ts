import { createHash } from "node:crypto";

export type CareerFieldRisk = "NUMBER" | "DATE" | "ORGANIZATION" | "TITLE" | "OTHER";

const HIGH_RISK_PATHS: Array<[RegExp, CareerFieldRisk]> = [
  [/^metrics(?:\[\d+\])?$/, "NUMBER"],
  [/^(?:startDate|endDate|isCurrent)$/, "DATE"],
  [/^organization$/, "ORGANIZATION"],
  [/^roleTitle$/, "TITLE"],
];

export function normalizeCareerEvidenceValue(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Invalid date evidence value");
    return `scalar:${value.toISOString().slice(0, 10)}`;
  }
  if (Array.isArray(value)) {
    const items = value.map(normalizeCareerEvidenceValue);
    return `array:${items.map((item) => `${item.length}:${item}`).join("")}`;
  }
  if (value !== null && typeof value === "object") {
    throw new Error("Unsupported career evidence value");
  }
  const normalized = value === null || value === undefined
    ? ""
    : String(value).normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  return `scalar:${normalized}`;
}

export function fingerprintCareerValue(value: unknown): string {
  return createHash("sha256").update(normalizeCareerEvidenceValue(value), "utf8").digest("hex");
}

export function classifyCareerFieldRisk(fieldPath: string): CareerFieldRisk {
  return HIGH_RISK_PATHS.find(([pattern]) => pattern.test(fieldPath))?.[1] ?? "OTHER";
}

const COMPATIBLE_KIND_PATHS: Record<string, ReadonlyArray<RegExp>> = {
  ORGANIZATION: [/^organization$/],
  TITLE: [/^roleTitle$/],
  TYPE: [/^experienceType$/],
  START_DATE: [/^startDate$/],
  END_DATE: [/^endDate$/],
  ACTION: [/^actions\[\d+\]$/],
  OUTCOME: [/^outcomes\[\d+\]$/],
  METRIC: [/^metrics\[\d+\]$/],
  TOOL: [/^tools\[\d+\]$/],
  TAG: [/^tags\[\d+\]$/],
  SUMMARY: [/^summary$/],
};

export function isCompatibleCareerFactKind(kind: string, fieldPath: string): boolean {
  const compatiblePaths = COMPATIBLE_KIND_PATHS[kind];
  return compatiblePaths?.some((pattern) => pattern.test(fieldPath)) ?? false;
}

export function areEvidenceValuesCompatible(input: {
  fieldPath: string;
  value: unknown;
  evidence: { fieldPath: string; valueHash: string };
}): boolean {
  return input.fieldPath === input.evidence.fieldPath &&
    fingerprintCareerValue(input.value) === input.evidence.valueHash;
}

export function hasCompatibleEvidence(input: {
  kind: string;
  fieldPath: string;
  value: unknown;
  evidence: ReadonlyArray<{ fieldPath: string; valueHash: string }>;
}): boolean {
  if (!isCompatibleCareerFactKind(input.kind, input.fieldPath)) return false;
  return input.evidence.some((evidence) => areEvidenceValuesCompatible({ ...input, evidence }));
}
