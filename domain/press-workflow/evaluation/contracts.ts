import { z } from "zod";
import { sha256Canonical } from "../../evaluation/configurationIdentity";
import { draftDefaultsSchema, draftOverrideSchema } from "../configuration";

export const hash = sha256Canonical;
export const POLICY_VERSION = "press-requirements/v1";
export const RAGAS_VERSION = "0.4.3";
export const CRITERIA = ["FACTUAL_SUPPORT", "REQUIRED_FACTS", "STYLE_LEAKAGE", "PROMOTIONAL_CLAIMS", "REQUESTED_STYLE"] as const;
const bounded = (max: number) => z.string().trim().min(1).max(max);
export const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const partitionSchema = z.enum(["DEVELOPMENT", "HOLDOUT"]);
export const factSchema = z.object({ id: bounded(60), content: bounded(3000) }).strict();
export const criterionSchema = z.enum(CRITERIA);
export const judgmentValueSchema = z.enum(["PASS", "FAIL", "UNCERTAIN"]);
export const scenarioSchema = z.object({
  caseId: z.string().regex(/^C\d{2}$/), groupId: bounded(80), partition: partitionSchema,
  request: bounded(2000), facts: z.array(factSchema).min(1).max(20), requiredFactIds: z.array(bounded(60)).min(1).max(20),
  requestedStyle: bounded(500), styleExamples: bounded(3000),
  challenges: z.array(z.object({ kind: z.enum(["VALID", "OMISSION", "CONTRADICTION", "STYLE", "LEAKAGE", "PROMOTION", "PARAPHRASE"]),
    text: bounded(20000), expectationSource: z.literal("AI_AUTHORED"), expectedFailures: z.array(criterionSchema).max(5),
  }).strict()).min(1).max(7),
}).strict().superRefine((c, ctx) => {
  const ids = new Set(c.facts.map(f => f.id));
  if (ids.size !== c.facts.length || new Set(c.requiredFactIds).size !== c.requiredFactIds.length || c.requiredFactIds.some(id => !ids.has(id)))
    ctx.addIssue({ code: "custom", message: "Fact IDs must be unique and requirements must reference accepted facts" });
});
export const datasetSchema = z.object({ version: z.literal("press-dual-dataset/v1"), provenance: z.literal("SYNTHETIC_AI_AUTHORED"),
  cases: z.array(scenarioSchema).min(1).max(100),
}).strict().superRefine((d, ctx) => {
  if (new Set(d.cases.map(c => c.caseId)).size !== d.cases.length || new Set(d.cases.map(c => c.groupId)).size !== d.cases.length)
    ctx.addIssue({ code: "custom", message: "Case and source group identities must be unique across partitions" });
});
export const usageSchema = z.object({ inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }).strict();
export const generationProvenanceSchema = z.object({
  implementationHash: digest, requestHash: digest,
  request: z.object({ model: bounded(120), messages: z.array(z.object({ role: z.enum(["system", "user"]), content: z.string().max(50000) }).strict()).min(1).max(20),
    responseFormat: z.object({ type: z.literal("json_object") }).strict(), temperature: z.number().min(0).max(2).optional() }).strict(),
  configuration: z.object({ defaults: draftDefaultsSchema, override: draftOverrideSchema.nullable(), effective: draftDefaultsSchema.omit({ revision: true }) }).strict(),
}).strict().superRefine((p, ctx) => {
  if (hash(p.request) !== p.requestHash) ctx.addIssue({ code: "custom", message: "Generation request hash mismatch" });
});
export const draftSchema = z.object({ version: z.literal("press-eval-draft/v1"), caseId: z.string().regex(/^C\d{2}$/), groupId: bounded(80),
  partition: partitionSchema, variant: z.enum(["BASELINE", "CANDIDATE"]), trial: z.number().int().min(1).max(10),
  datasetHash: digest, inputHash: digest, configurationHash: digest, model: bounded(120),
  evidenceClass: z.enum(["SYNTHETIC", "MEASURED_TEST"]), createdAt: z.string().datetime(),
  text: bounded(20000), outputHash: digest, generationMs: z.number().finite().nonnegative(), usage: usageSchema.nullable(),
  provenance: generationProvenanceSchema.optional(),
}).strict().superRefine((d, ctx) => {
  if (hash(d.text) !== d.outputHash) ctx.addIssue({ code: "custom", message: "Draft hash mismatch" });
  if (d.provenance && (hash(d.provenance.configuration) !== d.configurationHash || (d.evidenceClass === "MEASURED_TEST" && d.provenance.request.model !== d.model)))
    ctx.addIssue({ code: "custom", message: "Generation configuration mismatch" });
});
export const checkSchema = z.object({ criterion: criterionSchema, judgment: judgmentValueSchema,
  reason: bounded(800), evidence: z.array(z.object({ quote: bounded(2000), factIds: z.array(bounded(60)).max(20) }).strict()).max(12),
}).strict();
export const judgeSchema = z.object({ checks: z.array(checkSchema).length(CRITERIA.length) }).strict().superRefine((r, ctx) => {
  if (new Set(r.checks.map(c => c.criterion)).size !== CRITERIA.length) ctx.addIssue({ code: "custom", message: "Each rubric criterion must occur exactly once" });
});
export function validateJudgment(result: z.infer<typeof judgeSchema>, draft: string, acceptedIds: string[]) {
  for (const check of result.checks) for (const evidence of check.evidence) {
    if (!draft.includes(evidence.quote) || evidence.factIds.some(id => !acceptedIds.includes(id))) throw new Error("INVALID_EVIDENCE_REFERENCE");
  }
  return result;
}
export const EVAL_ERRORS = ["NO_FACTS", "NO_CLAIMS", "TIMEOUT", "INVALID_RESULT", "PROVIDER_ERROR", "NOT_RUN", "MISSING_REVIEW"] as const;
export const scoreResultSchema = z.object({ state: z.enum(["EVALUATED", "NOT_EVALUABLE"]), score: z.number().finite().min(0).max(1).nullable(),
  reasonCode: z.enum(EVAL_ERRORS).nullable(), elapsedMs: z.number().finite().nonnegative(), usage: usageSchema.nullable(),
}).strict().superRefine((r, ctx) => {
  if ((r.state === "EVALUATED") !== (r.score !== null && r.reasonCode === null) || (r.state === "NOT_EVALUABLE" && (r.score !== null || r.reasonCode === null)))
    ctx.addIssue({ code: "custom", message: "Evaluability and score disagree" });
});
export const domainResultSchema = z.object({ state: z.enum(["EVALUATED", "NOT_EVALUABLE"]), verdict: z.enum(["PASS", "WARN", "BLOCK"]).nullable(),
  checks: z.array(checkSchema).max(5), reasonCode: z.enum(EVAL_ERRORS).nullable(), elapsedMs: z.number().finite().nonnegative(), usage: usageSchema.nullable(),
}).strict().superRefine((r, ctx) => {
  const complete = r.checks.length === 5 && !r.checks.some(c => c.judgment === "UNCERTAIN");
  const expected = r.checks.length === 5 ? domainVerdict(r.checks) : null;
  if (new Set(r.checks.map(c => c.criterion)).size !== r.checks.length || (r.state === "EVALUATED") !== complete || r.verdict !== expected
    || (complete ? r.reasonCode !== null : r.reasonCode === null)) ctx.addIssue({ code: "custom", message: "Domain outcome contradicts checks or coverage" });
});
export const evaluationSchema = z.object({ version: z.literal("press-dual-evaluation/v1"), draft: draftSchema,
  evaluationMode: z.enum(["MOCK", "LIVE"]),
  contextHash: digest, evaluatedAt: z.string().datetime(), evaluator: z.object({ ragasVersion: z.literal(RAGAS_VERSION),
    metric: z.literal("faithfulness"), domainPolicy: z.literal(POLICY_VERSION), judgeModel: bounded(120), promptHash: digest }).strict(),
  ragas: scoreResultSchema, domain: domainResultSchema,
}).strict();
export type Scenario = z.infer<typeof scenarioSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Judgment = z.infer<typeof judgeSchema>;
export type Evaluation = z.infer<typeof evaluationSchema>;
export const policyFreezeSchema = z.object({ version: z.literal("press-eval-policy-freeze/v1"), datasetHash: digest,
  createdAt: z.string().datetime(), implementationHash: digest, generatorModel: bounded(120), judgeModel: bounded(120),
  promptHash: digest, ragasVersion: z.literal(RAGAS_VERSION), domainPolicy: z.literal(POLICY_VERSION),
  developmentArtifactHash: digest, humanReviewHash: digest, reviewedOutputs: z.number().int().min(1),
}).strict();
export const generationBundleSchema = z.object({ version: z.literal("press-eval-generation/v1"), datasetHash: digest,
  kind: z.enum(["GENERATION", "AUTHORED_CHALLENGES"]), createdAt: z.string().datetime(),
  policyFreeze: policyFreezeSchema.optional(),
  attempts: z.array(z.object({ caseId: z.string().regex(/^C\d{2}$/), variant: z.enum(["BASELINE", "CANDIDATE"]), trial: z.number().int().min(1).max(10),
    draft: draftSchema.nullable(), errorCode: z.enum(["GENERATION_FAILED"]).nullable(),
  }).strict()).min(1).max(600),
}).strict().superRefine((r, ctx) => {
  if (r.policyFreeze && r.policyFreeze.datasetHash !== r.datasetHash) ctx.addIssue({ code: "custom", message: "Frozen policy dataset mismatch" });
  const keys = r.attempts.map(a => `${a.caseId}/${a.variant}/${a.trial}`);
  if (new Set(keys).size !== keys.length || r.attempts.some(a => (a.draft === null) !== (a.errorCode !== null)
    || (a.draft && (a.draft.caseId !== a.caseId || a.draft.variant !== a.variant || a.draft.trial !== a.trial || a.draft.datasetHash !== r.datasetHash))))
    ctx.addIssue({ code: "custom", message: "Invalid generation lineage or duplicate attempt" });
});
export const evaluationBundleSchema = z.object({ version: z.literal("press-eval-batch/v1"), generation: generationBundleSchema,
  evaluations: z.array(evaluationSchema).max(600),
}).strict().superRefine((b, ctx) => {
  const validDrafts = b.generation.attempts.flatMap(a => a.draft ? [a.draft] : []);
  const key = (d: Draft) => `${d.caseId}/${d.variant}/${d.trial}`;
  if (validDrafts.length !== b.evaluations.length || new Set(b.evaluations.map(e => key(e.draft))).size !== b.evaluations.length || b.evaluations.some(e => !validDrafts.some(d => key(d) === key(e.draft) && hash(d) === hash(e.draft))))
    ctx.addIssue({ code: "custom", message: "Evaluation must match every successful generated draft exactly once" });
  if (new Set(b.evaluations.map(e => hash({ evaluator: e.evaluator, mode: e.evaluationMode }))).size > 1)
    ctx.addIssue({ code: "custom", message: "A comparison batch must use one fixed evaluator configuration" });
});
export type GenerationBundle = z.infer<typeof generationBundleSchema>;
export type EvaluationBundle = z.infer<typeof evaluationBundleSchema>;
export const scenarioInputHash = (c: Scenario) => hash({ request: c.request, facts: c.facts, requiredFactIds: c.requiredFactIds, requestedStyle: c.requestedStyle, styleExamples: c.styleExamples });

export function domainVerdict(checks: Judgment["checks"]): "PASS" | "WARN" | "BLOCK" | null {
  if (checks.some(c => c.judgment === "FAIL" && c.criterion !== "REQUESTED_STYLE")) return "BLOCK";
  if (checks.some(c => c.judgment === "UNCERTAIN")) return null;
  return checks.some(c => c.judgment === "FAIL") ? "WARN" : "PASS";
}
