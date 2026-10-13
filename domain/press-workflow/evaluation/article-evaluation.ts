import { z } from "zod";
import type { StandardInput } from "./standard";

export const qualityRequestSchema = z.object({
  kind: z.enum(["STANDARD", "GEVAL"]), expectedOutput: z.string().trim().min(1).max(20000),
  idempotencyKey: z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/), retryOfId: z.string().min(1).max(100).optional(),
}).strict();
export type QualityRequest = z.infer<typeof qualityRequestSchema>;
export type QualityKind = QualityRequest["kind"];
export type QualitySnapshot = {
  articleId: string; teamId: string | null; ownerId: string | null; fingerprint: string; reason: string | null;
  input: StandardInput; facts: { id: string; content: string; origin: string }[];
  groundingRevision: number; corpusVersion: number; generationVersion: "UNKNOWN";
};
export const metricDefinitionSchema = z.object({
  id: z.string(), framework: z.string(), metric: z.string(), version: z.string(),
  threshold: z.number().min(0).max(1).nullable(), applicable: z.boolean(), reason: z.string().nullable(),
});
export const qualityMetricSchema = metricDefinitionSchema.extend({
  state: z.enum(["COMPLETED", "FAILED", "NOT_APPLICABLE"]), score: z.number().finite().min(0).max(1).nullable(),
  reason: z.string().max(4000).nullable(), reasonCode: z.enum(["TIMEOUT", "NO_CLAIMS", "INVALID_RESULT", "PROVIDER_ERROR"]).nullable(),
  thresholdPassed: z.boolean().nullable(), elapsedMs: z.number().finite().nonnegative(),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).nullable(),
  reusedFromRunId: z.string().optional(),
}).strict().superRefine((r, ctx) => {
  const valid = r.state === "COMPLETED" ? r.applicable && r.score !== null && !r.reasonCode && r.thresholdPassed === (r.threshold === null ? null : r.score >= r.threshold)
    : r.score === null && r.thresholdPassed === null && (r.state === "FAILED" ? r.applicable && !!r.reasonCode : !r.applicable && !r.reasonCode);
  if (!valid) ctx.addIssue({ code: "custom", message: "Invalid metric state" });
});
export type MetricDefinition = z.infer<typeof metricDefinitionSchema>;
export type QualityMetric = z.infer<typeof qualityMetricSchema>;
export type QualityProfile = {
  kind: QualityKind; version: string; model: string; implementationHash: string; metrics: MetricDefinition[];
  configuration?: unknown;
};
export type QualityRuntime = { available: boolean; reason: string | null; profile: QualityProfile };
export type QualityStatus = "RUNNING" | "COMPLETED" | "PARTIAL" | "FAILED" | "INTERRUPTED";
export type QualityReservation = {
  articleId: string; teamId: string | null; createdById: string; idempotencyKey: string; requestHash: string;
  fingerprint: string; profileHash: string; kind: QualityKind; snapshot: QualitySnapshot; profile: QualityProfile;
  results: QualityMetric[]; retryOfId: string | null;
};
export type QualityRun = QualityReservation & { id: string; status: QualityStatus; createdAt: string; finishedAt: string | null };
export type QualityRunView = Omit<QualityRun, "snapshot" | "idempotencyKey" | "requestHash" | "createdById" | "teamId"> & {
  output: string; contextCount: number; freshness: "CURRENT" | "STALE";
};
export type ArticleQualityState = {
  fingerprint: string; contextCount: number; inputReason: string | null;
  runtimes: Record<QualityKind, QualityRuntime>; history: QualityRunView[];
};
