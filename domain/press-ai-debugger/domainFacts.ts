import { hashTelemetryValue } from "@/domain/ai-telemetry/privacy";

export const PRESS_DOMAIN_FACT_LIMIT = 64;
export const PRESS_DOMAIN_FACT_LENGTH = 240;
export type PressDomainFact = Readonly<{ sourceField: string; kind: "NUMBER" | "DATE" | "QUOTE" | "CONSTRAINT"; normalizedValue: string; hash: string }>;

const briefFields = ["serviceName", "announceType", "oneLiner", "quoteMessage", "quoteWho", "eventAt", "publishAt"] as const;
const draftFields = ["title", "plain", "lead", "fact", "closing"] as const;
const constraintMarker = /(반드시|필수|금지|제외|제한|까지|이상|이하|only|must|never|no more than|at least)/i;
const numberPattern = /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?(?:%|분|시간|일|주|개월|곳|명|건|원|만원|억원|년|월)?(?![\p{L}\p{N}])/gu;
const datePattern = /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\d{1,2}월\s*\d{1,2}일/g;
const quotePattern = /[“"]([^”"]{1,220})[”"]|[‘']([^’']{1,220})[’']/g;

function normalize(value: string) { return value.replace(/\s+/g, " ").trim().slice(0, PRESS_DOMAIN_FACT_LENGTH); }
function withoutRuntimeMetadata(value: string) {
  return value
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/(^|\s)\/(?:api|var|tmp|home|users)\/\S+/gim, "$1 ")
    .replace(/\b(?:tone|usage|quota|retrievalScore|createdAt|updatedAt|runtime|quality)\s*[:=]\s*[^,;\s}]+/gi, " ");
}
function contentStrings(value: unknown, mode: "raw" | "brief" | "draft") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [] as Array<[string, string]>;
  const object = value as Record<string, unknown>; const output: Array<[string, string]> = [];
  const push = (path: string, item: unknown) => { if (typeof item === "string" && item.trim()) output.push([path, item]); };
  if (mode === "raw") push("rawText", object.rawText);
  if (mode === "brief") { for (const field of briefFields) push(field, object[field]); if (Array.isArray(object.points)) object.points.slice(0, 32).forEach((item, index) => push(`points[${index}]`, item)); }
  if (mode === "draft") {
    for (const field of draftFields) push(field, object[field]);
    if (Array.isArray(object.paragraphs)) object.paragraphs.slice(0, 24).forEach((paragraph, index) => {
      if (!paragraph || typeof paragraph !== "object" || Array.isArray(paragraph)) return;
      for (const key of ["title", "heading", "text", "plain", "body"]) push(`paragraphs[${index}].${key}`, (paragraph as Record<string, unknown>)[key]);
    });
  }
  return output;
}

export function extractPressDomainFacts(value: unknown, mode: "raw" | "brief" | "draft") {
  const facts: PressDomainFact[] = []; const seen = new Set<string>(); let discovered = 0;
  const add = (sourceField: string, kind: PressDomainFact["kind"], raw: string) => {
    const normalizedValue = normalize(raw); if (!normalizedValue) return; discovered += 1;
    const key = `${kind}:${normalizedValue.toLocaleLowerCase("ko")}`; if (seen.has(key) || facts.length >= PRESS_DOMAIN_FACT_LIMIT) return;
    seen.add(key); facts.push({ sourceField, kind, normalizedValue, hash: hashTelemetryValue(normalizedValue) });
  };
  for (const [sourceField, rawText] of contentStrings(value, mode)) {
    const text = withoutRuntimeMetadata(rawText);
    for (const match of text.matchAll(datePattern)) add(sourceField, "DATE", match[0]);
    const textWithoutDates = text.replace(datePattern, " ");
    for (const match of textWithoutDates.matchAll(numberPattern)) add(sourceField, "NUMBER", match[0]);
    for (const match of text.matchAll(quotePattern)) add(sourceField, "QUOTE", match[1] ?? match[2] ?? match[0]);
    for (const sentence of text.split(/(?<=[.!?。])\s+|\n+/)) if (constraintMarker.test(sentence)) add(sourceField, "CONSTRAINT", sentence);
  }
  return { facts, overflow: Math.max(0, discovered - facts.length) };
}

export function pressDomainContentText(value: unknown, mode: "raw" | "brief" | "draft") { return contentStrings(value, mode).map(([, text]) => text).join("\n"); }
