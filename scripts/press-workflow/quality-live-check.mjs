// Bounded authenticated API verification against the named synthetic demo only.
// Stores summaries/hashes, never session cookies, credentials, or article text.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { standardDraftText } from "../../domain/press-workflow/evaluation/standard.ts";
import { buildCanonicalArticlePlain } from "../../domain/article/articleCanonicalContent.ts";

const mode = process.argv[2];
if (!["--allow-model-spend", "--read-only"].includes(mode)) throw new Error("Use --allow-model-spend for one STANDARD and GEVAL run, or --read-only to verify saved evidence without model calls.");
const path = resolve("evals/press-workflow/evidence", `${new Date().toISOString().slice(0, 10)}-article-quality-history.json`);
// Reserve evidence before spending; an existing result or failed run is never overwritten.
if (mode === "--allow-model-spend") { await mkdir(resolve("evals/press-workflow/evidence"), { recursive: true }); await writeFile(path, "", { flag: "wx" }); }
const base = "http://localhost:3003", articleId = "standard-evaluation-demo", endpoint = `${base}/api/articles/${articleId}/quality-evaluation`;
const login = await fetch(`${base}/api/auth/dev/google-bypass?next=/press/${articleId}/edit`, { redirect: "manual", signal: AbortSignal.timeout(60000) });
assert.equal(login.status, 307);
const cookie = login.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
assert.ok(cookie);
const headers = { Cookie: cookie, Origin: base, "Content-Type": "application/json" };
async function json(url, request) {
  const response = await fetch(url, { headers, ...request, signal: AbortSignal.timeout(420000) });
  const value = await response.json();
  assert.equal(response.status, 200, `${url}: ${value.code ?? "unexpected status"}`);
  return value;
}
if (mode === "--read-only") {
  const evidence = JSON.parse(await readFile(path, "utf8")), state = await json(endpoint);
  for (const saved of evidence.results) {
    const restored = state.history.find(r => r.id === saved.id);
    assert.ok(restored); assert.equal(restored.profileHash, saved.profileHash); assert.equal(restored.status, saved.status);
    for (const metric of saved.metrics) {
      const actual = restored.results.find(r => r.id === metric.id);
      assert.equal(actual.state, metric.state); assert.equal(actual.score, metric.score);
    }
  }
  assert.ok(state.runtimes.STANDARD.available && state.runtimes.GEVAL.available);
  console.log(JSON.stringify({ providerCalls: 0, savedRunsRestored: evidence.results.length,
    currentImplementationHashes: Object.fromEntries(Object.entries(state.runtimes).map(([kind, value]) => [kind, value.profile.implementationHash])) }, null, 2));
  process.exit(0);
}
const { article } = await json(`${base}/api/articles/${articleId}`);
assert.equal(article.teamId, "standard-evaluation-demo-team");
assert.ok(article.title.startsWith("[검증용]"), "Refuse non-synthetic article");
const body = article.bodyJson ?? {};
const expectedOutput = standardDraftText(article.title, buildCanonicalArticlePlain({ lead: body.lead || article.pressExtra?.lead,
  fact: body.fact || article.pressExtra?.fact, paragraphs: (body.paragraphs ?? []).map(p => typeof p === "string" ? p : p.text), closing: body.closing ?? "", rawInput: article.rawInput }));
const results = [];
for (const kind of ["STANDARD", "GEVAL"]) {
  const request = { kind, expectedOutput, idempotencyKey: randomUUID() };
  const started = performance.now();
  const { result } = await json(endpoint, { method: "POST", body: JSON.stringify(request) });
  const initial = JSON.stringify(result.results);
  const { result: replay } = await json(endpoint, { method: "POST", body: JSON.stringify(request) });
  assert.equal(replay.id, result.id); assert.equal(JSON.stringify(replay.results), initial);
  const restored = (await json(endpoint)).history.find(r => r.id === result.id);
  assert.equal(JSON.stringify(restored.results), initial); assert.equal(restored.freshness, "CURRENT");
  results.push({ kind, id: result.id, status: result.status, model: result.profile.model, fingerprint: result.fingerprint, profileHash: result.profileHash,
    elapsedIncludingReplayMs: Math.round(performance.now() - started), sameKeyReplayed: true, historyRestored: true,
    metrics: result.results.map(({ id, state, score, threshold, reasonCode, elapsedMs, usage }) => ({ id, state, score, threshold, reasonCode, elapsedMs, usage })) });
  console.log(JSON.stringify(results.at(-1), null, 2));
}
await writeFile(path, JSON.stringify({ version: "press-quality-history-evidence/v1", evaluatedAt: new Date().toISOString(), source: "SYNTHETIC_DEMO", humanValidation: "NOT_PERFORMED", results }, null, 2) + "\n");
console.log(`Evidence: ${path}`);
assert.ok(results.every(r => r.status === "COMPLETED"), "Inspect persisted partial failures before claiming completion");
