// Bounded real-provider integration check, exclusively on a synthetic test article.
// Each operation is journaled BEFORE dispatch. Existing journals never re-spend.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolveTestDatabaseUrl } from "../run-tests.mjs";
import { DEV_GOOGLE_BYPASS_EMAIL } from "../../lib/auth/devGoogleBypass.ts";
import { hash } from "../../domain/press-workflow/evaluation/contracts.ts";
import { standardDraftText } from "../../domain/press-workflow/evaluation/standard.ts";
import { buildCanonicalArticlePlain } from "../../domain/article/articleCanonicalContent.ts";

const [mode, suppliedName] = process.argv.slice(2);
assert.ok(["--allow-model-spend", "--read-only"].includes(mode), "Use --allow-model-spend NEW_BASENAME or --read-only EXISTING_BASENAME");
assert.ok(suppliedName && suppliedName === basename(suppliedName) && /^[a-zA-Z0-9_-]+$/.test(suppliedName), "Safe evidence basename required");
const directory = resolve("evals/press-workflow/evidence"), journalPath = resolve(directory, `${suppliedName}.jsonl`), evidencePath = resolve(directory, `${suppliedName}.json`);
const base = "http://localhost:3003", teamId = "standard-evaluation-demo-team", endpoint = `${base}/api/press/quality-studies`;
const startedAt = new Date().toISOString();
const journal = async (type, data) => appendFile(journalPath, JSON.stringify({ at: new Date().toISOString(), type, ...data }) + "\n");
const safeRun = run => ({ id: run.id, kind: run.kind, status: run.status, profileHash: run.profileHash, model: run.profile.model,
  fingerprint: run.fingerprint, metrics: run.results.map(({ id, state, score, threshold, thresholdPassed, reasonCode, usage, elapsedMs }) => ({ id, state, score, threshold, thresholdPassed, reasonCode, usage, elapsedMs })) });
