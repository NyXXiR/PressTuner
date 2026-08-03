import { createHash } from "node:crypto";

const SECRET_PATTERNS = [
  /\b(?:sk|pk)_[A-Za-z0-9_-]{12,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*\b/gi,
  /\b[A-Fa-f0-9]{32,}\b/g,
];
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /(?<!\d)(?:\+?\d[\d .()-]{7,}\d)(?!\d)/g;

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
    containsProhibitedData: SECRET_PATTERNS.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(value);
    }),
  };
}
