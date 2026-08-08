import assert from "node:assert/strict";
import test from "node:test";
import { formatRelativeTimeKo } from "./formatRelativeTimeKo";

const now = new Date("2026-08-08T12:00:00Z");

test("formats recent moments in Korean", () => {
  assert.equal(formatRelativeTimeKo("2026-08-08T11:59:40Z", now), "방금 전");
  assert.equal(formatRelativeTimeKo("2026-08-08T11:45:00Z", now), "15분 전");
  assert.equal(formatRelativeTimeKo("2026-08-08T09:00:00Z", now), "3시간 전");
  assert.equal(formatRelativeTimeKo("2026-08-07T13:00:00Z", now), "어제");
  assert.equal(formatRelativeTimeKo("2026-08-05T12:00:00Z", now), "3일 전");
});

test("falls back to a date for older or invalid values", () => {
  assert.equal(formatRelativeTimeKo("2026-06-01T00:00:00Z", now), "2026.06.01");
  assert.equal(formatRelativeTimeKo("not-a-date", now), "");
  // 미래 시각(클럭 스큐)은 방금 전으로 수렴
  assert.equal(formatRelativeTimeKo("2026-08-08T12:00:30Z", now), "방금 전");
});
