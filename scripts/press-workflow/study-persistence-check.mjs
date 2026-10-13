// Real repository checks on a temporary synthetic team in the isolated test DB.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolveTestDatabaseUrl } from "../run-tests.mjs";
import { makeStudyRepository } from "../../lib/services/press-workflow/evaluation/studyRepository.ts";
import { newStudy, addSamples, freezeStudy } from "../../domain/press-workflow/evaluation/study.ts";
import { fixtureRun } from "../../domain/press-workflow/evaluation/study-fixture.ts";
config({ path: ".env.local", quiet: true }); config({ path: ".env", quiet: true });
const url = resolveTestDatabaseUrl(process.env), db = new PrismaClient({ datasources: { db: { url } }, log: [] });
const teamId = `quality-study-test-${randomUUID()}`, id = randomUUID(), checks = [];
try {
  await db.team.create({ data: { id: teamId, slug: teamId, name: "synthetic quality persistence checks" } });
  const repo = makeStudyRepository(db), row = { id, teamId, createdById: "synthetic-test", createHash: "create-v1", revision: 0, data: newStudy("synthetic") };
  const duplicate = await Promise.all([repo.create(row), repo.create(row)]); assert.equal(duplicate[0].id, duplicate[1].id); checks.push("concurrent create is idempotent");
  await assert.rejects(repo.create({ ...row, createHash: "changed" }), /IDEMPOTENCY/); checks.push("changed create payload rejected");
  await assert.rejects(repo.get(id, "other-team")); await assert.rejects(repo.mutate(id, "other-team", () => {})); checks.push("read and mutation are team scoped");
  const writes = await Promise.allSettled([1, 2].map(() => repo.mutate(id, teamId, r => { assert.equal(r.revision, 0); r.data.exposedReviewers.push("synthetic"); r.revision++; })));
  assert.equal(writes.filter(x => x.status === "fulfilled").length, 1); checks.push("concurrent stale revision cannot overwrite winner");
  const run = fixtureRun("source"), source = { ...run, teamId, snapshot: { ...run.snapshot, teamId } };
  await repo.mutate(id, teamId, r => { addSamples(r.data, [{ run: source, partition: "DEVELOPMENT" }]); r.revision++; });
  const otherId = randomUUID(); await repo.create({ ...row, id: otherId });
  await assert.rejects(repo.mutate(otherId, teamId, r => { addSamples(r.data, [{ run: source, partition: "AUDIT" }]); r.revision++; }), /CROSS_STUDY_SOURCE_SPLIT/);
  assert.equal((await repo.get(otherId, teamId)).data.samples.length, 0); checks.push("cross-study source leakage rolls back atomically");
  await repo.mutate(id, teamId, r => { freezeStudy(r.data, new Date().toISOString()); r.revision++; });
  const restored = await makeStudyRepository(db).get(id, teamId); assert.equal(restored.data.samples[0].run.id, "source"); assert.ok(restored.data.datasetHash); checks.push("new repository restores frozen evidence");
  await assert.rejects(repo.mutate(id, teamId, r => { addSamples(r.data, [{ run: fixtureRun("new"), partition: "AUDIT" }]); r.revision++; }), /FROZEN/); checks.push("frozen source cannot be replaced");
  assert.equal((await repo.list(teamId)).length, 2); checks.push("team study index restores both studies");
  console.log(JSON.stringify({ providerCalls: 0, database: new URL(url).pathname, checks }, null, 2));
} finally { await db.team.deleteMany({ where: { id: teamId } }); await db.$disconnect(); }
