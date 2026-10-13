// Real database contract checks, isolated temporary article, no provider calls.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolveTestDatabaseUrl } from "../run-tests.mjs";
import { makeQualityRepository } from "../../lib/services/press-workflow/evaluation/qualityRepository.ts";

config({ path: ".env.local", quiet: true }); config({ path: ".env", quiet: true });
const url = resolveTestDatabaseUrl(process.env);
const db = new PrismaClient({ datasources: { db: { url } }, log: [] });
const articleId = `quality-contract-${randomUUID()}`, checks = [];
const metric = id => ({ id, framework: id, metric: "Faithfulness", version: "contract", threshold: null, applicable: true, reason: "synthetic", state: "COMPLETED", score: 1, reasonCode: null, thresholdPassed: null, elapsedMs: 0, usage: null });
try {
  await db.article.create({ data: { id: articleId, title: "synthetic persistence test", type: "PRESS_RELEASE", status: "IN_PROGRESS" } });
  const repo = makeQualityRepository(db), snapshot = { articleId, teamId: null, ownerId: null, fingerprint: "fixture-v1", reason: null,
    input: { request: "fixture", output: "fixture", contexts: ["fixture"] }, facts: [{ id: "f1", content: "fixture", origin: "USER" }], groundingRevision: 0, corpusVersion: 0, generationVersion: "UNKNOWN" };
  const reservation = { articleId, teamId: null, createdById: "synthetic-test", kind: "STANDARD", idempotencyKey: "contract-key-1", requestHash: "request1",
    fingerprint: "fixture-v1", profileHash: "profile1", snapshot, profile: { kind: "STANDARD", model: "no-provider", version: "fixture", implementationHash: "fixture", metrics: [] }, results: [], retryOfId: null };
  const simultaneous = await Promise.all([repo.reserve(reservation), repo.reserve(reservation)]);
  assert.equal(simultaneous.filter(r => r.created).length, 1); assert.equal(simultaneous[0].run.id, simultaneous[1].run.id); checks.push("concurrent same-key reservation creates exactly one attempt");
  const id = simultaneous[0].run.id;
  await assert.rejects(repo.reserve({ ...reservation, requestHash: "different" }), { code: "IDEMPOTENCY_CONFLICT" }); checks.push("changed same-key payload is rejected");
  await assert.rejects(repo.reserve({ ...reservation, idempotencyKey: "different-key" }), { code: "QUALITY_BUSY" }); checks.push("same article cannot start another concurrent paid attempt");
  await Promise.all([repo.record(id, metric("RAGAS")), repo.record(id, metric("DEEPEVAL"))]);
  assert.equal((await repo.find(articleId, id)).results.length, 2); checks.push("concurrent metric writes both survive");
  assert.equal(await repo.find("another-article", id), null); checks.push("cross-article lookup cannot expose a run");
  await repo.finish(id, "COMPLETED");
  assert.equal((await makeQualityRepository(db).list(articleId))[0].status, "COMPLETED"); checks.push("new repository instance restores completed history");
  await assert.rejects(repo.record(id, metric("EXTRA"))); checks.push("finished results cannot be overwritten");
  const interrupted = await repo.reserve({ ...reservation, idempotencyKey: "interrupted-key" });
  await repo.record(interrupted.run.id, metric("RAGAS"));
  await db.articleQualityEvaluation.update({ where: { id: interrupted.run.id }, data: { deadlineAt: new Date(0) } });
  const expired = await repo.find(articleId, interrupted.run.id);
  assert.equal(expired.status, "INTERRUPTED"); assert.equal(expired.results.length, 1);
  await assert.rejects(repo.record(interrupted.run.id, metric("DEEPEVAL"))); checks.push("expired attempt preserves progress and fences late writes");
  console.log(JSON.stringify({ database: new URL(url).pathname, providerCalls: 0, checks }, null, 2));
} finally { await db.article.deleteMany({ where: { id: articleId } }); await db.$disconnect(); }
