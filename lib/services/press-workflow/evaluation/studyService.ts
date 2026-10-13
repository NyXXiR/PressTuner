import { hash } from "../../../../domain/press-workflow/evaluation/contracts";
import type { QualityRun, QualitySnapshot, QualityRuntime } from "../../../../domain/press-workflow/evaluation/article-evaluation";
import { createStudySchema, studyCommandSchema, newStudy, addSamples, freezeStudy, assignReviews, submitReview, reviewPacket, freezeCalibration, studyReport,
  planExperiment, assignPairwise, pairwisePacket, submitPairwise, promoteStudyRegression, experimentReport, requireStudy,
  references, generationInputIdentity, type Study, type Experiment, type GeneratedOutput, type Step } from "../../../../domain/press-workflow/evaluation/study";
import { serviceError } from "../../serviceError";

export type StudyActor = { userId: string; teamId: string; operator: boolean };
export type StudyRecord = { id: string; teamId: string; createdById: string; createHash: string; revision: number; data: Study };
export type StudyRepository = {
  create(row: StudyRecord): Promise<StudyRecord>;
  list(teamId: string): Promise<{ id: string; revision: number; name: string }[]>;
  get(id: string, teamId: string): Promise<StudyRecord>;
  mutate(id: string, teamId: string, change: (row: StudyRecord) => void): Promise<StudyRecord>;
};
export type StudyPorts = { repository: StudyRepository; now: () => string; random: () => number; token: () => string;
  loadRun: (articleId: string, runId: string, actor: StudyActor) => Promise<QualityRun>;
  runtime: (kind: QualityRun["kind"]) => Promise<QualityRuntime>;
  generator: () => Promise<{ model: string; implementationHash: string }>;
  generate: (snapshot: QualitySnapshot, experiment: Experiment, variant: Step["variant"]) => Promise<GeneratedOutput>;
  evaluate: (snapshot: QualitySnapshot, experiment: Pick<Experiment, "evaluator">, key: string, actor: StudyActor) => Promise<QualityRun>;
};
const operatorActions = new Set(["ADD_SAMPLES", "FREEZE_DATASET", "FREEZE_CALIBRATION", "PLAN_EXPERIMENT", "RUN_STEP", "REEVALUATE_JUDGE", "PROMOTE_REGRESSION", "DECIDE"]);
function assertOperator(actor: StudyActor) { if (!actor.operator) throw serviceError(403, "QUALITY_OPERATOR_REQUIRED", "팀 관리자만 이 작업을 실행할 수 있습니다."); }
export async function createQualityStudy(value: unknown, actor: StudyActor, ports: StudyPorts) {
  assertOperator(actor); const args = createStudySchema.parse(value), id = hash({ teamId: actor.teamId, actor: actor.userId, key: args.idempotencyKey });
  const row = await ports.repository.create({ id, teamId: actor.teamId, createdById: actor.userId, createHash: hash(args), revision: 0, data: newStudy(args.name) });
  return studySummary(row, actor);
}
export function studySummary(row: StudyRecord, actor: StudyActor) {
  const s = row.data;
  return { id: row.id, name: s.name, revision: row.revision, frozenAt: s.frozenAt, datasetHash: s.datasetHash,
    counts: { samples: s.samples.length, references: references(s).length, reviewRevisions: s.reviews.length },
    batches: s.batches.filter(x => x.reviewerId === actor.userId).map(x => reviewPacket(s, x.id, actor.userId)),
    pairs: s.pairs.filter(x => x.reviewerId === actor.userId).map(x => pairwisePacket(s, x.id, actor.userId)),
    ...(actor.operator ? { samples: s.samples.map(x => ({ id: x.id, groupId: x.groupId, partition: x.partition, articleId: x.run.articleId, profileHash: x.run.profileHash })),
      judgeReplays: s.judgeReplays.map(x => ({ id: x.id, sampleId: x.sampleId, status: x.status === "RUNNING" && x.deadlineAt <= new Date().toISOString() ? "INTERRUPTED" : x.status, runId: x.run?.id ?? null })),
      experiments: s.experiments.map(e => ({ id: e.id, recipeHash: e.recipeHash, sampleIds: e.sampleIds, steps: e.steps.map(x => ({ ...x, token: undefined, status: x.status === "RUNNING" && x.deadlineAt! <= new Date().toISOString() ? "INTERRUPTED" : x.status })) })) } : {}) };
}
export async function readQualityStudy(id: string, actor: StudyActor, ports: StudyPorts, report: boolean | "dataset" = false) {
  if (report) {
    assertOperator(actor);
    const row = await ports.repository.mutate(id, actor.teamId, r => { if (!r.data.exposedReviewers.includes(actor.userId)) { r.data.exposedReviewers.push(actor.userId); r.revision++; } });
    if (report === "dataset") {
      const labels = references(row.data);
      return { id: row.id, revision: row.revision, dataset: { version: "press-study-dataset/v1", datasetHash: row.data.datasetHash, frozenAt: row.data.frozenAt, referenceHash: hash(labels),
        samples: row.data.samples.map(x => ({ id: x.id, groupId: x.groupId, partition: x.partition, sourceStatus: "ARTICLE_CAPTURED_UNVERIFIED", input: x.run.snapshot, outputHash: x.outputHash,
          evaluator: x.run.profile, evaluation: x.run.results, referenceLabels: labels.filter(r => r.sampleId === x.id) })), humanVerificationScope: "ONLY_EXPLICIT_OUTPUT_CRITERION_LABELS" } };
    }
    return { ...studySummary(row, actor), report: studyReport(row.data), experiments: row.data.experiments.map(e => experimentReport(row.data, e)) };
  }
  return studySummary(await ports.repository.get(id, actor.teamId), actor);
}
function expire(s: Study, now: string) { for (const step of [...s.experiments.flatMap(e => e.steps), ...s.judgeReplays]) if (step.status === "RUNNING" && step.deadlineAt! <= now) { step.status = "INTERRUPTED"; step.error = "LEASE_EXPIRED_NO_AUTOMATIC_RETRY"; } }

