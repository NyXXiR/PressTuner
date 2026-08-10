import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRESS_PROCESS_LOCK_PREFIX,
  rehydratePressProcessState,
  withLockedPressProcess,
  type PressProcessPersistenceRecord,
} from "./pressProcessPrismaAdapter";

function record(patch: Partial<PressProcessPersistenceRecord> = {}): PressProcessPersistenceRecord {
  return {
    status: "DRAFT",
    title: "제목 미정",
    bodyJson: { paragraphs: [], closing: "" },
    rawInput: null,
    refinementQna: null,
    updatedAt: new Date("2026-08-10T00:00:00Z"),
    pressExtra: null,
    groundingRevision: 0,
    corpusVersion: 0,
    assignments: [],
    verification: null,
    ...patch,
  };
}

describe("Prisma press process adapter", () => {
  it("rehydrates persisted phases and stale verification", () => {
    assert.equal(rehydratePressProcessState(record({ status: "FINAL" })).phase, "FINALIZED");
    assert.equal(rehydratePressProcessState(record({ title: "원고" })).phase, "DRAFT_READY");
    assert.equal(rehydratePressProcessState(record({
      title: "원고",
      verification: { result: "PASS", draftHash: "old", groundingRevision: 0, corpusVersion: 0 },
    })).verification.kind, "STALE");
  });

  it("starts a transaction, locks the exact shared key, loads, then calls back", async () => {
    const calls: string[] = [];
    const article = {
      status: "DRAFT", title: "원고", bodyJson: {}, rawInput: null,
      refinementQna: null, updatedAt: new Date(), pressExtra: null,
      groundingState: null, team: null, reviewAssignments: [], verifications: [],
    };
    const tx = {
      $executeRaw(strings: TemplateStringsArray, key: string) {
        calls.push(`lock:${key}`);
        assert.match(strings.join("?"), /pg_advisory_xact_lock/);
        return Promise.resolve(1);
      },
      article: {
        findFirst(args: { where: { id: string; teamId?: string } }) {
          calls.push(`load:${args.where.id}:${args.where.teamId}`);
          return Promise.resolve(article);
        },
      },
    };
    const database = {
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => {
        calls.push("transaction");
        return callback(tx);
      },
    };

    await withLockedPressProcess(
      { articleId: "article-1", teamId: "team-1" },
      async () => { calls.push("callback"); },
      database as never,
    );

    assert.equal(PRESS_PROCESS_LOCK_PREFIX, "press-process");
    assert.deepEqual(calls, [
      "transaction",
      "lock:press-process:article-1",
      "load:article-1:team-1",
      "callback",
    ]);
  });

  it("does not enter the callback when the scoped article is missing", async () => {
    let entered = false;
    const tx = {
      $executeRaw: () => Promise.resolve(1),
      article: { findFirst: () => Promise.resolve(null) },
    };
    const database = { $transaction: (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) };
    await assert.rejects(
      withLockedPressProcess(
        { articleId: "missing", teamId: "team-1" },
        async () => { entered = true; },
        database as never,
      ),
      /ARTICLE_NOT_FOUND/,
    );
    assert.equal(entered, false);
  });
});
