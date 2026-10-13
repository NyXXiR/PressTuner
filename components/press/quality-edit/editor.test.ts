import assert from "node:assert/strict";
import test from "node:test";
import { usePressEditStore } from "../../../stores/usePressEditStore";
import { requestQualityRevision } from "./revision";
import { fixtureRun } from "../../../domain/press-workflow/evaluation/study-fixture";

test("draft changes reject stale snapshots and report persistence failures without discarding edits", async () => {
  const originalFetch = globalThis.fetch;
  const store = usePressEditStore;
  const base = { title: "제목", plain: "73,000원" }, next = { ...base, plain: "7,300원" };
  store.getState().init({ articleId: "qa", teamId: null, initialTitle: base.title, initialPlain: base.plain });
  let writes = 0;
  globalThis.fetch = async () => { writes++; return new Response("{}", { status: 500 }); };
  try {
    assert.equal(await store.getState().applyDraftChange("other-article", base, next), "STALE");
    assert.equal(await store.getState().applyDraftChange("qa", next, base), "STALE");
    assert.equal(writes, 0);
    assert.equal(await store.getState().applyDraftChange("qa", base, next), "UNSAVED");
    assert.equal(store.getState().plain, next.plain);
    assert.equal(store.getState().saveState, "error");
    globalThis.fetch = async () => new Response("{}");
    assert.equal(await store.getState().applyDraftChange("qa", next, base), "SAVED");
    assert.equal(store.getState().plain, base.plain);
  } finally { globalThis.fetch = originalFetch; }
});

test("quality revision calls existing paid actions only in order and stops after changes, failures or no notes", async () => {
  const source = fixtureRun("quality"), run = { ...source, output: "제목\n\n초안", freshness: "CURRENT" as const, contextCount: 1 };
  for (const mode of ["READY", "EDITED", "NO_NOTES", "SAVE_FAILED", "REVIEW_FAILED"] as const) {
    const calls: string[] = [];
    const current = { articleId: "quality", title: "제목", plain: "초안", notes: [{ id: "note", type: "RISK" }] };
    const action = () => requestQualityRevision("quality", run, {
      current: () => current,
      save: async () => { calls.push("save"); return mode !== "SAVE_FAILED"; },
      review: async () => { calls.push("review"); if (mode === "EDITED") current.plain = "다른 내용"; if (mode === "NO_NOTES") current.notes = []; return mode !== "REVIEW_FAILED"; },
      select: ids => { assert.deepEqual(ids, ["note"]); calls.push("select"); },
      rewrite: async () => { calls.push("rewrite"); return true; },
    });
    if (mode === "READY") { assert.equal(await action(), "READY"); assert.deepEqual(calls, ["save", "review", "select", "rewrite"]); }
    else if (mode === "NO_NOTES") { assert.equal(await action(), "NO_CHANGES"); assert.deepEqual(calls, ["save", "review"]); }
    else { await assert.rejects(action); assert.ok(!calls.includes("rewrite")); }
  }
});

test("a late save cannot mark newly typed text or another article saved", async () => {
  const originalFetch = globalThis.fetch;
  let done!: (r: Response) => void;
  globalThis.fetch = () => new Promise(resolve => { done = resolve; });
  const store = usePressEditStore;
  try {
    store.getState().init({ articleId: "qa", teamId: null, initialTitle: "제목", initialPlain: "초안" });
    const saving = store.getState().saveDraft({ force: true });
    store.getState().setPlain("방금 입력"); done(new Response("{}")); await saving;
    assert.equal(store.getState().saveState, "dirty");
    const previous = store.getState().saveDraft({ force: true });
    store.getState().init({ articleId: "new", teamId: null, initialTitle: "다른 문서", initialPlain: "새 내용" });
    done(new Response("{}")); await previous;
    assert.equal(store.getState().saveState, "idle");
  } finally { globalThis.fetch = originalFetch; }
});

test("autosave and explicit saves serialize; legacy whole-proposal apply also preserves newer edits", async () => {
  const originalFetch = globalThis.fetch, store = usePressEditStore;
  const pending: ((r: Response) => void)[] = [], writes: string[] = [];
  globalThis.fetch = async (_url, init) => {
    writes.push(JSON.parse(String(init?.body)).plain);
    return new Promise(resolve => pending.push(resolve));
  };
  try {
    store.getState().init({ articleId: "qa", teamId: null, initialTitle: "제목", initialPlain: "처음" });
    const first = store.getState().saveDraft({ force: true });
    store.getState().setPlain("다음");
    const second = store.getState().saveDraft({ force: true });
    assert.deepEqual(writes, ["처음"]);
    pending.shift()!(new Response("{}")); await first;
    assert.deepEqual(writes, ["처음", "다음"]);
    pending.shift()!(new Response("{}")); await second;
    assert.equal(store.getState().saveState, "saved");
    store.getState().setPendingResult({ title: "제목", plain: "전체 후보", base: { title: "제목", plain: "처음" } });
    await store.getState().applyPendingResult();
    assert.equal(store.getState().plain, "다음");
    assert.equal(writes.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