let cookie;
async function request(url, body, expected = 200) {
  const response = await fetch(url, { method: body ? "POST" : "GET", headers: { Cookie: cookie ?? "", Origin: base, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(420000), redirect: "error" });
  const result = await response.json();
  assert.equal(response.status, expected, `HTTP_${response.status}_${result.code ?? "UNEXPECTED"}`); return result;
}
async function login() {
  const response = await fetch(`${base}/api/auth/dev/google-bypass?next=/press/standard-evaluation-demo/edit`, { redirect: "manual", signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, 307); cookie = response.headers.getSetCookie().map(x => x.split(";")[0]).join("; "); assert.ok(cookie);
}
if (mode === "--read-only") {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8")); await login();
  const report = await request(`${endpoint}/${evidence.studyId}?view=report`);
  assert.equal(hash(report), evidence.reportHash);
  assert.ok(["HOLD", "REGRESSION"].includes(report.experiments[0].state)); assert.equal(report.experiments[0].regression.state, "UNKNOWN");
  assert.equal(report.report.references.length, 0); assert.equal(report.report.reviewCounts.revisions, 0);
  assert.ok(report.experiments[0].recipe.instructions.length);
  assert.ok(report.experiments[0].recipe.instructions.every(x => x.confidence === "HYPOTHESIS"));
  const packet = await request(`${endpoint}/${evidence.studyId}`);
  assert.equal(hash(packet.pairs), evidence.pairPacketHash);
  console.log(JSON.stringify({ mode, providerJobs: 0, savedReportRestored: true, pairPacketRestored: true, studyId: evidence.studyId }));
  process.exit(0);
}

await mkdir(directory, { recursive: true });
await writeFile(journalPath, "", { flag: "wx" });
// Reserve final output too. A failed or interrupted check never silently restarts.
await writeFile(evidencePath, "", { flag: "wx" });
config({ path: ".env.local", quiet: true }); config({ path: ".env", quiet: true });
const databaseUrl = new URL(resolveTestDatabaseUrl(process.env));
databaseUrl.searchParams.set("connection_limit", "1"); databaseUrl.searchParams.set("connect_timeout", "5"); databaseUrl.searchParams.set("pool_timeout", "15");
const db = new PrismaClient({ datasources: { db: { url: databaseUrl.toString() } }, log: [] });
const articleId = `study-live-${randomUUID()}`;
let state, experimentId, paidJobs = 0;
const checks = [], sourceRuns = [];
async function operation(name, url, body, { paid = false, expected = 200 } = {}) {
  if (paid) { assert.ok(paidJobs < 7, "PAID_OPERATION_LIMIT"); paidJobs++; }
  await journal("intent", { name, articleId, studyId: state?.id, paid, paidJobs, body });
  console.log(JSON.stringify({ operation: name, state: "DISPATCHING", paidJobs }));
  const start = performance.now(), result = await request(url, body, expected);
  await journal("result", { name, elapsedMs: Math.round(performance.now() - start), id: result.id ?? result.result?.id, revision: result.revision,
    resultRef: result.resultRef, replayed: result.replayed, evaluation: result.result ? safeRun(result.result) : undefined });
  console.log(JSON.stringify({ operation: name, state: "SAVED", paidJobs })); return result;
}
async function command(name, body, paid = false) {
  const args = { ...body, expectedRevision: state.revision, idempotencyKey: randomUUID() };
  state = await operation(name, `${endpoint}/${state.id}`, args, { paid }); return args;
}
try {
  await journal("start", { startedAt, articleId, database: databaseUrl.pathname, budget: { generatedOutputs: 2, evaluationJobs: 5, applicableMetrics: 10 }, humanLabels: "NONE", sourceClass: "SYNTHETIC_DEVELOPMENT_ONLY" });
  await login();
  const user = await db.user.findUniqueOrThrow({ where: { email: DEV_GOOGLE_BYPASS_EMAIL }, select: { id: true } });
  const membership = await db.teamMember.findUniqueOrThrow({ where: { teamId_userId: { teamId, userId: user.id } } });
  assert.ok(["OWNER", "ADMIN"].includes(membership.role));
  const facts = ["가상의 누리문서는 2026년 10월 12일 협업 도구 종이별을 출시했다.", "종이별은 팀 회의 메모를 정리하는 기능을 제공한다.", "종이별의 이용 요금은 월 7,300원이다."];
  const title = "[합성 실측] 누리문서 종이별 출시", body = { paragraphs: [
    { text: "누리문서는 2026년 10월 12일 협업 도구 종이별을 출시했다." },
    { text: "종이별의 이용 요금은 월 73,000원이다. 이미 100만 고객이 이용하며 국내 시장 점유율 1위다." },
  ], closing: "" };
  await journal("synthetic-source", { articleId, title, facts, body, deliberateFaults: ["price contradiction", "unsupported customer count and market leadership"], referenceLabels: "NOT_HUMAN_VERIFIED" });
  await db.article.create({ data: { id: articleId, teamId, userId: user.id, type: "PRESS_RELEASE", status: "IN_PROGRESS", title, bodyJson: body,
    groundingState: { create: { groundingRevision: 1 } }, facts: { create: facts.map((content, i) => ({ teamId, content, origin: "USER", sourceKey: `${articleId}:${i}` })) } } });
  await db.$disconnect(); // HTTP owns subsequent DB work; no idle test client.
  const article = (await request(`${base}/api/articles/${articleId}`)).article;
  assert.equal(article.teamId, teamId); assert.equal(article.title, title);
  const qualityEndpoint = `${base}/api/articles/${articleId}/quality-evaluation`;
  const availability = await request(qualityEndpoint);
  assert.equal(availability.inputReason, null); assert.ok(availability.runtimes.STANDARD.available && availability.runtimes.GEVAL.available);
  const expectedOutput = standardDraftText(title, buildCanonicalArticlePlain({ paragraphs: body.paragraphs.map(p => p.text), closing: "" }));
  for (const kind of ["STANDARD", "GEVAL"]) {
    const args = { kind, expectedOutput, idempotencyKey: randomUUID() };
    const { result } = await operation(`source-${kind}`, qualityEndpoint, args, { paid: true });
    sourceRuns.push(safeRun(result)); assert.equal(result.status, "COMPLETED");
  }
  const geval = sourceRuns.find(x => x.kind === "GEVAL"), standard = sourceRuns.find(x => x.kind === "STANDARD");
  assert.ok(geval.metrics.some(x => x.state === "COMPLETED" && x.thresholdPassed === false), "NO_OBSERVED_DEVELOPMENT_FAILURE_STOP_WITHOUT_FABRICATION");
  checks.push("official standard and G-Eval source results saved; automatic failure observed");
  state = await operation("create-study", endpoint, { name: "[합성 실측] 생성·평가 API 왕복 — 사람 검증 전", idempotencyKey: randomUUID() }, { expected: 201 });
  await command("import-runs", { action: "ADD_SAMPLES", samples: sourceRuns.map(run => ({ articleId, runId: run.id, partition: "DEVELOPMENT" })) });
  await command("freeze-dataset", { action: "FREEZE_DATASET" });
  const replayArgs = await command("same-output-standard-replay", { action: "REEVALUATE_JUDGE", sampleId: standard.id, allowModelSpend: true }, true);
  assert.equal(state.judgeReplays[0].status, "COMPLETED");
  const replay = await operation("replay-identical-key", `${endpoint}/${state.id}`, replayArgs);
  assert.equal(replay.replayed, true); assert.equal(replay.judgeReplays.length, 1); state = replay;
  checks.push("same frozen output re-evaluated with official Ragas/DeepEval; same key creates no second job");
  await command("freeze-experiment", { action: "PLAN_EXPERIMENT", sampleIds: [geval.id] });
  experimentId = state.experiments[0].id;
  for (let i = 0; i < 4; i++) {
    const args = await command(`experiment-step-${i + 1}`, { action: "RUN_STEP", experimentId, allowModelSpend: true }, true);
    const step = state.experiments[0].steps.find(x => x.id === state.resultRef);
    assert.equal(step.status, "COMPLETED", `INCOMPLETE_${step.kind}_${step.variant}`);
    if (i === 0) {
      const again = await operation("generation-identical-key", `${endpoint}/${state.id}`, args);
      assert.equal(again.replayed, true); assert.equal(again.experiments[0].steps.filter(x => x.status === "COMPLETED").length, 1); state = again;
    }
  }
  assert.equal(state.experiments[0].steps.filter(x => x.status === "COMPLETED").length, 4);
  checks.push("baseline and candidate each generated once and evaluated through real study API");
  await command("assign-pairwise-without-vote", { action: "ASSIGN_PAIRWISE", experimentId, sampleId: geval.id });
  const packet = await request(`${endpoint}/${state.id}`);
  assert.ok(packet.pairs[0].A && packet.pairs[0].B); assert.equal(packet.pairs[0].choice, null);
  const report = await request(`${endpoint}/${state.id}?view=report`), experiment = report.experiments[0];
  assert.equal(report.report.references.length, 0); assert.equal(report.report.reviewCounts.revisions, 0);
  assert.equal(experiment.regression.state, "UNKNOWN"); assert.ok(["HOLD", "REGRESSION"].includes(experiment.state));
  assert.equal(experiment.deploymentAuthorized, false); assert.equal(experiment.adoption, null);
  assert.ok(experiment.recipe.instructions.length); assert.equal(experiment.recipe.evaluatorProfileHash, geval.profileHash);
  assert.ok(experiment.pointwise.every(x => x.partition === "DEVELOPMENT"));
  checks.push("pairwise assigned but not voted; human, regression and independent effect evidence remain missing");
  const exported = await request(`${endpoint}/${state.id}?view=dataset`);
  assert.equal(exported.dataset.datasetHash, report.datasetHash);
  const restored = await request(`${endpoint}/${state.id}?view=report`); assert.equal(hash(restored), hash(report));
  checks.push("independent report and frozen dataset reads restore persisted evidence");
  const evidence = { version: "press-study-live-evidence/v1", startedAt, finishedAt: new Date().toISOString(), sourceClass: "SYNTHETIC_DEVELOPMENT_ONLY",
    articleId, studyId: state.id, experimentId, paidApiOperations: paidJobs, actualHumanLabels: 0, sourceRuns, report, reportHash: hash(report),
    pairPacketHash: hash(packet.pairs), datasetHash: exported.dataset.datasetHash, checks };
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  await journal("complete", { articleId, studyId: state.id, experimentId, paidJobs, reportHash: evidence.reportHash, checks });
  console.log(JSON.stringify({ evidencePath, studyId: state.id, paidJobs, state: experiment.state, regression: experiment.regression.state, checks }, null, 2));
} catch (error) {
  await journal("failure", { articleId, studyId: state?.id, experimentId, paidJobs, message: error instanceof Error ? error.message : "UNKNOWN" });
  console.error(JSON.stringify({ state: "STOPPED_WITHOUT_RETRY", articleId, studyId: state?.id, paidJobs, journalPath, message: error instanceof Error ? error.message : "UNKNOWN" }));
  process.exitCode = 1;
} finally { await db.$disconnect(); }
