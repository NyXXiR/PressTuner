import { z } from "zod";
import { criterionSchema, digest, hash, judgmentValueSchema, type Dataset, type EvaluationBundle } from "./contracts";
import { buildReport, reviewPacket, reviewSchema } from "./report";
import { evaluationReviewId } from "./analysis";

export const selectionSchema = z.object({ sessionId: digest, revision: z.number().int().nonnegative(), reviewId: digest,
  criterion: criterionSchema, judgment: judgmentValueSchema.nullable(), confirmed: z.literal(true), displayedMs: z.number().int().min(0).max(3600000).optional() }).strict();
export const sessionSchema = z.object({ version: z.literal("press-quick-review/v1"), sessionId: digest, revision: z.number().int().nonnegative(),
  experimentDecisions: z.array(z.object({ artifactHash: digest, recipeHash: digest.nullable(), choice: z.enum(["KEEP_BASELINE", "CANDIDATE_FOR_TEST", "HOLD"]), decidedAt: z.string().datetime() }).strict()).max(100).optional(),
  method: z.literal("SELECTION_ONLY"), seed: z.string().min(1).max(100), budget: z.number().int().min(1).max(20),
  importedReviewHash: digest.nullable(), packet: reviewSchema,
  questionBudget: z.number().int().min(1).max(100).optional(),
  queue: z.array(z.object({ reviewId: digest, selection: z.enum(["RANDOM_AUDIT", "RISK_PRIORITY"]), criteria: z.array(criterionSchema).min(1).max(5).optional() }).strict()).max(20),
  remainingDrafts: z.number().int().nonnegative(),
  events: z.array(z.object({ revision: z.number().int().positive(), reviewId: digest, criterion: criterionSchema, judgment: judgmentValueSchema.nullable(),
    selectedAt: z.string().datetime(), actor: z.literal("LOCAL_HUMAN_SELECTION"), displayedMs: z.number().int().min(0).max(3600000).optional() }).strict()).max(3000),
}).strict();
export type ReviewSession = z.infer<typeof sessionSchema>;
export function selectExperiment(session: ReviewSession, input: unknown, batch: EvaluationBundle): ReviewSession {
  const selection = z.object({ sessionId: digest, revision: z.number().int().nonnegative(), choice: z.enum(["KEEP_BASELINE", "CANDIDATE_FOR_TEST", "HOLD"]) }).strict().parse(input);
  if (selection.sessionId !== session.sessionId || selection.revision !== session.revision) throw new Error("STALE_REVIEW_REVISION");
  if (session.packet.artifactHash !== hash(batch)) throw new Error("SESSION_ARTIFACT_MISMATCH");
  if (selection.choice === "CANDIDATE_FOR_TEST" && !batch.generation.experimentRecipe) throw new Error("NO_FROZEN_CANDIDATE");
  const next = structuredClone(session);
  next.revision++;
  next.experimentDecisions = [...(next.experimentDecisions ?? []), { artifactHash: hash(batch), recipeHash: batch.generation.experimentRecipe ? hash(batch.generation.experimentRecipe) : null, choice: selection.choice, decidedAt: new Date().toISOString() }];
  return sessionSchema.parse(next);
}
export function createReviewSession(dataset: Dataset, batch: EvaluationBundle, imported?: unknown, budget = 2, seed = "default-audit-seed", questionBudget?: number): ReviewSession {
  if (!Number.isInteger(budget) || budget < 1 || budget > 20) throw new Error("INVALID_REVIEW_BUDGET");
  if (questionBudget !== undefined && (!Number.isInteger(questionBudget) || questionBudget < 1 || questionBudget > 100)) throw new Error("INVALID_QUESTION_BUDGET");
  buildReport(dataset, batch, imported);
  const packet = imported ? reviewSchema.parse(imported) : reviewSchema.parse(reviewPacket(dataset, batch));
  const pending = packet.entries.filter(e => e.labels.some(l => l.judgment === null));
  const auditOrder = [...pending].sort((a, b) => hash({ seed, id: a.reviewId }).localeCompare(hash({ seed, id: b.reviewId })));
  const audit = auditOrder[0];
  const risk = (id: string) => {
    const e = batch.evaluations.find(e => evaluationReviewId(e) === id)!;
    return (e.domain.state !== "EVALUATED" ? 100 : 0) + (e.ragas.state !== "EVALUATED" ? 80 : 0)
      + (e.domain.verdict === "PASS" && e.ragas.score !== null ? (1 - e.ragas.score) * 50 : 0)
      + e.domain.checks.filter(c => c.judgment === "FAIL").length * 5;
  };
  const ranked = pending.filter(e => e !== audit).sort((a, b) => risk(b.reviewId) - risk(a.reviewId) || a.reviewId.localeCompare(b.reviewId));
  let queue: ReviewSession["queue"] = audit ? [{ reviewId: audit.reviewId, selection: "RANDOM_AUDIT" }, ...ranked.slice(0, budget - 1).map(e => ({ reviewId: e.reviewId, selection: "RISK_PRIORITY" as const }))] : [];
  if (questionBudget !== undefined) {
    let remaining = questionBudget;
    queue = queue.flatMap(q => {
      if (!remaining) return [];
      const entry = packet.entries.find(e => e.reviewId === q.reviewId)!;
      const evaluated = batch.evaluations.find(e => evaluationReviewId(e) === q.reviewId)!;
      const candidates = entry.labels.filter(l => l.judgment === null).map(l => l.criterion);
      const priority = (c: typeof candidates[number]) => {
        const judgment = evaluated.domain.checks.find(j => j.criterion === c)?.judgment;
        return !judgment || judgment === "UNCERTAIN" ? 100 : judgment === "FAIL" ? c === "REQUESTED_STYLE" ? 40 : 80 : c === "FACTUAL_SUPPORT" && evaluated.ragas.score !== 1 ? 60 : 0;
      };
      candidates.sort(q.selection === "RANDOM_AUDIT" ? (a, b) => hash({ seed, id: q.reviewId, criterion: a }).localeCompare(hash({ seed, id: q.reviewId, criterion: b }))
        : (a, b) => priority(b) - priority(a) || a.localeCompare(b));
      const criteria = candidates.slice(0, q.selection === "RANDOM_AUDIT" ? 1 : remaining);
      remaining -= criteria.length;
      return criteria.length ? [{ ...q, criteria }] : [];
    });
  }
  return sessionSchema.parse({ version: "press-quick-review/v1", sessionId: hash({ artifact: hash(batch), imported: imported ? hash(imported) : null, seed, budget, ...(questionBudget !== undefined ? { questionBudget } : {}) }),
    revision: 0, method: "SELECTION_ONLY", seed, budget, ...(questionBudget !== undefined ? { questionBudget } : {}), importedReviewHash: imported ? hash(imported) : null, packet, queue, remainingDrafts: pending.length - queue.length, events: [] });
}
export function selectAnswer(sessionInput: ReviewSession, input: unknown): ReviewSession {
  const session = sessionSchema.parse(sessionInput), selection = selectionSchema.parse(input);
  if (selection.sessionId !== session.sessionId || selection.revision !== session.revision) throw new Error("STALE_REVIEW_REVISION");
  if (!session.queue.some(q => q.reviewId === selection.reviewId && (!q.criteria || q.criteria.includes(selection.criterion)))) throw new Error("UNSELECTED_REVIEW_ENTRY");
  const next = structuredClone(session), entry = next.packet.entries.find(e => e.reviewId === selection.reviewId)!;
  const label = entry.labels.find(l => l.criterion === selection.criterion)!;
  label.judgment = selection.judgment;
  label.reason = selection.judgment === null ? "" : `선택형 검토: ${{ PASS: "충족", FAIL: "위반", UNCERTAIN: "판단 어려움" }[selection.judgment]} 선택. 자유 서술 이유는 수집하지 않았습니다.`;
  const selectedAt = new Date().toISOString();
  next.packet.reviewer = { type: "HUMAN", id: "local-selection-review", reviewedAt: selectedAt, attestation: "I reviewed the blinded outputs myself" };
  next.revision++;
  next.events.push({ revision: next.revision, reviewId: selection.reviewId, criterion: selection.criterion, judgment: selection.judgment, selectedAt, actor: "LOCAL_HUMAN_SELECTION", ...(selection.displayedMs !== undefined ? { displayedMs: selection.displayedMs } : {}) });
  return sessionSchema.parse(next);
}
