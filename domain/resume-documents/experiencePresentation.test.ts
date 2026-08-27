import assert from "node:assert/strict";
import test from "node:test";

import type { ItemContent } from "./model";
import {
  calculateAutomaticCareerDurationMonths,
  formatCareerDuration,
  normalizeCareerDurationOverride,
  parseYearMonth,
  resolveCareerDurationMonths,
  sortExperienceItems,
} from "./experiencePresentation";

const item = (id: string, patch: Partial<ItemContent> = {}): ItemContent => ({
  id,
  meta: "",
  title: id,
  subtitle: "",
  body: "",
  ...patch,
});

test("strict year-month parsing accepts calendar months only", () => {
  assert.equal(parseYearMonth("2024-01"), 2024 * 12);
  assert.equal(parseYearMonth("2024-12"), 2024 * 12 + 11);
  for (const value of [undefined, "", "2024-1", "2024-00", "2024-13", "not-a-month"]) {
    assert.equal(parseYearMonth(value), null);
  }
});

test("experience sorting is stable, keeps undated items last, and does not mutate input", () => {
  const source = [
    item("missing"),
    item("same-a", { startMonth: "2024-05" }),
    item("malformed", { startMonth: "2024-1" }),
    item("newest", { startMonth: "2025-01" }),
    item("same-b", { startMonth: "2024-05" }),
    item("impossible", { startMonth: "2024-13" }),
    item("oldest", { startMonth: "2023-12" }),
  ];
  const snapshot = structuredClone(source);

  assert.deepEqual(
    sortExperienceItems(source, "latest-first").map(({ id }) => id),
    ["newest", "same-a", "same-b", "oldest", "missing", "malformed", "impossible"],
  );
  assert.deepEqual(
    sortExperienceItems(source, "oldest-first").map(({ id }) => id),
    ["oldest", "same-a", "same-b", "newest", "missing", "malformed", "impossible"],
  );
  assert.deepEqual(source, snapshot);
});

test("automatic duration counts the union of inclusive, overlapping, nested, adjacent, and duplicate ranges", () => {
  const items = [
    item("single", { startMonth: "2020-01", endMonth: "2020-01" }),
    item("overlap", { startMonth: "2020-01", endMonth: "2020-03" }),
    item("nested", { startMonth: "2020-02", endMonth: "2020-02" }),
    item("adjacent", { startMonth: "2020-04", endMonth: "2020-05" }),
    item("duplicate", { startMonth: "2020-01", endMonth: "2020-03" }),
  ];
  assert.equal(calculateAutomaticCareerDurationMonths(items, "2026-08"), 5);
});

test("automatic career duration excludes project and activity records", () => {
  const items = [
    item("employment", { itemKind: "work", startMonth: "2020-01", endMonth: "2020-12" }),
    item("project", { itemKind: "project", startMonth: "2019-01", endMonth: "2021-12" }),
    item("activity", { itemKind: "activity", startMonth: "2018-01", endMonth: "2018-12" }),
  ];
  assert.equal(calculateAutomaticCareerDurationMonths(items, "2026-08"), 12);
});

test("current roles end at the injected current month and invalid ranges are ignored", () => {
  const items = [
    item("current", { startMonth: "2024-11", isCurrent: true }),
    item("malformed", { startMonth: "2024-1", endMonth: "2024-12" }),
    item("incomplete", { startMonth: "2024-01" }),
    item("future-current", { startMonth: "2027-01", isCurrent: true }),
    item("reversed", { startMonth: "2025-02", endMonth: "2025-01" }),
    item("disabled", { startMonth: "2020-01", endMonth: "2020-12", endMonthEnabled: false }),
  ];
  assert.equal(calculateAutomaticCareerDurationMonths(items, "2025-02"), 4);
});

test("manual duration normalization and formatting use one nonnegative total-month value", () => {
  assert.equal(normalizeCareerDurationOverride(5, 2), 62);
  assert.equal(normalizeCareerDurationOverride(-2, 99), 11);
  assert.equal(formatCareerDuration(62), "총 경력 5년 2개월");
  assert.equal(formatCareerDuration(12), "총 경력 1년");
  assert.equal(formatCareerDuration(0), "총 경력 0개월");
});

test("a valid manual override takes precedence over automatic duration", () => {
  const items = [item("automatic", { startMonth: "2024-01", endMonth: "2024-12" })];
  assert.equal(resolveCareerDurationMonths(items, 62, "2025-01"), 62);
  assert.equal(resolveCareerDurationMonths(items, -1, "2025-01"), 12);
  assert.equal(resolveCareerDurationMonths(items, Number.NaN, "2025-01"), 12);
});
