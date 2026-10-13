// Authenticated HTTP round trip. Temporary synthetic records; only simulated
// SKIP/UNCERTAIN choices, no human reference labels or provider calls.
// The only database allowed is the isolated test database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolveTestDatabaseUrl } from "../run-tests.mjs";
import { fixtureRun } from "../../domain/press-workflow/evaluation/study-fixture.ts";
import { hash } from "../../domain/press-workflow/evaluation/contracts.ts";
import { makeQualityRepository } from "../../lib/services/press-workflow/evaluation/qualityRepository.ts";
config({ path: ".env.local", quiet: true }); config({ path: ".env", quiet: true });
const databaseUrl = new URL(resolveTestDatabaseUrl(process.env));
databaseUrl.searchParams.set("connection_limit", "2"); databaseUrl.searchParams.set("pool_timeout", "60");
const db = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } }, log: [] });
const base = "http://localhost:3003", endpoint = `${base}/api/press/quality-studies`, articleId = `study-api-${randomUUID()}`;
let studyId; const checks = [];
async function json(url, options, expected = 200) { const res = await fetch(url, { ...options, signal: AbortSignal.timeout(90000) }); const data = await res.json(); assert.equal(res.status, expected, `${data.code ?? "unexpected status"}`); return data; }
try {
  await json(endpoint, {}, 401); checks.push("unauthenticated index rejected");
  const login = await fetch(`${base}/api/auth/dev/google-bypass?next=/press/standard-evaluation-demo/edit`, { redirect: "manual", signal: AbortSignal.timeout(60000) });
  assert.equal(login.status, 307); const cookie = login.headers.getSetCookie().map(x => x.split(";")[0]).join("; "); assert.ok(cookie);
  const headers = { Cookie: cookie, Origin: base, "Content-Type": "application/json" };
  const post = (url, body, expected = 200) => json(url, { method: "POST", headers, body: JSON.stringify(body) }, expected);
  const create = { name: "[synthetic API check - no human labels]", idempotencyKey: randomUUID() };
  let state = await post(endpoint, create, 201); studyId = state.id;
  assert.equal((await post(endpoint, create, 201)).id, studyId); checks.push("create and replay preserve one study");
  const row = await db.pressQualityStudy.findUniqueOrThrow({ where: { id: studyId } });
  assert.equal(row.data.samples.length, 0);
  await db.article.create({ data: { id: articleId, teamId: row.teamId, title: "synthetic API contract", type: "PRESS_RELEASE", status: "IN_PROGRESS" } });
  const run = fixtureRun(articleId), repository = makeQualityRepository(db);
  const reservation = { ...run };
  for (const field of ["id", "createdAt", "finishedAt", "status"]) delete reservation[field];
  const saved = await repository.reserve({ ...reservation, articleId, teamId: row.teamId, createdById: "synthetic-fixture-not-human", snapshot: { ...run.snapshot, articleId, teamId: row.teamId } });
  await repository.finish(saved.run.id, "COMPLETED");
  async function command(body, expected = 200) {
    const result = await post(`${endpoint}/${studyId}`, { ...body, expectedRevision: state.revision, idempotencyKey: randomUUID() }, expected);
    if (expected === 200) state = result; return result;
  }
  await command({ action: "ADD_SAMPLES", samples: [{ articleId, runId: saved.run.id, partition: "CALIBRATION" }] });
  await command({ action: "FREEZE_DATASET" });
  const assigned = await command({ action: "ASSIGN_REVIEW", purpose: "CALIBRATION" });
  assert.equal(assigned.batches[0].items.length, 1); assert.ok(!JSON.stringify(assigned.batches).includes("hidden automatic rationale")); checks.push("server-loaded sample and blind capped review packet");
  const restored = await json(`${endpoint}/${studyId}`, { headers });
  assert.deepEqual(restored.batches, assigned.batches); checks.push("new authenticated GET restores assignment");
  const batch = assigned.batches[0], item = batch.items[0];
  const selection = { action: "SUBMIT_REVIEW", expectedRevision: state.revision, idempotencyKey: randomUUID(),
    review: { batchId: batch.id, itemId: item.id, expectedRevision: 0, choice: "SKIP", priorExposure: "UNKNOWN", reason: "synthetic API contract, not human judgment" } };
  state = await post(`${endpoint}/${studyId}`, selection);
  assert.equal(state.batches[0].items[0].choice, "SKIP"); assert.equal(state.batches[0].items[0].revision, 1);
  const replay = await post(`${endpoint}/${studyId}`, selection);
  assert.equal(replay.replayed, true); assert.equal(replay.counts.reviewRevisions, 1); checks.push("selection and identical retry persist one review revision");
  await command({ action: "SUBMIT_REVIEW", review: { ...selection.review, choice: "UNCERTAIN" } }, 409); checks.push("stale selection revision cannot overwrite saved choice");
  state = await command({ action: "SUBMIT_REVIEW", review: { ...selection.review, expectedRevision: 1, choice: "UNCERTAIN" } });
  const savedChoice = await json(`${endpoint}/${studyId}`, { headers });
  assert.equal(savedChoice.batches[0].items[0].choice, "UNCERTAIN"); assert.equal(savedChoice.batches[0].items[0].revision, 2);
  assert.equal(savedChoice.counts.references, 0); checks.push("changed uncertain choice survives GET without creating ground truth");
  await command({ action: "FREEZE_DATASET", scores: [1] }, 422); checks.push("client-authored evaluation field rejected");
  await post(`${endpoint}/${studyId}`, { action: "FREEZE_CALIBRATION", expectedRevision: 0, idempotencyKey: randomUUID() }, 409); checks.push("stale aggregate revision rejected");
  await json(`${endpoint}/${studyId}`, { method: "POST", headers: { ...headers, Origin: "https://wrong-origin.invalid" }, body: "{}" }, 403); checks.push("cross-origin mutation rejected");
  const report = await json(`${endpoint}/${studyId}?view=report`, { headers });
  assert.equal(report.report.references.length, 0); assert.equal(report.report.metrics[0].reliability, "INSUFFICIENT"); checks.push("no human labels means insufficient evidence");
  state = report;
  await command({ action: "FREEZE_CALIBRATION" });
  const frozen = await json(`${endpoint}/${studyId}?view=report`, { headers });
  assert.equal(frozen.report.policy.state, "INSUFFICIENT");
  assert.equal(frozen.report.policy.thresholds.length, 0); checks.push("calibration with no reference labels remains insufficient");
  state = frozen;
  await command({ action: "SUBMIT_REVIEW", review: { ...selection.review, expectedRevision: 2, choice: "SKIP" } }, 409); checks.push("frozen calibration blocks later label edits");
  const exported = await json(`${endpoint}/${studyId}?view=dataset`, { headers });
  assert.equal(exported.dataset.datasetHash, state.datasetHash);
  assert.equal(exported.dataset.samples[0].outputHash, hash(saved.run.snapshot.input.output));
  assert.equal(exported.dataset.samples[0].referenceLabels.length, 0); checks.push("dataset export preserves frozen output without fabricated reference labels");
  console.log(JSON.stringify({ providerCalls: 0, humanLabelsCreated: 0, checks }, null, 2));
} catch (error) {
  console.error(`Primary API check failure: ${error instanceof Error ? error.message : "UNKNOWN"}`);
  console.error(JSON.stringify({ syntheticCleanup: { studyId, articleId }, checks })); process.exitCode = 1;
} finally {
  try {
    if (studyId) { await db.pressQualitySourceAssignment.deleteMany({ where: { firstStudyId: studyId } }); await db.pressQualityStudy.deleteMany({ where: { id: studyId } }); }
    await db.article.deleteMany({ where: { id: articleId } });
  } catch {
    console.error(JSON.stringify({ cleanupPending: { studyId, articleId } })); process.exitCode = 1;
  } finally { await db.$disconnect(); }
}
