import assert from "node:assert/strict";
import test from "node:test";
import { retainDeliveredAiProcessFacts } from "./deliveredFactRetention";

test("retention sends source-scoped strict-cutoff predicates to both bounded operations", async () => {
  const calls: unknown[] = [];
  const database = {
    aiProcessFactOutbox: {
      findMany: async (args: unknown) => { calls.push(args); return [{ id: "oldest" }, { id: "next" }]; },
      deleteMany: async (args: unknown) => { calls.push(args); return { count: 2 }; },
    },
  };
  const result = await retainDeliveredAiProcessFacts({ retentionDays: 30, batchSize: 2, now: new Date("2030-02-01T00:00:00.000Z"), database });
  assert.deepEqual(result, { selectedCount: 2, deletedCount: 2 });
  const serialized = JSON.stringify(calls);
  assert.match(serialized, /urn:presstuner:ai-process-console:facts:v1/);
  assert.match(serialized, /DELIVERED/);
  assert.match(serialized, /oldest/);
  assert.equal((calls[0] as { take: number }).take, 2);
  assert.deepEqual((calls[0] as { orderBy: unknown }).orderBy, [{ deliveredAt: "asc" }, { id: "asc" }]);
});

test("retention rejects unsafe windows and batches before data access", async () => {
  const database = { aiProcessFactOutbox: { findMany: async () => { throw new Error("must not query"); }, deleteMany: async () => ({ count: 0 }) } };
  await assert.rejects(retainDeliveredAiProcessFacts({ retentionDays: 6, batchSize: 1, database }), /RETENTION_DAYS_INVALID/);
  await assert.rejects(retainDeliveredAiProcessFacts({ retentionDays: 7, batchSize: 1001, database }), /RETENTION_BATCH_INVALID/);
});