export async function commandQualityStudy(id: string, value: unknown, actor: StudyActor, ports: StudyPorts) {
  const args = studyCommandSchema.parse(value); if (operatorActions.has(args.action)) assertOperator(actor);
  const { expectedRevision: _revision, ...semantic } = args; void _revision;
  const requestHash = hash({ actor: actor.userId, command: semantic });
  const current = await ports.repository.get(id, actor.teamId), previous = current.data.receipts.find(x => x.key === args.idempotencyKey);
  if (previous) {
    requireStudy(previous.hash === requestHash && previous.actor === actor.userId, "STUDY_IDEMPOTENCY_CONFLICT");
    return { ...studySummary(current, actor), replayed: true, resultRef: previous.ref };
  }
  requireStudy(current.revision === args.expectedRevision, "STUDY_REVISION_CONFLICT");
  if (args.action === "REEVALUATE_JUDGE") return reevaluateJudge(id, args, actor, ports, current, requestHash);
  const samples = args.action === "ADD_SAMPLES" ? await Promise.all(args.samples.map(async x => ({ run: await ports.loadRun(x.articleId, x.runId, actor), partition: x.partition }))) : null;
  if (samples) requireStudy(samples.every(x => x.run.teamId === actor.teamId && x.run.snapshot.teamId === actor.teamId), "SAMPLE_TEAM_MISMATCH");
  let config: Awaited<ReturnType<StudyPorts["generator"]>> | null = null, runtime: QualityRuntime | null = null;
  if (args.action === "PLAN_EXPERIMENT" || args.action === "RUN_STEP") {
    const profile = args.action === "RUN_STEP" ? current.data.experiments.find(x => x.id === args.experimentId)?.evaluator : current.data.samples.find(x => x.id === args.sampleIds[0])?.run.profile;
    requireStudy(profile, "EXPERIMENT_PROFILE_REQUIRED");
    [config, runtime] = await Promise.all([ports.generator(), ports.runtime(profile.kind)]);
    requireStudy(runtime.available, "QUALITY_RUNTIME_UNAVAILABLE");
    requireStudy(hash(runtime.profile) === hash(profile), "EVALUATOR_IDENTITY_MISMATCH");
  }
  let claimed: { experiment: Experiment; step: Step; snapshot: QualitySnapshot } | null = null, replayed = false, resultRef: string | null = null;
  const row = await ports.repository.mutate(id, actor.teamId, r => {
    const s = r.data, seen = s.receipts.find(x => x.key === args.idempotencyKey);
    if (seen) { requireStudy(seen.hash === requestHash && seen.actor === actor.userId, "STUDY_IDEMPOTENCY_CONFLICT"); replayed = true; resultRef = seen.ref; return; }
    requireStudy(r.revision === args.expectedRevision, "STUDY_REVISION_CONFLICT"); requireStudy(s.receipts.length < 2000, "STUDY_COMMAND_LIMIT");
    const now = ports.now(); expire(s, now);
    if (args.action === "ADD_SAMPLES") addSamples(s, samples!);
    else if (args.action === "FREEZE_DATASET") freezeStudy(s, now);
    else if (args.action === "ASSIGN_REVIEW") resultRef = assignReviews(s, actor.userId, args.purpose, now, ports.random).id;
    else if (args.action === "SUBMIT_REVIEW") submitReview(s, args.review, actor.userId, now);
    else if (args.action === "FREEZE_CALIBRATION") resultRef = freezeCalibration(s, now).id;
    else if (args.action === "PLAN_EXPERIMENT") {
      resultRef = planExperiment(s, { sampleIds: args.sampleIds, generatorModel: config!.model, generatorHash: config!.implementationHash, evaluator: runtime!.profile, now }).id;
      if (!s.exposedReviewers.includes(actor.userId)) s.exposedReviewers.push(actor.userId);
    } else if (args.action === "ASSIGN_PAIRWISE") resultRef = assignPairwise(s, args.experimentId, args.sampleId, actor.userId, now, ports.random).id;
    else if (args.action === "SUBMIT_PAIRWISE") submitPairwise(s, args.pairId, actor.userId, args.choice, args.priorExposure, args.voteRevision, now);
    else if (args.action === "PROMOTE_REGRESSION") resultRef = promoteStudyRegression(s, args.sampleId, args.metricId, now).id;
    else if (args.action === "DECIDE") {
      const e = s.experiments.find(x => x.id === args.experimentId); requireStudy(e, "EXPERIMENT_NOT_FOUND"); requireStudy(!e.decision, "EXPERIMENT_DECISION_IMMUTABLE");
      if (args.choice === "SELECT_CANDIDATE") requireStudy(experimentReport(s, e).state === "READY_FOR_OPERATOR", "CANDIDATE_EVIDENCE_INSUFFICIENT");
      e.decision = { reviewerId: actor.userId, choice: args.choice, reportHash: hash(experimentReport(s, e)), createdAt: now };
    } else if (args.action === "RUN_STEP") {
      const e = s.experiments.find(x => x.id === args.experimentId); requireStudy(e, "EXPERIMENT_NOT_FOUND");
      requireStudy(e.generatorHash === config!.implementationHash && e.generatorModel === config!.model && hash(e.evaluator) === hash(runtime!.profile), "FROZEN_RECIPE_MISMATCH");
      requireStudy(!s.experiments.some(x => x.steps.some(y => y.status === "RUNNING")) && !s.judgeReplays.some(x => x.status === "RUNNING"), "STUDY_BUSY");
      const step = e.steps.find(x => x.status === "PENDING" && (x.kind === "GENERATE" || e.outputs.some(o => o.sampleId === x.sampleId && o.variant === x.variant)));
      requireStudy(step, "NO_PENDING_STEP");
      step.status = "RUNNING"; step.token = ports.token(); step.deadlineAt = new Date(Date.parse(now) + 7 * 60_000).toISOString(); resultRef = step.id;
      const source = s.samples.find(x => x.id === step.sampleId)!.run.snapshot, snapshot = structuredClone(source);
      if (step.kind === "EVALUATE") {
        snapshot.input.output = e.outputs.find(x => x.sampleId === step.sampleId && x.variant === step.variant)!.output;
        snapshot.fingerprint = hash({ source: source.fingerprint, output: snapshot.input.output, recipe: e.recipeHash });
      }
      if (!s.exposedReviewers.includes(actor.userId)) s.exposedReviewers.push(actor.userId);
      claimed = { experiment: structuredClone(e), step: structuredClone(step), snapshot };
    }
    s.receipts.push({ key: args.idempotencyKey, hash: requestHash, ref: resultRef, actor: actor.userId }); r.revision++;
  });
  if (!claimed) return { ...studySummary(row, actor), replayed, resultRef };
  return executeStep(id, actor, claimed, ports);
}

