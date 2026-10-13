import { z } from "zod";
import { hash } from "../../../../domain/press-workflow/evaluation/contracts";
import { STANDARD_PROFILE, standardInputSchema, standardMetricResultSchema, standardErrorSchema,
  type StandardInput, type StandardEvaluation } from "../../../../domain/press-workflow/evaluation/standard";

const rawResult = z.object({ score: z.number().finite().min(0).max(1), reason: z.string().max(4000).nullable().optional(),
  usage: z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).nullable() });
export type StandardEvaluationPorts = {
  model: string;
  measure(framework: "RAGAS" | "DEEPEVAL", input: Readonly<StandardInput>): Promise<unknown>;
};

/** Native metric results only. No combined score, business rubric, or publication decision. */
export async function evaluateStandard(inputValue: unknown, ports: StandardEvaluationPorts, frameworks: ("RAGAS" | "DEEPEVAL")[] = ["RAGAS", "DEEPEVAL"]): Promise<StandardEvaluation> {
  const input = standardInputSchema.parse(inputValue);
  const frozen = Object.freeze({ ...input, contexts: Object.freeze([...input.contexts]) });
  const results = await Promise.all(STANDARD_PROFILE.metrics.filter(metric => frameworks.includes(metric.framework as "RAGAS" | "DEEPEVAL")).map(async metric => {
    const started = performance.now();
    const metadata = { framework: metric.framework, version: metric.version, metric: metric.metric, threshold: metric.threshold };
    try {
      const raw = rawResult.parse(await ports.measure(metric.framework as "RAGAS" | "DEEPEVAL", { ...frozen, contexts: [...frozen.contexts] }));
      return standardMetricResultSchema.parse({ ...metadata, state: "COMPLETED", score: raw.score, reason: raw.reason ?? null,
        reasonCode: null, thresholdPassed: metric.threshold === null ? null : raw.score >= metric.threshold,
        elapsedMs: performance.now() - started, usage: raw.usage });
    } catch (error) {
      const code = standardErrorSchema.safeParse(error instanceof Error ? error.message : undefined);
      const usage = rawResult.shape.usage.safeParse(error && typeof error === "object" ? (error as { usage?: unknown }).usage : null);
      return standardMetricResultSchema.parse({ ...metadata, state: "FAILED", score: null, reason: null,
        reasonCode: code.success ? code.data : error instanceof z.ZodError ? "INVALID_RESULT" : "PROVIDER_ERROR",
        thresholdPassed: null, elapsedMs: performance.now() - started, usage: usage.success ? usage.data : null });
    }
  }));
  return { version: "press-standard-result/v1", profileId: STANDARD_PROFILE.id, profileHash: hash(STANDARD_PROFILE),
    inputHash: hash(input), evaluatedAt: new Date().toISOString(), model: ports.model,
    contextSource: "ACCEPTED_ARTICLE_FACTS", contextCount: input.contexts.length, results };
}
