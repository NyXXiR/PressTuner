import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatQuotaBalance,
  formatQuotaRemaining,
  toQuotaView,
} from "./quotaView";

test("unlimited quota display never exposes the legacy numeric balance", () => {
  assert.equal(formatQuotaRemaining(true, 16), "∞");
  assert.equal(formatQuotaBalance(true, 16, 16), "무제한");
});

const NOW = new Date("2026-07-20T10:00:00.000Z");

test("respects the server status and formats the current-year reset", () => {
  const view = toQuotaView(
    {
      limit: 10,
      usage: 9,
      remaining: 1,
      status: "available",
      resetAt: "2026-07-21T06:24:00.000Z",
      resetLabel: "4시간 58분",
    },
    NOW,
  );

  assert.equal(view.status, "available");
  assert.equal(view.percentUsed, 90);
  assert.equal(view.percentRemaining, 10);
  assert.equal(view.resetAtLabel, "7월 21일 15:24");
  assert.equal(view.resetRelativeLabel, "약 4시간 58분 후");
});

test("calculates a bounded remaining percentage for the popup", () => {
  assert.equal(
    toQuotaView({ limit: 15, usage: 15, remaining: 0 }, NOW).percentRemaining,
    0,
  );
  assert.equal(
    toQuotaView({ limit: 15, usage: 0, remaining: 15 }, NOW).percentRemaining,
    100,
  );
  assert.equal(
    toQuotaView({ limit: 15, usage: 0, remaining: 30 }, NOW).percentRemaining,
    100,
  );
});

test("falls back to limited and near-limit status", () => {
  assert.equal(
    toQuotaView({ limit: 10, usage: 10, remaining: 0 }, NOW).status,
    "limited",
  );
  assert.equal(
    toQuotaView({ limit: 10, usage: 8, remaining: 2 }, NOW).status,
    "near_limit",
  );
});

test("formats a reset in another year and handles midnight rollover", () => {
  const view = toQuotaView(
    { limit: 5, usage: 1, remaining: 4, resetAt: "2026-12-31T15:05:00.000Z" },
    new Date("2026-12-31T14:55:00.000Z"),
  );

  assert.equal(view.resetAtLabel, "2027년 1월 1일 00:05");
  assert.equal(view.resetRelativeLabel, "약 10분 후");
});

test("uses information-unavailable labels for an invalid reset and guards zero limits", () => {
  const view = toQuotaView({ limit: 0, usage: 2, remaining: 0, resetAt: "" }, NOW);
  const invalidView = toQuotaView({ resetAt: "not-a-date" }, NOW);

  assert.equal(view.percentUsed, 0);
  assert.equal(view.percentRemaining, 0);
  assert.equal(view.resetAtLabel, "정보 없음");
  assert.equal(view.resetRelativeLabel, "정보 없음");
  assert.equal(invalidView.resetAtLabel, "정보 없음");
  assert.equal(invalidView.resetRelativeLabel, "정보 없음");
});

test("normalizes the server's immediate reset label", () => {
  const view = toQuotaView(
    {
      resetAt: "2026-07-20T10:00:00.000Z",
      resetLabel: "곧 초기화됩니다",
      status: "limited",
    },
    NOW,
  );

  assert.equal(view.resetRelativeLabel, "곧");
});

test("unlimited usage never projects a limited or near-limit state", () => {
  const view = toQuotaView({
    unlimited: true,
    limit: 16,
    usage: 10_000,
    remaining: 0,
    status: "limited",
  });

  assert.equal(view.unlimited, true);
  assert.equal(view.status, "available");
});
