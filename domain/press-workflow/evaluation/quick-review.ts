import { z } from "zod";
import { criterionSchema, digest, hash, judgmentValueSchema, type Dataset, type EvaluationBundle } from "./contracts";
import { buildReport, reviewPacket, reviewSchema } from "./report";
import { evaluationReviewId } from "./analysis";

export const selectionSchema = z.object({ sessionId: digest, revision: z.number().int().nonnegative(), reviewId: digest,
  criterion: criterionSchema, judgment: judgmentValueSchema.nullable(), confirmed: z.literal(true) }).strict();
export const sessionSchema = z.object({ version: z.literal("press-quick-review/v1"), sessionId: digest, revision: z.number().int().nonnegative(),
  method: z.literal("SELECTION_ONLY"), seed: z.string().min(1).max(100), budget: z.number().int().min(1).max(20),
  importedReviewHash: digest.nullable(), packet: reviewSchema,
  queue: z.array(z.object({ reviewId: digest, selection: z.enum(["RANDOM_AUDIT", "RISK_PRIORITY"]) }).strict()).max(20),
  remainingDrafts: z.number().int().nonnegative(),
  events: z.array(z.object({ revision: z.number().int().positive(), reviewId: digest, criterion: criterionSchema, judgment: judgmentValueSchema.nullable(),
    selectedAt: z.string().datetime(), actor: z.literal("LOCAL_HUMAN_SELECTION") }).strict()).max(3000),
}).strict();
export type ReviewSession = z.infer<typeof sessionSchema>;
export function createReviewSession(dataset: Dataset, batch: EvaluationBundle, imported?: unknown, budget = 2, seed = "default-audit-seed"): ReviewSession {
  if (!Number.isInteger(budget) || budget < 1 || budget > 20) throw new Error("INVALID_REVIEW_BUDGET");
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
  const queue: ReviewSession["queue"] = audit ? [{ reviewId: audit.reviewId, selection: "RANDOM_AUDIT" }, ...ranked.slice(0, budget - 1).map(e => ({ reviewId: e.reviewId, selection: "RISK_PRIORITY" as const }))] : [];
  return sessionSchema.parse({ version: "press-quick-review/v1", sessionId: hash({ artifact: hash(batch), imported: imported ? hash(imported) : null, seed, budget }),
    revision: 0, method: "SELECTION_ONLY", seed, budget, importedReviewHash: imported ? hash(imported) : null, packet, queue, remainingDrafts: pending.length - queue.length, events: [] });
}
export function selectAnswer(sessionInput: ReviewSession, input: unknown): ReviewSession {
  const session = sessionSchema.parse(sessionInput), selection = selectionSchema.parse(input);
  if (selection.sessionId !== session.sessionId || selection.revision !== session.revision) throw new Error("STALE_REVIEW_REVISION");
  if (!session.queue.some(q => q.reviewId === selection.reviewId)) throw new Error("UNSELECTED_REVIEW_ENTRY");
  const next = structuredClone(session), entry = next.packet.entries.find(e => e.reviewId === selection.reviewId)!;
  const label = entry.labels.find(l => l.criterion === selection.criterion)!;
  label.judgment = selection.judgment;
  label.reason = selection.judgment === null ? "" : `선택형 검토: ${{ PASS: "충족", FAIL: "위반", UNCERTAIN: "판단 어려움" }[selection.judgment]} 선택. 자유 서술 이유는 수집하지 않았습니다.`;
  const selectedAt = new Date().toISOString();
  next.packet.reviewer = { type: "HUMAN", id: "local-selection-review", reviewedAt: selectedAt, attestation: "I reviewed the blinded outputs myself" };
  next.revision++;
  next.events.push({ revision: next.revision, reviewId: selection.reviewId, criterion: selection.criterion, judgment: selection.judgment, selectedAt, actor: "LOCAL_HUMAN_SELECTION" });
  return sessionSchema.parse(next);
}
