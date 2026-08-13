import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const AI_PROCESS_TIMESTAMP_HEADER = "X-Ai-Process-Timestamp";
export const AI_PROCESS_SIGNATURE_HEADER = "X-Ai-Process-Signature";

type RawBody = string | Uint8Array;
const bytes = (body: RawBody): Uint8Array => typeof body === "string" ? Buffer.from(body, "utf8") : body;

function canonicalSigningInput(args: { timestamp: string; method: string; pathname: string; body: RawBody }): string {
  const bodyHash = createHash("sha256").update(bytes(args.body)).digest("hex");
  return ["AIPC-HMAC-SHA256-V1", args.timestamp, args.method.toUpperCase(), args.pathname, bodyHash].join("\n");
}

export function signAiProcessRequest(args: { secret: string; timestamp: string; method: string; pathname: string; body: RawBody }): Readonly<{ timestamp: string; signature: string }> {
  const digest = createHmac("sha256", args.secret).update(canonicalSigningInput(args)).digest("hex");
  return { timestamp: args.timestamp, signature: `v1=${digest}` };
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function verifyAiProcessRequest(args: {
  secret: string;
  timestamp: string | null | undefined;
  signature: string | null | undefined;
  method: string;
  pathname: string;
  body: RawBody;
  maxSkewSeconds: number;
  clock?: () => Date;
}): boolean {
  const timestamp = parseTimestamp(args.timestamp);
  const nowSeconds = Math.floor((args.clock?.() ?? new Date()).getTime() / 1000);
  const fresh = timestamp !== null && Math.abs(nowSeconds - timestamp) <= args.maxSkewSeconds;
  const providedHex = typeof args.signature === "string" && /^v1=[a-f0-9]{64}$/.test(args.signature) ? args.signature.slice(3) : null;
  const provided = providedHex ? Buffer.from(providedHex, "hex") : Buffer.alloc(32);
  const expected = Buffer.from(signAiProcessRequest({ secret: args.secret, timestamp: args.timestamp ?? "", method: args.method, pathname: args.pathname, body: args.body }).signature.slice(3), "hex");
  const matches = timingSafeEqual(provided, expected);
  return fresh && providedHex !== null && matches;
}