async function reevaluateJudge(id: string, args: Extract<import("../../../../domain/press-workflow/evaluation/study-contracts").StudyCommand, { action: "REEVALUATE_JUDGE" }>, actor: StudyActor, ports: StudyPorts, current: StudyRecord, requestHash: string) {
  const sample = current.data.samples.find(x => x.id === args.sampleId); requireStudy(sample && current.data.frozenAt, "FROZEN_SAMPLE_REQUIRED");
  const runtime = await ports.runtime(sample.run.kind); requireStudy(runtime.available, "QUALITY_RUNTIME_UNAVAILABLE");
  const jobId = hash({ id, sample: args.sampleId, key: args.idempotencyKey }), token = ports.token(); let claimed = false;
  const reserved = await ports.repository.mutate(id, actor.teamId, r => {
    const seen = r.data.receipts.find(x => x.key === args.idempotencyKey);
    if (seen) { requireStudy(seen.hash === requestHash && seen.actor === actor.userId, "STUDY_IDEMPOTENCY_CONFLICT"); return; }
    requireStudy(r.revision === args.expectedRevision, "STUDY_REVISION_CONFLICT"); expire(r.data, ports.now());
    requireStudy(r.data.judgeReplays.length < 60 && r.data.receipts.length < 2000, "JUDGE_REPLAY_LIMIT");
    requireStudy(!r.data.judgeReplays.some(x => x.status === "RUNNING") && !r.data.experiments.some(e => e.steps.some(x => x.status === "RUNNING")), "STUDY_BUSY");
    r.data.judgeReplays.push({ id: jobId, sampleId: sample.id, evaluator: runtime.profile, status: "RUNNING", token, deadlineAt: new Date(Date.parse(ports.now()) + 7 * 60000).toISOString(), run: null, error: null });
    r.data.receipts.push({ key: args.idempotencyKey, hash: requestHash, actor: actor.userId, ref: jobId }); r.revision++; claimed = true;
  });
  if (!claimed) return { ...studySummary(reserved, actor), replayed: true, resultRef: jobId };
  let run: QualityRun | null = null;
  try {
    run = await ports.evaluate(sample.run.snapshot, { evaluator: runtime.profile }, jobId, actor);
    requireStudy(run.snapshot.input.output === sample.run.snapshot.input.output && run.profileHash === hash(runtime.profile), "JUDGE_REPLAY_IDENTITY_MISMATCH");
  } catch { run = null; }
  const finished = await ports.repository.mutate(id, actor.teamId, r => {
    const job = r.data.judgeReplays.find(x => x.id === jobId)!;
    requireStudy(job.status === "RUNNING" && job.token === token && job.deadlineAt > ports.now(), "STEP_LEASE_EXPIRED");
    job.run = run; job.status = run?.status === "COMPLETED" ? "COMPLETED" : "FAILED"; job.error = run ? null : "JUDGE_REPLAY_FAILED"; r.revision++;
  });
  return { ...studySummary(finished, actor), replayed: false, resultRef: jobId };
}

