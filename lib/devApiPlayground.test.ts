import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDevApiPlaygroundEnabled,
  isDevApiPlaygroundAutoSessionEligible,
  isDevApiPlaygroundEnabled,
} from "./devApiPlayground";

test("the playground is enabled outside production", () => {
  assert.equal(isDevApiPlaygroundEnabled({ NODE_ENV: "development" }), true);
  assert.equal(isDevApiPlaygroundEnabled({ NODE_ENV: "test" }), true);
});

test("production requires the dedicated explicit flag", () => {
  assert.equal(isDevApiPlaygroundEnabled({ NODE_ENV: "production" }), false);
  assert.equal(
    isDevApiPlaygroundEnabled({
      NODE_ENV: "production",
      ENABLE_DEV_API_PLAYGROUND: "true",
    }),
    true,
  );
});

test("automatic session bootstrap is restricted to non-production", () => {
  assert.equal(
    isDevApiPlaygroundAutoSessionEligible({ NODE_ENV: "development" }),
    true,
  );
  assert.equal(isDevApiPlaygroundAutoSessionEligible({ NODE_ENV: "test" }), true);
  assert.equal(
    isDevApiPlaygroundAutoSessionEligible({
      NODE_ENV: "production",
      ENABLE_DEV_API_PLAYGROUND: "true",
    }),
    false,
  );
});

test("the disabled assertion conceals the route with 404", () => {
  assert.throws(
    () => assertDevApiPlaygroundEnabled({ NODE_ENV: "production" }),
    (error: unknown) =>
      (error as { message?: string; status?: number }).message === "NOT_FOUND" &&
      (error as { status?: number }).status === 404,
  );
});
