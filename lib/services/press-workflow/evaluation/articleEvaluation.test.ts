import assert from "node:assert/strict";
import test from "node:test";
import { executeArticleEvaluation, readArticleEvaluationHistory, type ArticleEvaluationPorts } from "./articleEvaluation";
import type { QualityRun, QualitySnapshot, QualityMetric } from "../../../../domain/press-workflow/evaluation/article-evaluation";

function harness() {
  const snapshot: QualitySnapshot = { articleId: "article", teamId: "team", ownerId: "owner", fingerprint: "v1", reason: null,
    input: { request: "초안을 평가", output: "저장된 초안", contexts: ["채택된 사실"] }, facts: [{ id: "fact", content: "채택된 사실", origin: "USER" }],
    groundingRevision: 1, corpusVersion: 1, generationVersion: "UNKNOWN" };
  const rows: QualityRun[] = [];
  const calls: string[] = [];
  let forbidden = false;
  const ports: ArticleEvaluationPorts = {
    load: async () => { if (forbidden) throw new Error("FORBIDDEN"); return structuredClone(snapshot); },
    runtime: async kind => ({ available: true, reason: null, profile: { kind, model: "judge", version: "v1", implementationHash: "code1",
      metrics: ["RAGAS", "DEEPEVAL"].map(id => ({ id, framework: id, metric: "Faithfulness", version: "test", threshold: id === "RAGAS" ? null : .5, applicable: true, reason: null })) } }),
    measure: async metric => { calls.push(metric.id); return { ...metric, state: "COMPLETED", score: 1, reason: "근거 일치", reasonCode: null, thresholdPassed: metric.threshold === null ? null : true, elapsedMs: 1, usage: null }; },
    repository: {
      list: async () => structuredClone(rows.slice().reverse()),
      find: async (_articleId, id) => structuredClone(rows.find(r => r.id === id) ?? null),
      reserve: async value => {
        const old = rows.find(r => r.idempotencyKey === value.idempotencyKey);
        if (old) {
          if (old.requestHash !== value.requestHash) throw new Error("IDEMPOTENCY_CONFLICT");
          return { run: structuredClone(old), created: false };
        }
        if (rows.some(r => r.status === "RUNNING")) throw new Error("BUSY");
        const run: QualityRun = { ...value, id: `run-${rows.length}`, status: "RUNNING", createdAt: new Date().toISOString(), finishedAt: null };
        rows.push(run); return { run: structuredClone(run), created: true };
      },
      record: async (id, result) => { const row = rows.find(r => r.id === id)!; row.results = [...row.results.filter(r => r.id !== result.id), structuredClone(result)]; },
      finish: async (id, status) => { const row = rows.find(r => r.id === id)!; row.status = status; row.finishedAt = new Date().toISOString(); return structuredClone(row); },
    },
  };
  const request = { kind: "STANDARD" as const, expectedOutput: snapshot.input.output, idempotencyKey: "request-0001" };
  return { ports, snapshot, rows, calls, request, deny: () => { forbidden = true; } };
}

test("saved run restores after a fresh read and the same request never calls a judge twice", async () => {
  const h = harness();
  const first = await executeArticleEvaluation("article", "owner", h.request, h.ports);
  const replay = await executeArticleEvaluation("article", "owner", h.request, h.ports);
  assert.equal(first.id, replay.id); assert.equal(first.status, "COMPLETED");
  assert.deepEqual(h.calls.sort(), ["DEEPEVAL", "RAGAS"]);
  const history = await readArticleEvaluationHistory("article", "owner", h.ports);
  assert.equal(history.history[0].id, first.id); assert.equal(history.history[0].freshness, "CURRENT");
  h.snapshot.fingerprint = "v2";
  assert.equal((await readArticleEvaluationHistory("article", "owner", h.ports)).history[0].freshness, "STALE");
});

