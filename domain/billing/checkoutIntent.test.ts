import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCheckoutIntentMobilePath,
  buildCheckoutIntentMobileUrl,
  CHECKOUT_INTENT_TTL_MINUTES,
  createCheckoutIntentExpiry,
  createCheckoutIntentToken,
  dbProviderToPayProvider,
  hashCheckoutIntentToken,
  isCheckoutIntentExpired,
  isCheckoutIntentTerminal,
  normalizeCheckoutIntentToken,
} from "./checkoutIntent";

test("createCheckoutIntentToken creates a url-safe token", () => {
  const token = createCheckoutIntentToken();

  assert.ok(token.length >= 16);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
});

test("normalizeCheckoutIntentToken rejects empty or short values", () => {
  assert.equal(normalizeCheckoutIntentToken(""), null);
  assert.equal(normalizeCheckoutIntentToken(" short "), null);
  assert.equal(normalizeCheckoutIntentToken("bad token!"), null);
  assert.equal(
    normalizeCheckoutIntentToken("  valid_token-0123456789  "),
    "valid_token-0123456789",
  );
});

test("hashCheckoutIntentToken is deterministic", () => {
  const token = "valid_token-0123456789";

  assert.equal(
    hashCheckoutIntentToken(token),
    hashCheckoutIntentToken(token),
  );
  assert.notEqual(
    hashCheckoutIntentToken(token),
    hashCheckoutIntentToken("another-valid-token-987654321"),
  );
});

test("createCheckoutIntentExpiry uses the expected ttl window", () => {
  const now = new Date("2026-04-30T00:00:00.000Z");
  const expiresAt = createCheckoutIntentExpiry(now);

  assert.equal(
    expiresAt.toISOString(),
    new Date(
      now.getTime() + CHECKOUT_INTENT_TTL_MINUTES * 60 * 1000,
    ).toISOString(),
  );
});

test("checkout intent helpers detect terminal and expired states", () => {
  assert.equal(isCheckoutIntentTerminal("OPEN"), false);
  assert.equal(isCheckoutIntentTerminal("FAILED"), false);
  assert.equal(isCheckoutIntentTerminal("COMPLETED"), true);
  assert.equal(
    isCheckoutIntentExpired(
      new Date("2026-04-30T00:00:00.000Z"),
      new Date("2026-04-30T00:00:00.000Z"),
    ),
    true,
  );
  assert.equal(
    isCheckoutIntentExpired(
      new Date("2026-04-30T00:10:00.000Z"),
      new Date("2026-04-30T00:00:00.000Z"),
    ),
    false,
  );
});

test("dbProviderToPayProvider maps Prisma enum values back to client ids", () => {
  assert.equal(dbProviderToPayProvider("INICIS"), "inicis");
  assert.equal(dbProviderToPayProvider("KAKAOPAY"), "kakaopay");
});

test("checkout intent path helpers build a public mobile url", () => {
  assert.equal(
    buildCheckoutIntentMobilePath("abc_token"),
    "/checkout/mobile?intent=abc_token",
  );
  assert.equal(
    buildCheckoutIntentMobileUrl("https://presstuner.com", "abc_token"),
    "https://presstuner.com/checkout/mobile?intent=abc_token",
  );
});
