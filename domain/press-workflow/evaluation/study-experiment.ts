import { hash } from "./contracts";
import { pairedInterval, recommendationCopy } from "./analysis";
import { references, requireStudy } from "./study";
import { generationInputIdentity, type Study, type Experiment, type PairVote, type Exposure } from "./study-contracts";
import type { QualityProfile } from "./article-evaluation";
import { studyReport } from "./study-analysis";

const suggestions: Record<string, keyof typeof recommendationCopy> = { FACTUAL_SUPPORT: "GROUND_CLAIMS", PROMOTIONAL_CLAIMS: "GROUND_CLAIMS", RAGAS: "GROUND_CLAIMS", DEEPEVAL: "GROUND_CLAIMS", REQUIRED_FACTS: "PRESERVE_REQUIRED_FACTS", REQUESTED_STYLE: "ALIGN_STYLE", STYLE_LEAKAGE: "ISOLATE_STYLE" };
export function planExperiment(s: Study, args: { sampleIds: string[]; generatorModel: string; generatorHash: string; evaluator: QualityProfile; now: string }) {
  requireStudy(s.frozenAt, "DATASET_NOT_FROZEN"); requireStudy(s.experiments.length < 10, "EXPERIMENT_LIMIT");
  requireStudy(args.sampleIds.length > 0 && args.sampleIds.length <= 20 && new Set(args.sampleIds).size === args.sampleIds.length, "INVALID_EXPERIMENT_SAMPLES");
  const refs = references(s), instructions: Experiment["instructions"] = [];
  for (const sample of s.samples.filter(x => x.partition === "DEVELOPMENT")) for (const m of sample.run.profile.metrics.filter(x => x.applicable)) {
    const human = refs.find(x => x.sampleId === sample.id && x.metricId === m.id), automatic = sample.run.results.find(x => x.id === m.id);
    if ((human ? human.judgment === "FAIL" : automatic?.thresholdPassed === false) && suggestions[m.id]) {
      const found = instructions.find(x => x.metricId === m.id);
      if (found) found.sampleIds.push(sample.id); else instructions.push({ metricId: m.id, text: recommendationCopy[suggestions[m.id]].action, sampleIds: [sample.id], confidence: "HYPOTHESIS" });
    }
  }
  requireStudy(instructions.length, "DEVELOPMENT_FAILURE_REQUIRED");
  const targets = args.sampleIds.map(id => s.samples.find(x => x.id === id));
  requireStudy(targets.every(x => x && ["DEVELOPMENT", "HOLDOUT"].includes(x.partition)), "EXPERIMENT_PARTITION_INVALID");
  requireStudy(targets.every(x => x!.run.profileHash === hash(args.evaluator)), "EVALUATOR_IDENTITY_MISMATCH");
  const recipe = { datasetHash: s.datasetHash, sampleIds: args.sampleIds, generatorModel: args.generatorModel, generatorHash: args.generatorHash, evaluator: args.evaluator, instructions,
    developmentGroups: [...new Set(s.samples.filter(x => x.partition === "DEVELOPMENT").map(x => x.groupId))], createdAt: args.now };
  const recipeHash = hash(recipe), id = hash({ recipeHash, index: s.experiments.length });
  const e: Experiment = { id, recipeHash, state: "FROZEN", ...recipe, steps: args.sampleIds.flatMap(sampleId => (["BASELINE", "CANDIDATE"] as const).flatMap(variant => (["GENERATE", "EVALUATE"] as const).map(kind => ({ id: hash({ id, sampleId, variant, kind }), sampleId, variant, kind, status: "PENDING" as const, token: null, deadlineAt: null, error: null })))), outputs: [], decision: null };
  s.experiments.push(e); return e;
}
export function assignPairwise(s: Study, experimentId: string, sampleId: string, reviewerId: string, now: string, random: () => number) {
  const existing = s.pairs.find(x => x.experimentId === experimentId && x.sampleId === sampleId && x.reviewerId === reviewerId); if (existing) return existing;
  const e = s.experiments.find(x => x.id === experimentId), outputs = e?.outputs.filter(x => x.sampleId === sampleId);
  requireStudy(outputs?.length === 2 && new Set(outputs.map(x => x.variant)).size === 2, "PAIRWISE_OUTPUTS_REQUIRED");
  const a = random() < .5 ? "CANDIDATE" as const : "BASELINE" as const, b = a === "CANDIDATE" ? "BASELINE" as const : "CANDIDATE" as const;
  const pair = { id: hash({ experimentId, sampleId, reviewerId }), experimentId, sampleId, reviewerId, a, b, createdAt: now, outputHashes: [outputs.find(x => x.variant === a)!.outputHash, outputs.find(x => x.variant === b)!.outputHash] };
  requireStudy(s.pairs.length < 300, "PAIRWISE_LIMIT"); s.pairs.push(pair); return pair;
}
export function pairwisePacket(s: Study, id: string, reviewerId: string) {
  const p = s.pairs.find(x => x.id === id); requireStudy(p?.reviewerId === reviewerId, "PAIRWISE_OWNER_REQUIRED");
  const e = s.experiments.find(x => x.id === p.experimentId)!, sample = s.samples.find(x => x.id === p.sampleId)!;
  const latest = s.pairwiseVotes.filter(x => x.pairId === id).at(-1);
  return { id, request: sample.run.snapshot.input.request, facts: sample.run.snapshot.input.contexts, A: e.outputs.find(x => x.sampleId === p.sampleId && x.variant === p.a)!.output,
    B: e.outputs.find(x => x.sampleId === p.sampleId && x.variant === p.b)!.output, choices: ["A", "B", "TIE", "UNCERTAIN", "SKIP"], criterion: "사실을 유지하는 범위에서 문체·가독성·업무 유용성을 비교하세요.", revision: latest?.revision ?? 0, choice: latest?.choice ?? null };
}
export function submitPairwise(s: Study, pairId: string, reviewerId: string, choice: PairVote["choice"], priorExposure: Exposure, expectedRevision: number, now: string) {
  const pair = s.pairs.find(x => x.id === pairId); requireStudy(pair?.reviewerId === reviewerId, "PAIRWISE_OWNER_REQUIRED");
  requireStudy((s.pairwiseVotes.filter(x => x.pairId === pairId).at(-1)?.revision ?? 0) === expectedRevision, "PAIRWISE_REVISION_CONFLICT");
  requireStudy(s.pairwiseVotes.length < 1500, "PAIRWISE_VOTE_LIMIT");
  s.pairwiseVotes.push({ pairId, reviewerId, choice, priorExposure: s.exposedReviewers.includes(reviewerId) ? "SEEN_JUDGE" : priorExposure, revision: expectedRevision + 1, createdAt: now, winner: choice === "A" ? pair.a : choice === "B" ? pair.b : choice });
}
export function promoteStudyRegression(s: Study, sampleId: string, metricId: string, now: string) {
  const sample = s.samples.find(x => x.id === sampleId), reference = references(s).find(x => x.sampleId === sampleId && x.metricId === metricId && x.judgment === "FAIL");
  requireStudy(sample?.partition === "DEVELOPMENT" && reference, "DEVELOPMENT_HUMAN_FAILURE_REQUIRED");
  const definition = sample.run.profile.metrics.find(x => x.id === metricId), threshold = s.policy?.thresholds.find(x => x.profileHash === sample.run.profileHash && x.metricId === metricId)?.threshold ?? definition?.threshold;
  requireStudy(typeof threshold === "number", "REGRESSION_THRESHOLD_REQUIRED");
  const id = hash({ groupId: sample.groupId, metricId, profileHash: sample.run.profileHash, input: generationInputIdentity(sample.run.snapshot) });
  requireStudy(!s.regressions.some(x => x.id === id), "DUPLICATE_REGRESSION");
  const r = { id, sampleId, metricId, groupId: sample.groupId, profileHash: sample.run.profileHash, inputHash: hash(generationInputIdentity(sample.run.snapshot)), threshold, reference: structuredClone(reference), createdAt: now };
  s.regressions.push(r); return r;
}
export function studyRegressionGate(s: Study, e: Experiment) {
  const results = s.regressions.map(r => {
    const source = s.samples.find(x => x.id === r.sampleId)!, output = e.outputs.find(x => x.sampleId === r.sampleId && x.variant === "CANDIDATE"), run = output?.evaluation;
    const m = run?.results.find(x => x.id === r.metricId);
    const known = run && run.profileHash === r.profileHash && run.snapshot.input.output === output!.output && hash(generationInputIdentity(run.snapshot)) === r.inputHash && hash(generationInputIdentity(source.run.snapshot)) === r.inputHash && m?.state === "COMPLETED" && m.score !== null;
    return { requirementId: r.id, metricId: r.metricId, state: !known ? "UNKNOWN" : m.score! >= r.threshold ? "PASS" : "REGRESSION" };
  });
  const state = results.some(x => x.state === "REGRESSION") ? "REGRESSION" : !results.length || results.some(x => x.state === "UNKNOWN") ? "UNKNOWN" : "PASS";
  return { state, exitCode: state === "PASS" ? 0 : state === "REGRESSION" ? 1 : 2, manifestHash: hash(s.regressions), results, deploymentAuthorized: false };
}
export function experimentReport(s: Study, e: Experiment) {
  const pointwise = (["DEVELOPMENT", "HOLDOUT"] as const).flatMap(partition => e.evaluator.metrics.filter(x => x.applicable).map(m => {
    const sampleIds = e.sampleIds.filter(id => s.samples.find(x => x.id === id)!.partition === partition);
    const groups = [...new Set(sampleIds.map(id => s.samples.find(x => x.id === id)!.groupId))], deltas: number[] = [];
    let regressions = 0, unknown = 0;
    for (const group of groups) {
      const ids = sampleIds.filter(id => s.samples.find(x => x.id === id)!.groupId === group);
      const values = ids.map(id => {
        const outputs = (["BASELINE", "CANDIDATE"] as const).map(v => e.outputs.find(x => x.sampleId === id && x.variant === v));
        const scores = outputs.map(o => o?.evaluation?.profileHash === hash(e.evaluator) ? o.evaluation.results.find(x => x.id === m.id && x.state === "COMPLETED")?.score : null);
        return scores.every(x => x !== null && x !== undefined) ? scores[1]! - scores[0]! : null;
      });
      if (values.some(x => x === null)) { unknown++; continue; }
      if (values.some(x => x! < 0)) regressions++;
      deltas.push((values as number[]).reduce((a, b) => a + b, 0) / values.length);
    }
    return { metricId: m.id, partition, groups: groups.length, unknownGroups: unknown, regressions, ...pairedInterval(deltas) };
  })).filter(x => x.groups);
  const latest = new Map<string, PairVote>(); for (const v of s.pairwiseVotes) latest.set(v.pairId, v);
  const votes = [...latest.values()].filter(v => s.pairs.find(p => p.id === v.pairId)?.experimentId === e.id && v.priorExposure === "NONE");
  const gate = studyRegressionGate(s, e), incomplete = e.steps.some(x => x.status !== "COMPLETED");
  const audit = studyReport(s).metrics.filter(x => x.partition === "AUDIT" && x.profileHash === hash(e.evaluator));
  const auditReady = e.evaluator.metrics.filter(x => x.applicable).every(m => audit.some(a => a.metricId === m.id && a.reliability === "OBSERVED_AUDIT_ONLY" && (a.endToEndDefectRecall ?? 0) >= .9 && (a.falsePositiveRate ?? 1) <= .1));
  const targets = new Set(e.instructions.map(x => x.metricId));
  const positiveEffect = pointwise.some(x => x.partition === "HOLDOUT" && targets.has(x.metricId) && x.interval && x.interval.low > 0);
  const voteGroups = new Set(votes.filter(v => ["CANDIDATE", "BASELINE", "TIE"].includes(v.winner)).map(v => s.samples.find(x => x.id === s.pairs.find(p => p.id === v.pairId)!.sampleId)!.groupId));
  const groupPreferences = [...voteGroups].map(group => {
    const rows = votes.filter(v => s.samples.find(x => x.id === s.pairs.find(p => p.id === v.pairId)!.sampleId)!.groupId === group && ["CANDIDATE", "BASELINE", "TIE"].includes(v.winner));
    return rows.reduce((n, v) => n + (v.winner === "CANDIDATE" ? 1 : v.winner === "BASELINE" ? -1 : 0), 0) / rows.length;
  });
  const pairwiseReady = voteGroups.size >= 10 && groupPreferences.reduce((a, b) => a + b, 0) > 0;
  const reasons = [...(incomplete || pointwise.some(x => x.unknownGroups) ? ["INCOMPLETE_EXECUTION"] : []), ...(gate.state !== "PASS" ? ["REGRESSION_EVIDENCE_NOT_PASSING"] : []),
    ...(!auditReady ? ["INDEPENDENT_AUDIT_INSUFFICIENT"] : []), ...(!positiveEffect ? ["INDEPENDENT_EFFECT_INSUFFICIENT"] : []), ...(!pairwiseReady ? ["PAIRWISE_EVIDENCE_INSUFFICIENT"] : [])];
  return { id: e.id, recipeHash: e.recipeHash, screeningPolicy: "press-study-exploratory-screen/v1", state: gate.state === "REGRESSION" || pointwise.some(x => x.regressions) ? "REGRESSION" : reasons.length ? "HOLD" : "READY_FOR_OPERATOR", reasons, pointwise,
    recipe: { frozenAt: e.createdAt, generatorModel: e.generatorModel, generatorImplementationHash: e.generatorHash,
      evaluatorKind: e.evaluator.kind, evaluatorModel: e.evaluator.model, evaluatorProfileHash: hash(e.evaluator),
      sampleIds: [...e.sampleIds], developmentGroups: [...e.developmentGroups], instructions: structuredClone(e.instructions) },
    pairwise: { source: "BLIND_HUMAN_PREFERENCE", candidate: votes.filter(x => x.winner === "CANDIDATE").length, baseline: votes.filter(x => x.winner === "BASELINE").length,
      tie: votes.filter(x => x.winner === "TIE").length, uncertain: votes.filter(x => x.winner === "UNCERTAIN").length, skipped: votes.filter(x => x.winner === "SKIP").length,
      uniqueGroups: voteGroups.size, meanGroupPreference: groupPreferences.length ? groupPreferences.reduce((a, b) => a + b, 0) / groupPreferences.length : null },
    operational: e.outputs.map(x => ({ sampleId: x.sampleId, variant: x.variant, outputHash: x.outputHash, generation: x.generation,
      evaluation: x.evaluation ? { id: x.evaluation.id, status: x.evaluation.status, fingerprint: x.evaluation.fingerprint,
        profileHash: x.evaluation.profileHash, metrics: structuredClone(x.evaluation.results) } : null,
      evaluationUsage: x.evaluation?.results.map(m => ({ metricId: m.id, usage: m.usage, elapsedMs: m.elapsedMs })) ?? null })),
    regression: gate, adoption: e.decision, deploymentAuthorized: false };
}
