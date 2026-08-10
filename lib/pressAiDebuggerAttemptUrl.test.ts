import assert from "node:assert/strict";
import test from "node:test";
import {
  readAttemptIdFromSearch,
  withAttemptParam,
} from "./pressAiDebuggerAttemptUrl";

test("reads attempt id from a query string", () => {
  assert.equal(readAttemptIdFromSearch("?attempt=abc-123"), "abc-123");
  assert.equal(readAttemptIdFromSearch("attempt=abc-123"), "abc-123");
  assert.equal(
    readAttemptIdFromSearch("?tab=history&attempt=cmskg0x3v0001"),
    "cmskg0x3v0001",
  );
});

test("rejects missing or malformed attempt ids", () => {
  assert.equal(readAttemptIdFromSearch(""), null);
  assert.equal(readAttemptIdFromSearch("?attempt="), null);
  assert.equal(readAttemptIdFromSearch("?other=1"), null);
  assert.equal(readAttemptIdFromSearch("?attempt=with space"), null);
  assert.equal(readAttemptIdFromSearch("?attempt=<script>"), null);
  assert.equal(readAttemptIdFromSearch(`?attempt=${"a".repeat(100)}`), null);
});

test("withAttemptParam sets, replaces, and clears the parameter", () => {
  assert.equal(withAttemptParam("", "abc"), "?attempt=abc");
  assert.equal(withAttemptParam("?attempt=old", "new"), "?attempt=new");
  assert.equal(
    withAttemptParam("?tab=history", "abc"),
    "?tab=history&attempt=abc",
  );
  assert.equal(withAttemptParam("?attempt=old", null), "");
  assert.equal(withAttemptParam("?tab=history&attempt=old", null), "?tab=history");
  assert.equal(
    withAttemptParam("?attempt=old&tab=history&filter=blocked", null),
    "?tab=history&filter=blocked",
  );
});
