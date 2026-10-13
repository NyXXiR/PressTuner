import { hash } from "./contracts";
import type { QualityRun } from "./article-evaluation";
import { reviewSubmissionSchema, type Study, type Partition, type ReviewBatch, type Review, type Reference } from "./study-contracts";
export * from "./study-contracts";
export { studyReport, freezeCalibration, agreement } from "./study-analysis";
export { planExperiment, assignPairwise, pairwisePacket, submitPairwise, promoteStudyRegression, studyRegressionGate, experimentReport } from "./study-experiment";

export function requireStudy(condition: unknown, code: string): asserts condition { if (!condition) throw new Error(code); }
export function newStudy(name: string): Study {
  return { version: "press-quality-study/v1", name, frozenAt: null, datasetHash: null, samples: [], batches: [], reviews: [], policy: null, experiments: [], pairs: [], pairwiseVotes: [], regressions: [], judgeReplays: [], exposedReviewers: [], receipts: [] };
}
export function addSamples(s: Study, rows: { run: QualityRun; partition: Partition }[]) {
  requireStudy(!s.frozenAt, "DATASET_FROZEN"); requireStudy(s.samples.length + rows.length <= 60, "SAMPLE_LIMIT");
  const all = [...s.samples, ...rows.map(({ run, partition }) => {
    requireStudy(run.status !== "RUNNING", "RUN_NOT_FINISHED");
    const documents = run.snapshot.facts.flatMap(f => (f as typeof f & { documentId?: string }).documentId ? [`document:${(f as typeof f & { documentId: string }).documentId}`] : []);
    return { id: run.id, groupId: "", partition, run: structuredClone(run), outputHash: hash(run.snapshot.input.output),
      sourceKeys: [`article:${run.articleId}`, ...documents, `facts:${hash(run.snapshot.input.contexts.map(x => x.trim().replace(/\s+/g, " ")).sort())}`] };
  })].map(x => structuredClone(x));
  requireStudy(new Set(all.map(x => x.id)).size === all.length, "DUPLICATE_SAMPLE");
  requireStudy(new Set(all.map(x => `${x.run.articleId}/${x.outputHash}/${x.run.profileHash}`)).size === all.length, "DUPLICATE_OUTPUT_PROFILE");
  // Conservative connected source families. A shared article/document or identical
  // fact set merges groups; editing an output cannot create an independent source.
  const groups = all.map((_, i) => i);
  const root = (i: number): number => groups[i] === i ? i : (groups[i] = root(groups[i]));
  for (let i = 0; i < all.length; i++) for (let j = 0; j < i; j++) if (all[i].sourceKeys.some(k => all[j].sourceKeys.includes(k))) groups[root(i)] = root(j);
  for (let i = 0; i < all.length; i++) {
    const family = all.filter((_, j) => root(j) === root(i));
    requireStudy(new Set(family.map(x => x.partition)).size === 1, "SOURCE_GROUP_SPLIT_LEAKAGE");
    all[i].groupId = hash([...new Set(family.flatMap(x => x.sourceKeys))].sort());
  }
  s.samples = all;
}
export function freezeStudy(s: Study, now: string) {
  requireStudy(!s.frozenAt && s.samples.length > 0, "DATASET_ALREADY_FROZEN_OR_EMPTY");
  s.datasetHash = hash(s.samples.map(x => ({ id: x.id, groupId: x.groupId, partition: x.partition, fingerprint: x.run.fingerprint, profileHash: x.run.profileHash, outputHash: x.outputHash })));
  s.frozenAt = now;
}
export function latestReviews(s: Study): Review[] {
  const latest = new Map<string, Review>(); for (const r of s.reviews) latest.set(`${r.batchId}/${r.itemId}`, r); return [...latest.values()];
}
export function references(s: Study): Reference[] {
  const votes = new Map<string, { sampleId: string; metricId: string; rows: Review[] }>();
  for (const r of latestReviews(s)) {
    const b = s.batches.find(x => x.id === r.batchId)!, item = b.items.find(x => x.id === r.itemId)!;
    if (b.purpose === "PRODUCT" || r.priorExposure !== "NONE" || r.presentation !== "BLIND" || !["PASS", "FAIL"].includes(r.choice)) continue;
    const k = `${item.sampleId}/${item.metricId}`, existing = votes.get(k) ?? { sampleId: item.sampleId, metricId: item.metricId, rows: [] };
    existing.rows.push(r); votes.set(k, existing);
  }
  return [...votes.values()].flatMap(v => new Set(v.rows.map(r => r.choice)).size !== 1 ? [] : [{ sampleId: v.sampleId, metricId: v.metricId, judgment: v.rows[0].choice as "PASS" | "FAIL",
    reviewers: [...new Set(v.rows.map(r => r.reviewerId))], revisions: v.rows.map(r => `${r.batchId}/${r.itemId}/${r.revision}`), scope: "EXACT_OUTPUT_METRIC_ONLY" as const }]);
}
export function assignReviews(s: Study, reviewerId: string, purpose: ReviewBatch["purpose"], now: string, random: () => number): ReviewBatch {
  requireStudy(s.frozenAt, "DATASET_NOT_FROZEN");
  if (purpose === "AUDIT") requireStudy(s.policy, "CALIBRATION_POLICY_REQUIRED");
  if (purpose === "CALIBRATION") requireStudy(!s.policy, "CALIBRATION_POLICY_FROZEN");
  const latest = latestReviews(s);
  const open = s.batches.find(b => b.reviewerId === reviewerId && b.purpose === purpose && b.items.some(i => !latest.some(r => r.batchId === b.id && r.itemId === i.id)));
  if (open) return open;
  const seen = new Set(s.batches.filter(b => b.reviewerId === reviewerId && (b.purpose === "PRODUCT") === (purpose === "PRODUCT")).flatMap(b => b.items.map(i => `${i.sampleId}/${i.metricId}`)));
  const pool = s.samples.filter(x => purpose === "PRODUCT" ? x.partition === "DEVELOPMENT" : x.partition === purpose).flatMap(x => x.run.profile.metrics.filter(m => m.applicable).map(m => ({ sampleId: x.id, metricId: m.id, id: hash({ sampleId: x.id, metricId: m.id }) }))).filter(i => !seen.has(`${i.sampleId}/${i.metricId}`));
  requireStudy(pool.length, "NO_REVIEW_ITEMS");
  if (purpose === "PRODUCT") pool.sort((a, b) => {
    const risk = (i: typeof a) => { const m = s.samples.find(x => x.id === i.sampleId)!.run.results.find(x => x.id === i.metricId); return !m || m.state === "FAILED" ? 2 : m.thresholdPassed === false ? 1 : 0; };
    return risk(b) - risk(a);
  });
  else for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const batch = { id: hash({ reviewerId, purpose, now, index: s.batches.length }), reviewerId, purpose, items: pool.slice(0, 3), createdAt: now,
    sampling: purpose === "PRODUCT" ? "RISK_RANKED" as const : "UNIFORM_WITHOUT_REPLACEMENT" as const, poolSize: pool.length, inclusionProbability: purpose === "PRODUCT" ? 1 : Math.min(3, pool.length) / pool.length };
  requireStudy(s.batches.length < 300, "REVIEW_BATCH_LIMIT"); s.batches.push(batch); return batch;
}
export function reviewPacket(s: Study, batchId: string, reviewerId: string) {
  const b = s.batches.find(x => x.id === batchId); requireStudy(b && b.reviewerId === reviewerId, "REVIEW_OWNER_REQUIRED");
  return { id: b.id, purpose: b.purpose, sampling: b.sampling, poolSize: b.poolSize, inclusionProbability: b.inclusionProbability, presentation: b.purpose === "PRODUCT" ? "ASSISTED" : "BLIND",
    items: b.items.map(i => {
      const sample = s.samples.find(x => x.id === i.sampleId)!, saved = latestReviews(s).find(r => r.batchId === b.id && r.itemId === i.id);
      return { id: i.id, criterion: i.metricId, instruction: reviewInstruction(i.metricId), request: sample.run.snapshot.input.request, output: sample.run.snapshot.input.output, facts: sample.run.snapshot.input.contexts,
        choices: b.purpose === "PRODUCT" ? ["APPLY", "KEEP", "DEFER"] : ["PASS", "FAIL", "UNCERTAIN", "SKIP"], actionEffect: b.purpose === "PRODUCT" ? "RECORDED_INTENT_ONLY" : "REFERENCE_CANDIDATE", revision: saved?.revision ?? 0, choice: saved?.choice ?? null,
        ...(b.purpose === "PRODUCT" ? { automatic: sample.run.results.find(m => m.id === i.metricId) ?? null } : {}) };
    }) };
}
export function reviewInstruction(id: string) {
  const text: Record<string, string> = { FACTUAL_SUPPORT: "초안의 사실 주장이 제공된 근거로 뒷받침되는지 판단하세요.", PROMOTIONAL_CLAIMS: "근거 없는 성과·우수성·시장 평가·홍보 표현이 없는지 판단하세요.", REQUIRED_FACTS: "지정된 필수 사실이 모두 포함됐는지 판단하세요.", REQUESTED_STYLE: "지정된 요청 문체를 따르는지 판단하세요.", STYLE_LEAKAGE: "표현 예시의 사실이 현재 초안에 섞이지 않았는지 판단하세요.", RAGAS: "초안의 모든 사실 주장이 제공된 근거로 뒷받침되는지 판단하세요. 주장별 점수 정답과는 별도인 전체 출력 판정입니다.", DEEPEVAL: "초안의 사실 주장이 제공된 근거와 모순되지 않는지 판단하세요. 모호하지만 모순이 아닌 주장은 위반으로 보지 않습니다." };
  return text[id] ?? id;
}
export function submitReview(s: Study, value: unknown, reviewerId: string, now: string) {
  const args = reviewSubmissionSchema.parse(value), b = s.batches.find(x => x.id === args.batchId);
  requireStudy(b?.reviewerId === reviewerId && b.items.some(i => i.id === args.itemId), "REVIEW_OWNER_REQUIRED");
  requireStudy((b.purpose === "PRODUCT" ? ["APPLY", "KEEP", "DEFER"] : ["PASS", "FAIL", "UNCERTAIN", "SKIP"]).includes(args.choice), "INVALID_REVIEW_CHOICE");
  const old = latestReviews(s).find(r => r.batchId === b.id && r.itemId === args.itemId);
  requireStudy((old?.revision ?? 0) === args.expectedRevision, "REVIEW_REVISION_CONFLICT");
  if (b.purpose === "CALIBRATION") requireStudy(!s.policy, "CALIBRATION_POLICY_FROZEN");
  const item = b.items.find(i => i.id === args.itemId)!, sample = s.samples.find(x => x.id === item.sampleId)!;
  const assisted = s.batches.some(x => x.reviewerId === reviewerId && x.purpose === "PRODUCT" && x.items.some(i => i.sampleId === item.sampleId));
  const exposed = assisted || s.exposedReviewers.includes(reviewerId) || sample.run.createdById === reviewerId;
  const r: Review = { batchId: b.id, itemId: args.itemId, reviewerId, revision: args.expectedRevision + 1, choice: args.choice,
    priorExposure: exposed ? "SEEN_JUDGE" : args.priorExposure, createdAt: now, presentation: b.purpose === "PRODUCT" ? "ASSISTED" : "BLIND", reason: args.reason ?? null };
  requireStudy(s.reviews.length < 1500, "REVIEW_LIMIT"); s.reviews.push(r); return r;
}
