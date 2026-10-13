import { z } from "zod";
import type { QualityProfile, QualityRun, QualitySnapshot } from "./article-evaluation";

export const partitionSchema = z.enum(["DEVELOPMENT", "CALIBRATION", "AUDIT", "HOLDOUT"]);
export type Partition = z.infer<typeof partitionSchema>;
export const exposureSchema = z.enum(["NONE", "SEEN_JUDGE", "UNKNOWN"]);
export type Exposure = z.infer<typeof exposureSchema>;
export const choiceSchema = z.enum(["PASS", "FAIL", "UNCERTAIN", "SKIP", "APPLY", "KEEP", "DEFER"]);
export type Choice = z.infer<typeof choiceSchema>;
export type Sample = { id: string; groupId: string; sourceKeys: string[]; partition: Partition; run: QualityRun; outputHash: string };
export type ReviewItem = { id: string; sampleId: string; metricId: string };
export type ReviewBatch = { id: string; reviewerId: string; purpose: Exclude<Partition, "HOLDOUT"> | "PRODUCT"; items: ReviewItem[]; createdAt: string; sampling: "RISK_RANKED" | "UNIFORM_WITHOUT_REPLACEMENT"; poolSize: number; inclusionProbability: number };
export type Review = { batchId: string; itemId: string; reviewerId: string; revision: number; choice: Choice; priorExposure: Exposure; createdAt: string; presentation: "BLIND" | "ASSISTED"; reason: string | null };
export type Reference = { sampleId: string; metricId: string; judgment: "PASS" | "FAIL"; reviewers: string[]; revisions: string[]; scope: "EXACT_OUTPUT_METRIC_ONLY" };
export type Policy = { id: string; frozenAt: string; state: "INSUFFICIENT" | "EXPLORATORY"; sourceReviewHash: string; groups: string[]; thresholds: { profileHash: string; metricId: string; threshold: number; groups: number; defects: number; clean: number; defectGroups: number; cleanGroups: number }[] };
export type GeneratedOutput = { sampleId: string; variant: "BASELINE" | "CANDIDATE"; output: string; outputHash: string;
  generation: { evidence: "MEASURED"; model: string; recipeHash: string; requestHash: string; elapsedMs: number; usage: { inputTokens: number; outputTokens: number } | null }; evaluation?: QualityRun };
export type Step = { id: string; sampleId: string; variant: "BASELINE" | "CANDIDATE"; kind: "GENERATE" | "EVALUATE"; status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "INTERRUPTED"; token: string | null; deadlineAt: string | null; error: string | null };
export type Experiment = { id: string; recipeHash: string; createdAt: string; state: "FROZEN"; generatorModel: string; generatorHash: string; evaluator: QualityProfile;
  sampleIds: string[]; developmentGroups: string[]; instructions: { metricId: string; text: string; sampleIds: string[]; confidence: "HYPOTHESIS" }[];
  steps: Step[]; outputs: GeneratedOutput[]; decision: { reviewerId: string; choice: "KEEP_BASELINE" | "MORE_EVIDENCE" | "HOLD" | "SELECT_CANDIDATE"; reportHash: string; createdAt: string } | null };
export type Pair = { id: string; experimentId: string; sampleId: string; reviewerId: string; a: "BASELINE" | "CANDIDATE"; b: "BASELINE" | "CANDIDATE"; createdAt: string; outputHashes: string[] };
export type PairVote = { pairId: string; reviewerId: string; revision: number; choice: "A" | "B" | "TIE" | "UNCERTAIN" | "SKIP"; winner: "BASELINE" | "CANDIDATE" | "TIE" | "UNCERTAIN" | "SKIP"; priorExposure: Exposure; createdAt: string };
export type RegressionRequirement = { id: string; sampleId: string; groupId: string; inputHash: string; profileHash: string; metricId: string; threshold: number; reference: Reference; createdAt: string };
export type JudgeReplay = { id: string; sampleId: string; evaluator: QualityProfile; status: Step["status"]; token: string; deadlineAt: string; run: QualityRun | null; error: string | null };
export type Study = { version: "press-quality-study/v1"; name: string; frozenAt: string | null; datasetHash: string | null;
  samples: Sample[]; batches: ReviewBatch[]; reviews: Review[]; policy: Policy | null; experiments: Experiment[];
  pairs: Pair[]; pairwiseVotes: PairVote[]; regressions: RegressionRequirement[];
  judgeReplays: JudgeReplay[]; exposedReviewers: string[]; receipts: { key: string; hash: string; ref: string | null; actor: string }[] };

const id = z.string().min(1).max(100), key = z.string().min(8).max(100).regex(/^[\w-]+$/);
export const createStudySchema = z.object({ name: z.string().trim().min(1).max(120), idempotencyKey: key }).strict();
export const reviewSubmissionSchema = z.object({ batchId: id, itemId: id, expectedRevision: z.number().int().min(0), choice: choiceSchema,
  priorExposure: exposureSchema, reason: z.string().trim().max(2000).optional() }).strict();
const base = { expectedRevision: z.number().int().min(0), idempotencyKey: key };
export const studyCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("ADD_SAMPLES"), samples: z.array(z.object({ articleId: id, runId: id, partition: partitionSchema }).strict()).min(1).max(60) }).strict(),
  z.object({ ...base, action: z.literal("FREEZE_DATASET") }).strict(),
  z.object({ ...base, action: z.literal("ASSIGN_REVIEW"), purpose: z.enum(["PRODUCT", "DEVELOPMENT", "CALIBRATION", "AUDIT"]) }).strict(),
  z.object({ ...base, action: z.literal("SUBMIT_REVIEW"), review: reviewSubmissionSchema }).strict(),
  z.object({ ...base, action: z.literal("FREEZE_CALIBRATION") }).strict(),
  z.object({ ...base, action: z.literal("PLAN_EXPERIMENT"), sampleIds: z.array(id).min(1).max(20) }).strict(),
  z.object({ ...base, action: z.literal("RUN_STEP"), experimentId: id, allowModelSpend: z.literal(true) }).strict(),
  z.object({ ...base, action: z.literal("REEVALUATE_JUDGE"), sampleId: id, allowModelSpend: z.literal(true) }).strict(),
  z.object({ ...base, action: z.literal("ASSIGN_PAIRWISE"), experimentId: id, sampleId: id }).strict(),
  z.object({ ...base, action: z.literal("SUBMIT_PAIRWISE"), pairId: id, choice: z.enum(["A", "B", "TIE", "UNCERTAIN", "SKIP"]), priorExposure: exposureSchema, voteRevision: z.number().int().min(0) }).strict(),
  z.object({ ...base, action: z.literal("PROMOTE_REGRESSION"), sampleId: id, metricId: id }).strict(),
  z.object({ ...base, action: z.literal("DECIDE"), experimentId: id, choice: z.enum(["KEEP_BASELINE", "MORE_EVIDENCE", "HOLD", "SELECT_CANDIDATE"]) }).strict(),
]);
export type StudyCommand = z.infer<typeof studyCommandSchema>;
export function generationInputIdentity(snapshot: QualitySnapshot) { return { request: snapshot.input.request, facts: snapshot.facts, contexts: snapshot.input.contexts }; }
