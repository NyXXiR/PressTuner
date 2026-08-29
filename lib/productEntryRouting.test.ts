import assert from "node:assert/strict";
import test from "node:test";

import {
  PRODUCT_TRACK_STORAGE_KEY,
  productRootPath,
  productTrackFromPathname,
  readPreferredProductTrack,
  rememberPreferredProductTrack,
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
  assert.equal(productRootPath("press"), "/press");
  assert.equal(productRootPath("resume"), "/resume");
});

test("track preference uses one browser-local value", () => {
  const storage = memoryStorage();
  rememberPreferredProductTrack(storage, "resume");

  assert.equal(readPreferredProductTrack(storage), "resume");

  rememberPreferredProductTrack(storage, "press");
  assert.equal(readPreferredProductTrack(storage), "press");
});

test("invalid or unavailable storage does not force a product", () => {
  const invalid = memoryStorage({
    [PRODUCT_TRACK_STORAGE_KEY]: "unknown",
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
