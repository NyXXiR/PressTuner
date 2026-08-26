import assert from "node:assert/strict";
import test from "node:test";

import {
  isTransientDatabaseConnectionError,
  withTransientDatabaseRetry,
} from "./transientDatabaseRetry";

test("retries transient Prisma connection failures with bounded backoff", async () => {
  let attempts = 0;
  const delays: number[] = [];

  const result = await withTransientDatabaseRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("connection failed"), { code: "P1001" });
      return "connected";
    },
    {
      attempts: 5,
      baseDelayMs: 100,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    },
  );

  assert.equal(result, "connected");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 200]);
});

test("does not retry non-transient database or domain failures", async () => {
  let attempts = 0;

  await assert.rejects(
    withTransientDatabaseRetry(
      async () => {
        attempts += 1;
        throw Object.assign(new Error("unique constraint"), { code: "P2002" });
      },
      { attempts: 5, sleep: async () => {} },
    ),
    /unique constraint/,
  );

  assert.equal(attempts, 1);
});

test("recognizes the connection message emitted by the current Prisma proxy path", () => {
  assert.equal(
    isTransientDatabaseConnectionError(
      new Error("Can't reach database server at `192.168.219.101:65432`"),
    ),
    true,
  );
});
