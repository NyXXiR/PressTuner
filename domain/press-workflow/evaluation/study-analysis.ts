import { hash } from "./contracts";
import { pairedInterval } from "./analysis";
import { latestReviews, references, requireStudy } from "./study";
import type { Study, Partition, Reference } from "./study-contracts";

const ratio = (n: number, d: number) => d ? n / d : null;
export function agreement(pairs: [string, string][]) {
  const usable = pairs.filter(p => p.every(x => x === "PASS" || x === "FAIL")), n = usable.length;
  const observed = ratio(usable.filter(([a, b]) => a === b).length, n);
  const p1 = ratio(usable.filter(p => p[0] === "PASS").length, n), p2 = ratio(usable.filter(p => p[1] === "PASS").length, n);
  const expected = p1 === null || p2 === null ? null : p1 * p2 + (1 - p1) * (1 - p2);
  return { compared: n, excluded: pairs.length - n, rawAgreement: observed, kappa: expected === null || expected === 1 ? null : (observed! - expected) / (1 - expected),
    reason: !n ? "NO_INDEPENDENT_RATINGS" : expected === 1 ? "DEGENERATE_MARGINALS" : null, marginals: { firstPass: p1, secondPass: p2 } };
}
type Observation = { group: string; human: string | null; auto: string | null };
function counts(rows: Observation[]) {
  const tp = rows.filter(r => r.human === "FAIL" && r.auto === "FAIL").length, fn = rows.filter(r => r.human === "FAIL" && r.auto === "PASS").length;
  const fp = rows.filter(r => r.human === "PASS" && r.auto === "FAIL").length, tn = rows.filter(r => r.human === "PASS" && r.auto === "PASS").length;
  const labeled = rows.filter(r => r.human).length, compared = tp + fn + fp + tn;
  return { truePositive: tp, falseNegative: fn, falsePositive: fp, trueNegative: tn, labeled, compared, unavailable: labeled - compared,
    unlabeledOrUncertain: rows.length - labeled, coverage: ratio(compared, labeled), agreement: ratio(tp + tn, compared),
    defectRecall: ratio(tp, tp + fn), endToEndDefectRecall: ratio(tp, rows.filter(r => r.human === "FAIL").length), falsePositiveRate: ratio(fp, fp + tn), precision: ratio(tp, tp + fp) };
}
function clusterIntervals(rows: Observation[]) {
  const groups = [...new Set(rows.filter(r => r.human).map(r => r.group))];
  if (groups.length < 10) return { method: "SOURCE_GROUP_PERCENTILE_BOOTSTRAP", state: "INSUFFICIENT_GROUPS", intervals: null };
  let seed = 19773;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const values = Array.from({ length: 1000 }, () => counts(groups.flatMap(() => { const g = groups[Math.floor(random() * groups.length)]; return rows.filter(r => r.group === g); })));
  const interval = (key: "agreement" | "endToEndDefectRecall" | "falsePositiveRate") => {
    const xs = values.map(v => v[key]); if (xs.some(x => x === null)) return null;
    const sorted = (xs as number[]).sort((a, b) => a - b); if (sorted[0] === sorted.at(-1)) return null;
    return { low: sorted[24], high: sorted[974] };
  };
  return { method: "SOURCE_GROUP_PERCENTILE_BOOTSTRAP", state: "EXPLORATORY", intervals: { agreement: interval("agreement"), defectRecall: interval("endToEndDefectRecall"), falsePositiveRate: interval("falsePositiveRate") } };
}
function rowsFor(s: Study, refs: Reference[], partition: Partition, profileHash: string, metricId: string, threshold: number | null): Observation[] {
  return s.samples.filter(x => x.partition === partition && x.run.profileHash === profileHash && x.run.profile.metrics.some(m => m.id === metricId && m.applicable)).map(x => {
    const m = x.run.results.find(m => m.id === metricId), ref = refs.find(r => r.sampleId === x.id && r.metricId === metricId);
    return { group: x.groupId, human: ref?.judgment ?? null, auto: m?.state === "COMPLETED" && m.score !== null && threshold !== null ? m.score >= threshold ? "PASS" : "FAIL" : null };
  });
}
export function freezeCalibration(s: Study, now: string) {
  requireStudy(s.frozenAt, "DATASET_NOT_FROZEN"); requireStudy(!s.policy, "CALIBRATION_POLICY_FROZEN");
  const refs = references(s), keys = new Map(s.samples.filter(x => x.partition === "CALIBRATION").flatMap(x => x.run.profile.metrics.filter(m => m.applicable).map(m => [`${x.run.profileHash}/${m.id}`, { profileHash: x.run.profileHash, metricId: m.id }] as const)));
  const thresholds = [...keys.values()].flatMap(key => {
    const labeled = s.samples.filter(x => x.partition === "CALIBRATION" && x.run.profileHash === key.profileHash).flatMap(x => {
      const ref = refs.find(r => r.sampleId === x.id && r.metricId === key.metricId), m = x.run.results.find(m => m.id === key.metricId);
      return ref && m?.state === "COMPLETED" && m.score !== null ? [{ group: x.groupId, judgment: ref.judgment, score: m.score }] : [];
    });
    const defects = labeled.filter(x => x.judgment === "FAIL").length, clean = labeled.length - defects;
    if (!defects || !clean) return [];
    // Fixed hundredth grid; equal-weight source groups, false negatives cost 2x.
    const candidates = Array.from({ length: 101 }, (_, i) => i / 100).map(threshold => {
      const groups = [...new Set(labeled.map(x => x.group))];
      const loss = groups.reduce((sum, group) => { const rows = labeled.filter(x => x.group === group); return sum + rows.reduce((n, x) => n + (x.judgment === "FAIL" && x.score >= threshold ? 2 : x.judgment === "PASS" && x.score < threshold ? 1 : 0), 0) / rows.length; }, 0) / groups.length;
      return { threshold, loss };
    }).sort((a, b) => a.loss - b.loss || b.threshold - a.threshold);
    return [{ ...key, threshold: candidates[0].threshold, groups: new Set(labeled.map(x => x.group)).size, defects, clean,
      defectGroups: new Set(labeled.filter(x => x.judgment === "FAIL").map(x => x.group)).size, cleanGroups: new Set(labeled.filter(x => x.judgment === "PASS").map(x => x.group)).size }];
  });
  s.policy = { id: hash({ dataset: s.datasetHash, thresholds, now }), frozenAt: now, sourceReviewHash: hash(refs.filter(r => s.samples.find(x => x.id === r.sampleId)?.partition === "CALIBRATION")),
    state: thresholds.length && thresholds.every(x => x.groups >= 10 && x.defectGroups >= 3 && x.cleanGroups >= 3) ? "EXPLORATORY" : "INSUFFICIENT",
    groups: [...new Set(s.samples.filter(x => x.partition === "CALIBRATION").map(x => x.groupId))], thresholds };
  return s.policy;
}
export function studyReport(s: Study) {
  const refs = references(s), latest = latestReviews(s), keys = new Map(s.samples.flatMap(x => x.run.profile.metrics.filter(m => m.applicable).map(m => [`${x.run.profileHash}/${m.id}`, { profileHash: x.run.profileHash, metricId: m.id, nativeThreshold: m.threshold }] as const)));
  const metrics = (["DEVELOPMENT", "CALIBRATION", "AUDIT", "HOLDOUT"] as const).flatMap(partition => [...keys.values()].map(key => {
    const calibrated = s.policy?.thresholds.find(x => x.profileHash === key.profileHash && x.metricId === key.metricId), threshold = calibrated?.threshold ?? key.nativeThreshold;
    const rows = rowsFor(s, refs, partition, key.profileHash, key.metricId, threshold), c = counts(rows), groups = new Set(rows.filter(x => x.human).map(x => x.group)).size;
    const defectGroups = new Set(rows.filter(x => x.human === "FAIL").map(x => x.group)).size, cleanGroups = new Set(rows.filter(x => x.human === "PASS").map(x => x.group)).size;
    return { ...key, partition, threshold, thresholdSource: calibrated ? "FROZEN_CALIBRATION" : key.nativeThreshold === null ? "NO_BINARY_THRESHOLD" : "NATIVE_UNCALIBRATED", groups, defectGroups, cleanGroups, samples: rows.length, ...c, ...clusterIntervals(rows),
      reliability: partition === "AUDIT" && calibrated && s.policy?.state === "EXPLORATORY" && groups >= 10 && c.coverage === 1 && defectGroups >= 3 && cleanGroups >= 3 ? "OBSERVED_AUDIT_ONLY" : "INSUFFICIENT" };
  })).filter(x => x.samples);
  const reviewers = [...new Set(latest.filter(r => r.presentation === "BLIND" && r.priorExposure === "NONE").map(r => r.reviewerId))];
  const interRater = [...keys.values()].flatMap(key => reviewers.flatMap((a, i) => reviewers.slice(i + 1).map(b => {
    const pairs: [string, string][] = [];
    for (const sample of s.samples.filter(x => x.run.profileHash === key.profileHash)) {
      const vote = (actor: string) => latest.find(r => r.reviewerId === actor && r.priorExposure === "NONE" && r.presentation === "BLIND" && s.batches.find(x => x.id === r.batchId)?.items.some(item => item.id === r.itemId && item.sampleId === sample.id && item.metricId === key.metricId));
      const first = vote(a), second = vote(b); if (first && second) pairs.push([first.choice, second.choice]);
    }
    return { ...key, reviewers: [a, b], ...agreement(pairs) };
  }))).filter(x => x.compared || x.excluded);
  return { version: "press-study-report/v1", datasetHash: s.datasetHash, referenceScope: "HUMAN_VERIFIED_EXACT_OUTPUT_AND_CRITERION", references: refs,
    metrics, interRater, policy: s.policy, judgeComparisons: s.judgeReplays.map(replay => {
      const source = s.samples.find(x => x.id === replay.sampleId)!;
      const sameDefinition = (id: string) => hash(source.run.profile.metrics.find(x => x.id === id) ?? null) === hash(replay.evaluator.metrics.find(x => x.id === id) ?? null) && hash((source.run.profile.configuration as { rubric?: unknown })?.rubric ?? null) === hash((replay.evaluator.configuration as { rubric?: unknown })?.rubric ?? null);
      return { id: replay.id, sampleId: source.id, state: replay.status, input: "SAME_FROZEN_OUTPUT", originalProfileHash: source.run.profileHash, candidateProfileHash: hash(replay.evaluator),
        metrics: replay.evaluator.metrics.filter(m => m.applicable).map(m => ({ metricId: m.id, comparableDefinition: sameDefinition(m.id),
          original: source.run.results.find(x => x.id === m.id) ?? null, candidate: replay.run?.results.find(x => x.id === m.id) ?? null,
          reference: sameDefinition(m.id) ? refs.find(x => x.sampleId === source.id && x.metricId === m.id) ?? null : null })), reliability: "REVIEWED_SAMPLE_ONLY_NOT_INDEPENDENT_CERTIFICATION" };
    }), scope: "OPERATOR_SELECTED_BENCHMARK_NOT_POPULATION",
    reviewCounts: { revisions: s.reviews.length, latest: latest.length, uncertain: latest.filter(x => x.choice === "UNCERTAIN").length, skipped: latest.filter(x => x.choice === "SKIP").length, exposedOrUnknown: latest.filter(x => x.priorExposure !== "NONE").length },
    deploymentAuthorized: false, humanEffectivenessMeasured: false, minimumGroupsPolicy: "EXPLORATORY_10_NOT_STATISTICAL_GUARANTEE" };
}
export { pairedInterval };
