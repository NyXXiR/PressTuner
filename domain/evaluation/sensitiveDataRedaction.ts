import { createHash } from "node:crypto";

const SECRET_PATTERNS = [
  /\b(?:sk|pk)_[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/gi,
  /\b[A-Fa-f0-9]{32,}\b/g,
];
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\d)(?:\+?\d[\d .()-]{7,}\d)(?!\d)/g;

export type SensitiveTextKind = "CREDENTIAL" | "EMAIL" | "PHONE";
export type SensitiveTextScan = Readonly<{
  containsSensitiveData: boolean;
  kinds: readonly SensitiveTextKind[];
}>;

function matches(pattern: RegExp, value: string) {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

export function scanSensitiveText(value: string): SensitiveTextScan {
  const kinds: SensitiveTextKind[] = [];
  if (SECRET_PATTERNS.some((pattern) => matches(pattern, value))) kinds.push("CREDENTIAL");
  if (matches(EMAIL, value)) kinds.push("EMAIL");
  if (matches(PHONE, value)) kinds.push("PHONE");
  return Object.freeze({
    containsSensitiveData: kinds.length > 0,
    kinds: Object.freeze(kinds),
  });
}

export type RedactionResult = {
  excerpt: string;
  sourceHash: string;
  redactionCount: number;
  containsProhibitedData: boolean;
};

export function redactRegressionExcerpt(
  value: string,
  maximumLength = 500,
): RedactionResult {
  let excerpt = value.slice(0, maximumLength);
  let redactionCount = 0;
  for (const pattern of [...SECRET_PATTERNS, EMAIL, PHONE]) {
    excerpt = excerpt.replace(pattern, () => {
      redactionCount += 1;
      return "[REDACTED]";
    });
  }
  return {
    excerpt,
    sourceHash: createHash("sha256").update(value).digest("hex"),
    redactionCount,
    containsProhibitedData: SECRET_PATTERNS.some((pattern) => matches(pattern, value)),
  };
}