test("authorization and stale output fail before history is exposed or a provider is called", async () => {
  const h = harness();
  await assert.rejects(executeArticleEvaluation("article", "owner", { ...h.request, expectedOutput: "unsaved" }, h.ports), /저장/);
  h.deny(); await assert.rejects(readArticleEvaluationHistory("article", "other", h.ports), /FORBIDDEN/);
  await assert.rejects(executeArticleEvaluation("article", "other", h.request, h.ports), /FORBIDDEN/);
  assert.equal(h.calls.length, 0); assert.equal(h.rows.length, 0);
});

test("partial failures persist and retry only failed metrics under the exact snapshot/profile", async () => {
  const h = harness(), measure = h.ports.measure;
  h.ports.measure = async (metric, ...rest) => { if (metric.id === "DEEPEVAL") throw new Error("TIMEOUT"); return measure(metric, ...rest); };
  const first = await executeArticleEvaluation("article", "owner", h.request, h.ports);
  assert.equal(first.status, "PARTIAL"); assert.equal(first.results.find(r => r.id === "DEEPEVAL")?.score, null);
  h.ports.measure = measure; h.calls.length = 0;
  const retry = await executeArticleEvaluation("article", "owner", { ...h.request, idempotencyKey: "request-0002", retryOfId: first.id }, h.ports);
  assert.deepEqual(h.calls, ["DEEPEVAL"]); assert.equal(retry.status, "COMPLETED");
  assert.equal(retry.results.find(r => r.id === "RAGAS")?.reusedFromRunId, first.id);
  h.snapshot.fingerprint = "v2";
  await assert.rejects(executeArticleEvaluation("article", "owner", { ...h.request, idempotencyKey: "request-0003", retryOfId: first.id }, h.ports), /동일/);
});

test("inapplicable criteria never call the model or become passing scores", async () => {
  const h = harness(), runtime = h.ports.runtime;
  h.ports.runtime = async kind => { const r = await runtime(kind); r.profile.metrics.push({ id: "REQUESTED_STYLE", framework: "DEEPEVAL", metric: "GEval", version: "test", threshold: null, applicable: false, reason: "요청한 문체 기준이 없습니다." }); return r; };
  const result = await executeArticleEvaluation("article", "owner", h.request, h.ports);
  const absent = result.results.find(r => r.id === "REQUESTED_STYLE")!;
  assert.equal(absent.state, "NOT_APPLICABLE"); assert.equal(absent.score, null); assert.equal(absent.thresholdPassed, null);
  assert.equal(h.calls.includes("REQUESTED_STYLE"), false);
});

test("freshness is checked again after evaluation and revoked access does not release results", async () => {
  const h = harness(), measure = h.ports.measure;
  h.ports.measure = async (...args) => { const result = await measure(...args); h.snapshot.fingerprint = "changed"; return result; };
  assert.equal((await executeArticleEvaluation("article", "owner", h.request, h.ports)).freshness, "STALE");
  h.ports.measure = async (...args) => { const result = await measure(...args); h.deny(); return result; };
  await assert.rejects(executeArticleEvaluation("article", "owner", { ...h.request, idempotencyKey: "request-0002" }, h.ports), /FORBIDDEN/);
  assert.equal(h.rows[1].status, "COMPLETED");
});

test("changed same-key request, running retry, and malformed metric do not masquerade as success", async () => {
  const h = harness();
  await executeArticleEvaluation("article", "owner", h.request, h.ports);
  h.snapshot.fingerprint = "changed";
  await assert.rejects(executeArticleEvaluation("article", "owner", h.request, h.ports), /IDEMPOTENCY/);
  h.rows[0].status = "RUNNING";
  await assert.rejects(executeArticleEvaluation("article", "owner", { ...h.request, idempotencyKey: "request-0002", retryOfId: "run-0" }, h.ports));
  h.rows[0].status = "INTERRUPTED";
  h.ports.measure = async metric => ({ ...metric, state: "COMPLETED", score: 1000 } as QualityMetric);
  const result = await executeArticleEvaluation("article", "owner", { ...h.request, idempotencyKey: "request-0003" }, h.ports);
  assert.equal(result.status, "FAILED"); assert.ok(result.results.every(r => r.score === null && r.reasonCode === "INVALID_RESULT"));
});
