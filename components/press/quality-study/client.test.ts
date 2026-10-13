import assert from "node:assert/strict";
import test from "node:test";
import { StudyClient } from "./client";

const summary = (revision: number) => ({ id: "study", name: "Test", revision, frozenAt: null, datasetHash: null, counts: { samples: 0, references: 0, reviewRevisions: 0 }, batches: [], pairs: [], samples: [], experiments: [], judgeReplays: [] });
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } }; };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test("the browser fetch implementation is invoked with its global receiver", async () => {
  const client = new StudyClient("browser", async function (this: unknown) {
    assert.equal(this, globalThis);
    return json(summary(1));
  }, memory());
  await client.open("study");
  await client.send({ action: "ASSIGN_REVIEW", purpose: "PRODUCT" });
});

test("ambiguous saves survive reload and explicitly retry exactly the same request", async () => {
  const store = memory(), bodies: string[] = [];
  let fail = true;
  const fetcher: typeof fetch = async (_url, init) => {
    if (init?.method === "POST") { bodies.push(String(init.body)); if (fail) throw new Error("lost response"); return json(summary(2)); }
    return json(summary(1));
  };
  const first = new StudyClient("test", fetcher, store);
  await first.open("study");
  await assert.rejects(first.send({ action: "ASSIGN_REVIEW", purpose: "PRODUCT" }));
  assert.ok(first.pending);
  await assert.rejects(first.send({ action: "FREEZE_DATASET" }), /PENDING_REQUEST/);
  fail = false;
  const resumed = new StudyClient("test", fetcher, store);
  assert.ok(resumed.pending);
  await resumed.retry();
  assert.equal(bodies[0], bodies[1]);
  assert.equal(resumed.current?.revision, 2);
  assert.equal(resumed.pending, null);
});

test("revision conflicts refresh the snapshot without silently resubmitting a choice", async () => {
  let writes = 0, reads = 0;
  const client = new StudyClient("test", async (_url, init) => {
    if (init?.method === "POST") { writes++; return json({ code: "STUDY_REVISION_CONFLICT" }, 409); }
    return json(summary(++reads));
  }, memory());
  await client.open("study");
  await assert.rejects(client.send({ action: "ASSIGN_REVIEW", purpose: "PRODUCT" }), /STUDY_REVISION_CONFLICT/);
  assert.equal(writes, 1);
  assert.equal(client.current?.revision, 2);
  assert.equal(client.pending, null);
});

test("summary reads never request a report; concurrent actions are rejected", async () => {
  const urls: string[] = []; let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const client = new StudyClient("test", async (url, init) => {
    urls.push(String(url));
    if (init?.method === "POST") await wait;
    return json(summary(1));
  }, memory());
  await client.open("study");
  const saving = client.send({ action: "ASSIGN_REVIEW", purpose: "PRODUCT" });
  await assert.rejects(client.send({ action: "ASSIGN_REVIEW", purpose: "DEVELOPMENT" }), /BUSY/);
  release(); await saving;
  assert.ok(urls.every(url => !url.includes("view=report")));
});
