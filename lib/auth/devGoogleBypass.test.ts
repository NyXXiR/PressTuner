import assert from "node:assert/strict";
import test from "node:test";

import {
  DEV_GOOGLE_BYPASS_EMAIL,
  isDevGoogleBypassEligible,
  sanitizeDevLoginNextPath,
} from "./devGoogleBypass";

test("development bypass is limited to the fixed account on loopback hosts", () => {
  assert.equal(DEV_GOOGLE_BYPASS_EMAIL, "lgh0334@gmail.com");
  assert.equal(
    isDevGoogleBypassEligible({ NODE_ENV: "development" }, "localhost:3003"),
    true,
  );
  assert.equal(
    isDevGoogleBypassEligible({ NODE_ENV: "development" }, "127.0.0.1:3003"),
    true,
  );
  assert.equal(
    isDevGoogleBypassEligible({ NODE_ENV: "development" }, "[::1]:3003"),
    true,
  );
});

test("development bypass is disabled in production and on remote hosts", () => {
  assert.equal(
    isDevGoogleBypassEligible({ NODE_ENV: "production" }, "localhost:3003"),
    false,
  );
  assert.equal(
    isDevGoogleBypassEligible({ NODE_ENV: "development" }, "dev.example.com"),
    false,
  );
});

test("development login accepts only internal next paths", () => {
  assert.equal(sanitizeDevLoginNextPath("/resume/documents"), "/resume/documents");
  assert.equal(sanitizeDevLoginNextPath("//evil.example"), "/");
  assert.equal(sanitizeDevLoginNextPath("https://evil.example"), "/");
  assert.equal(sanitizeDevLoginNextPath(null), "/");
});
