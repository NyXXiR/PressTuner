import assert from "node:assert/strict";
import test from "node:test";

import {
  preferredProductTrackStorageKey,
  productEntryPath,
  productTrackFromPathname,
  readPreferredProductTrack,
  rememberPreferredProductTrack,
  resolvePreferredProductEntry,
  resolvePreferredProductEntryDecision,
} from "./productEntryRouting";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

test("product routes map to symmetric press and resume tracks", () => {
  assert.equal(productTrackFromPathname("/press"), "press");
  assert.equal(productTrackFromPathname("/press/dashboard"), "press");
  assert.equal(productTrackFromPathname("/resume"), "resume");
  assert.equal(productTrackFromPathname("/resume/applications/one"), "resume");
  assert.equal(productTrackFromPathname("/"), null);
  assert.equal(productTrackFromPathname("/my"), null);
  assert.equal(productEntryPath("press"), "/press/dashboard");
  assert.equal(productEntryPath("resume"), "/resume/dashboard");
});

test("a stored track wins, then a product-specific plan, with no press-biased fallback", () => {
  assert.equal(
    resolvePreferredProductEntry({ storedTrack: "resume", planCategory: "PRESS" }),
    "/resume/dashboard",
  );
  assert.equal(
    resolvePreferredProductEntry({ planCategory: "CAREER" }),
    "/resume/dashboard",
  );
  assert.equal(
    resolvePreferredProductEntry({ planCategory: "PRESS" }),
    "/press/dashboard",
  );
  assert.equal(resolvePreferredProductEntry({ planCategory: "STANDARD" }), null);
  assert.equal(resolvePreferredProductEntry({}), null);
  assert.deepEqual(
    resolvePreferredProductEntryDecision({ storedTrack: "resume" }),
    {
      path: "/resume/dashboard",
      track: "resume",
      reason: "recent-track",
    },
  );
});

test("track preference is browser-aware and user-specific", () => {
  const storage = memoryStorage();
  rememberPreferredProductTrack(storage, "resume", "user-1");

  assert.equal(readPreferredProductTrack(storage, "user-1"), "resume");
  assert.equal(readPreferredProductTrack(storage), "resume");

  storage.setItem(preferredProductTrackStorageKey("user-2"), "press");
  assert.equal(readPreferredProductTrack(storage, "user-2"), "press");
});

test("invalid or unavailable storage does not force a product", () => {
  const invalid = memoryStorage({
    [preferredProductTrackStorageKey()]: "unknown",
  });
  assert.equal(readPreferredProductTrack(invalid), null);

  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(readPreferredProductTrack(blocked), null);
  assert.doesNotThrow(() => rememberPreferredProductTrack(blocked, "press"));
});
