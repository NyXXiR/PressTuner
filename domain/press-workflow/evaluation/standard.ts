import { z } from "zod";
import { buildCanonicalArticlePlain, normalizeEditedPlainForPersistence } from "../../article/articleCanonicalContent";
import profile from "./standard-profile.json";

export const STANDARD_PROFILE = profile;
// Compare the same paragraph normalization used when saving an edited draft.
export function standardDraftText(title: string, plain: string) {
  const savedPlain = buildCanonicalArticlePlain(normalizeEditedPlainForPersistence(plain));
  return [title.trim(), savedPlain].filter(Boolean).join("\n\n");
}
const bounded = (max: number) => z.string().trim().min(1).max(max);
export const standardInputSchema = z.object({
  request: bounded(2000), output: bounded(20000), contexts: z.array(bounded(3000)).min(1).max(20),
}).strict();
export const standardErrorSchema = z.enum(["TIMEOUT", "NO_CLAIMS", "INVALID_RESULT", "PROVIDER_ERROR"]);
const tokens = z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).strict();
export const standardMetricResultSchema = z.object({
  framework: z.enum(["RAGAS", "DEEPEVAL"]), version: bounded(30), metric: bounded(80),
  state: z.enum(["COMPLETED", "FAILED"]), score: z.number().finite().min(0).max(1).nullable(),
  reason: z.string().max(4000).nullable(), reasonCode: standardErrorSchema.nullable(),
  threshold: z.number().min(0).max(1).nullable(), thresholdPassed: z.boolean().nullable(),
  elapsedMs: z.number().finite().nonnegative(), usage: tokens.nullable(),
}).strict().superRefine((r, ctx) => {
  if ((r.state === "COMPLETED") !== (r.score !== null && r.reasonCode === null)
    || (r.state === "FAILED" && (r.score !== null || r.thresholdPassed !== null || !r.reasonCode))
    || (r.state === "COMPLETED" && r.thresholdPassed !== (r.threshold === null ? null : r.score! >= r.threshold))) {
    ctx.addIssue({ code: "custom", message: "Invalid standard metric outcome" });
  }
});
export type StandardInput = z.infer<typeof standardInputSchema>;
export type StandardMetricResult = z.infer<typeof standardMetricResultSchema>;
export type StandardEvaluation = {
  version: "press-standard-result/v1"; profileId: string; profileHash: string; inputHash: string;
  evaluatedAt: string; model: string; contextSource: "ACCEPTED_ARTICLE_FACTS"; contextCount: number;
  results: StandardMetricResult[];
};
export type StandardAvailability = {
  available: boolean; model: string; reason: string | null;
};
export type ArticleStandardEvaluationState = {
  runtime: StandardAvailability; contextCount: number; fingerprint: string; ready: boolean; reason: string | null;
};
export type ArticleStandardEvaluation = {
  articleId: string; fingerprint: string; freshness: "CURRENT" | "STALE";
  evaluation: StandardEvaluation;
};