async function executeStep(id: string, actor: StudyActor, job: { experiment: Experiment; step: Step; snapshot: QualitySnapshot }, ports: StudyPorts) {
  let generated: GeneratedOutput | null = null, evaluated: QualityRun | null = null, error: string | null = null;
  try {
    if (job.step.kind === "GENERATE") {
      generated = await ports.generate(job.snapshot, job.experiment, job.step.variant);
      requireStudy(generated.output.trim().length > 0 && generated.output.length <= 20000 && generated.outputHash === hash(generated.output) && generated.generation.recipeHash === job.experiment.recipeHash, "INVALID_GENERATED_OUTPUT");
    } else {
      evaluated = await ports.evaluate(job.snapshot, job.experiment, job.step.id, actor);
      requireStudy(evaluated.profileHash === hash(job.experiment.evaluator) && evaluated.snapshot.input.output === job.snapshot.input.output && hash(generationInputIdentity(evaluated.snapshot)) === hash(generationInputIdentity(job.snapshot)), "EVALUATION_IDENTITY_MISMATCH");
    }
  } catch { error = "STEP_FAILED_INSPECT_OR_START_NEW_EXPERIMENT"; }
  const row = await ports.repository.mutate(id, actor.teamId, r => {
    const e = r.data.experiments.find(x => x.id === job.experiment.id)!, step = e.steps.find(x => x.id === job.step.id)!;
    requireStudy(step.status === "RUNNING" && step.token === job.step.token && step.deadlineAt! > ports.now(), "STEP_LEASE_EXPIRED");
    if (generated && !error) e.outputs.push({ ...generated, sampleId: step.sampleId, variant: step.variant });
    if (evaluated && !error) e.outputs.find(x => x.sampleId === step.sampleId && x.variant === step.variant)!.evaluation = evaluated;
    step.status = error || (evaluated && evaluated.status !== "COMPLETED") ? "FAILED" : "COMPLETED"; step.error = error; r.revision++;
  });
  return { ...studySummary(row, actor), replayed: false, resultRef: job.step.id };
}
