import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fixtureRun } from "../../../../domain/press-workflow/evaluation/study-fixture";
import { hash } from "../../../../domain/press-workflow/evaluation/contracts";
import { studyReport } from "../../../../domain/press-workflow/evaluation/study";
import { commandQualityStudy, createQualityStudy, readQualityStudy, type StudyActor, type StudyPorts, type StudyRecord } from "./studyService";

const admin: StudyActor = { teamId: "team", userId: "operator", operator: true };
function harness() {
  const rows = new Map<string, StudyRecord>(), calls = { generate: 0, evaluate: 0, load: 0 };
  let now = "2026-10-12T00:00:00.000Z", lock = Promise.resolve();
  const get = (id: string, teamId: string) => { const r = rows.get(id); if (!r || r.teamId !== teamId) throw new Error("STUDY_NOT_FOUND"); return structuredClone(r); };
  const ports: StudyPorts = { now: () => now, token: randomUUID, random: () => .3,
    repository: { create: async r => { const existing = rows.get(r.id); if (existing) { if (existing.createHash !== r.createHash) throw new Error("STUDY_IDEMPOTENCY_CONFLICT"); return get(r.id, r.teamId); } rows.set(r.id, structuredClone(r)); return r; },
      get: async (id, team) => get(id, team), list: async team => [...rows.values()].filter(r => r.teamId === team).map(r => ({ id: r.id, name: r.data.name, revision: r.revision })),
      mutate: async (id, team, change) => { let release!: () => void; const previous = lock; lock = new Promise<void>(r => { release = r; }); await previous; try { const row = get(id, team); change(row); rows.set(id, structuredClone(row)); return row; } finally { release(); } },
    }, loadRun: async (_article, id) => { calls.load++; return fixtureRun(id, id === "dev" ? .2 : 1); }, runtime: async () => ({ available: true, reason: null, profile: fixtureRun("dev").profile }), generator: async () => ({ model: "fixture", implementationHash: "generator" }),
    generate: async (_snapshot, e, variant) => { calls.generate++; return { sampleId: "server", variant, output: variant, outputHash: hash(variant), generation: { evidence: "MEASURED", model: e.generatorModel, recipeHash: e.recipeHash, requestHash: "fixture", elapsedMs: 1, usage: null } }; },
    evaluate: async (snapshot, e) => { calls.evaluate++; return { ...fixtureRun(randomUUID()), snapshot, profile: e.evaluator, profileHash: hash(e.evaluator) }; },
  };
  return { rows, calls, ports, advance: () => { now = "2026-10-12T01:00:00.000Z"; } };
}
async function prepare(h: ReturnType<typeof harness>) {
  let state = await createQualityStudy({ name: "synthetic", idempotencyKey: "create-key" }, admin, h.ports);
  const run = async (action: Record<string, unknown>, actor = admin) => {
    state = await commandQualityStudy(state.id, { ...action, expectedRevision: state.revision, idempotencyKey: randomUUID() }, actor, h.ports); return state;
  };
  await run({ action: "ADD_SAMPLES", samples: [{ articleId: "dev", runId: "dev", partition: "DEVELOPMENT" }, { articleId: "hold", runId: "hold", partition: "HOLDOUT" }] });
  await run({ action: "FREEZE_DATASET" }); return { id: state.id, run, state: () => state };
}
test("study service fences team access, operator writes, revisions and idempotent retries", async () => {
  const h = harness(), s = await prepare(h);
  await assert.rejects(readQualityStudy(s.id, { ...admin, teamId: "other" }, h.ports), /NOT_FOUND/);
  await assert.rejects(s.run({ action: "FREEZE_CALIBRATION" }, { ...admin, operator: false }), { code: "QUALITY_OPERATOR_REQUIRED" });
  const command = { action: "PLAN_EXPERIMENT", sampleIds: ["hold"], expectedRevision: s.state().revision, idempotencyKey: "plan-key-1" };
  const both = await Promise.all([commandQualityStudy(s.id, command, admin, h.ports), commandQualityStudy(s.id, command, admin, h.ports)]);
  assert.equal(both[0].resultRef, both[1].resultRef); assert.equal(h.rows.get(s.id)!.data.experiments.length, 1);
  await assert.rejects(commandQualityStudy(s.id, { ...command, sampleIds: ["dev"] }, admin, h.ports), /IDEMPOTENCY_CONFLICT/);
  await assert.rejects(commandQualityStudy(s.id, { ...command, idempotencyKey: "different-key" }, admin, h.ports), /REVISION/);
  assert.deepEqual(h.calls, { generate: 0, evaluate: 0, load: 2 });
});
test("each paid step persists exactly once; same-output judge replay cannot be confused with generation", async () => {
  const h = harness(), s = await prepare(h);
  const planned = await s.run({ action: "PLAN_EXPERIMENT", sampleIds: ["hold"] }); const experimentId = planned.experiments![0].id;
  let state = await readQualityStudy(s.id, admin, h.ports);
  const request = { action: "RUN_STEP", experimentId, allowModelSpend: true, expectedRevision: state.revision, idempotencyKey: "step-key-1" };
  state = await commandQualityStudy(s.id, request, admin, h.ports);
  await commandQualityStudy(s.id, request, admin, h.ports); assert.equal(h.calls.generate, 1);
  state = await commandQualityStudy(s.id, { ...request, expectedRevision: state.revision, idempotencyKey: "step-key-2" }, admin, h.ports);
  assert.equal(h.calls.evaluate, 1);
  state = await commandQualityStudy(s.id, { action: "REEVALUATE_JUDGE", sampleId: "dev", allowModelSpend: true, expectedRevision: state.revision, idempotencyKey: "replay-key-1" }, admin, h.ports);
  assert.equal(h.calls.generate, 1); assert.equal(h.calls.evaluate, 2);
  const data = h.rows.get(s.id)!.data;
  assert.equal(data.judgeReplays[0].run!.snapshot.input.output, data.samples[0].run.snapshot.input.output);
  assert.equal(studyReport(data).judgeComparisons[0].input, "SAME_FROZEN_OUTPUT");
});
test("expired or failed external work never becomes completed or automatically spends again", async () => {
  const h = harness(), s = await prepare(h), planned = await s.run({ action: "PLAN_EXPERIMENT", sampleIds: ["hold"] });
  const original = h.ports.generate;
  h.ports.generate = async (...args) => { const result = await original(...args); h.advance(); return result; };
  const request = { action: "RUN_STEP", experimentId: planned.experiments![0].id, allowModelSpend: true, expectedRevision: planned.revision, idempotencyKey: "expired-key" };
  await assert.rejects(commandQualityStudy(s.id, request, admin, h.ports), /LEASE_EXPIRED/);
  const retry = await commandQualityStudy(s.id, request, admin, h.ports);
  assert.equal(retry.replayed, true); assert.equal(h.calls.generate, 1); assert.equal(h.rows.get(s.id)!.data.experiments[0].outputs.length, 0);
});
test("review API uses authenticated reviewer and report exposure is retained", async () => {
  const h = harness(), s = await prepare(h), reviewer = { ...admin, userId: "human", operator: false };
  const assigned = await s.run({ action: "ASSIGN_REVIEW", purpose: "DEVELOPMENT" }, reviewer);
  assert.equal(assigned.batches.length, 1); assert.equal(JSON.stringify(assigned).includes("hidden automatic rationale"), false);
  const b = assigned.batches[0];
  await s.run({ action: "SUBMIT_REVIEW", review: { batchId: b.id, itemId: b.items[0].id, expectedRevision: 0, choice: "FAIL", priorExposure: "NONE" } }, reviewer);
  assert.equal(h.rows.get(s.id)!.data.reviews[0].reviewerId, "human");
  await readQualityStudy(s.id, { ...reviewer, operator: true }, h.ports, true);
  const record = h.rows.get(s.id)!;
  await commandQualityStudy(s.id, { action: "SUBMIT_REVIEW", expectedRevision: record.revision, idempotencyKey: "exposed-review", review: { batchId: b.id, itemId: b.items[0].id, expectedRevision: 1, choice: "PASS", priorExposure: "NONE" } }, reviewer, h.ports);
  assert.equal(h.rows.get(s.id)!.data.reviews.at(-1)!.priorExposure, "SEEN_JUDGE");
});
