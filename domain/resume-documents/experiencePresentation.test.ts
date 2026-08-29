import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateAutomaticCareerDurationMonths,
  formatCareerDuration,
  groupCareerDetails,
  normalizeCareerDurationOverride,
  orderCareerDetailDisplayGroups,
  parseYearMonth,
  resolveCareerDurationLabel,
  resolveCareerDurationMonths,
  sortExperienceItems,
} from "./experiencePresentation";
import type { ItemContent } from "./model";

const item = (id: string, patch: Partial<ItemContent> = {}): ItemContent => ({ id, meta: "", title: id, subtitle: "", body: "", ...patch });
const work = (id: string, title: string, subtitle = "개발자", startMonth = "2024-01"): ItemContent => ({ id, itemKind: "work", meta: "", startMonth, title, subtitle, body: "" });
const detail = (id: string, patch: Partial<ItemContent> = {}): ItemContent => ({ id, itemKind: "career-detail", detailType: "project", meta: "", title: id, subtitle: "", body: "", ...patch });

test("strict year-month parsing accepts calendar months only", () => {
  assert.equal(parseYearMonth("2024-01"), 2024 * 12);
  assert.equal(parseYearMonth("2024-12"), 2024 * 12 + 11);
  for (const value of [undefined, "", "2024-1", "2024-00", "2024-13", "not-a-month"]) assert.equal(parseYearMonth(value), null);
});

test("experience sorting is stable, keeps undated items last, and does not mutate input", () => {
  const source = [
    item("missing"), item("same-a", { startMonth: "2024-05" }), item("malformed", { startMonth: "2024-1" }),
    item("newest", { startMonth: "2025-01" }), item("same-b", { startMonth: "2024-05" }),
    item("impossible", { startMonth: "2024-13" }), item("oldest", { startMonth: "2023-12" }),
  ];
  const snapshot = structuredClone(source);
  assert.deepEqual(sortExperienceItems(source, "latest-first").map(({ id }) => id), ["newest", "same-a", "same-b", "oldest", "missing", "malformed", "impossible"]);
  assert.deepEqual(sortExperienceItems(source, "oldest-first").map(({ id }) => id), ["oldest", "same-a", "same-b", "newest", "missing", "malformed", "impossible"]);
  assert.deepEqual(source, snapshot);
});

test("automatic duration counts the union of inclusive, overlapping, nested, adjacent, and duplicate ranges", () => {
  const items = [
    item("single", { startMonth: "2020-01", endMonth: "2020-01" }), item("overlap", { startMonth: "2020-01", endMonth: "2020-03" }),
    item("nested", { startMonth: "2020-02", endMonth: "2020-02" }), item("adjacent", { startMonth: "2020-04", endMonth: "2020-05" }),
    item("duplicate", { startMonth: "2020-01", endMonth: "2020-03" }),
  ];
  assert.equal(calculateAutomaticCareerDurationMonths(items, "2026-08"), 5);
});

test("automatic career duration excludes career details and legacy project/activity records", () => {
  const items = [
    item("employment", { itemKind: "work", startMonth: "2020-01", endMonth: "2020-12" }),
    item("detail", { itemKind: "career-detail", startMonth: "2019-01", endMonth: "2021-12" }),
    item("project", { itemKind: "project", startMonth: "2019-01", endMonth: "2021-12" }),
    item("activity", { itemKind: "activity", startMonth: "2018-01", endMonth: "2018-12" }),
  ];
  assert.equal(calculateAutomaticCareerDurationMonths(items, "2026-08"), 12);
});

test("automatic career duration excludes employment explicitly marked out of the total", () => {
  const items = [
    item("included", { itemKind: "work", startMonth: "2024-01", endMonth: "2024-12" }),
    item("excluded", { itemKind: "work", startMonth: "2020-01", endMonth: "2023-12", excludeFromCareerDuration: true }),
  ];
  assert.equal(calculateAutomaticCareerDurationMonths(items, "2026-08"), 12);
});

test("current roles end at the injected current month and invalid ranges are ignored", () => {
  const items = [
    item("current", { startMonth: "2024-11", isCurrent: true }), item("malformed", { startMonth: "2024-1", endMonth: "2024-12" }),
    item("incomplete", { startMonth: "2024-01" }), item("future-current", { startMonth: "2027-01", isCurrent: true }),
    item("reversed", { startMonth: "2025-02", endMonth: "2025-01" }), item("disabled", { startMonth: "2020-01", endMonth: "2020-12", endMonthEnabled: false }),
  ];
  assert.equal(calculateAutomaticCareerDurationMonths(items, "2025-02"), 4);
});

test("manual duration normalization and formatting use one nonnegative total-month value", () => {
  assert.equal(normalizeCareerDurationOverride(5, 2), 62);
  assert.equal(normalizeCareerDurationOverride(-2, 99), 11);
  assert.equal(formatCareerDuration(62), "총 경력 5년 2개월");
  assert.equal(formatCareerDuration(12), "총 경력 1년");
  assert.equal(formatCareerDuration(0), "총 경력 0개월");
  assert.equal(formatCareerDuration(38, "relevant"), "관련 경력 3년 2개월");
});

test("career duration label defaults to relevant when a work item is excluded", () => {
  const items = [
    item("included", { itemKind: "work" }),
    item("excluded", { itemKind: "work", excludeFromCareerDuration: true }),
  ];
  assert.equal(resolveCareerDurationLabel(items, undefined), "relevant");
  assert.equal(resolveCareerDurationLabel(items, "auto"), "relevant");
  assert.equal(resolveCareerDurationLabel(items, "total"), "total");
  assert.equal(resolveCareerDurationLabel(items, "relevant"), "relevant");
  assert.equal(resolveCareerDurationLabel([items[0]], undefined), "total");
});

test("a valid manual override takes precedence over automatic duration", () => {
  const items = [item("automatic", { startMonth: "2024-01", endMonth: "2024-12" })];
  assert.equal(resolveCareerDurationMonths(items, 62, "2025-01"), 62);
  assert.equal(resolveCareerDurationMonths(items, -1, "2025-01"), 12);
  assert.equal(resolveCareerDurationMonths(items, Number.NaN, "2025-01"), 12);
});

test("career details group under valid parents and keep independent and unresolved details separate", () => {
  const works = [work("work-a", "샘플테크"), work("work-b", "다른회사")];
  const grouped = groupCareerDetails(works, [
    detail("linked", { relatedWorkItemId: "work-a", relatedWorkTitle: "샘플테크" }),
    detail("independent"),
    detail("stale", { relatedWorkItemId: "missing", relatedWorkTitle: "예전회사" }),
    detail("fallback", { relatedWorkTitle: "샘플테크" }),
  ]);
  assert.deepEqual(grouped.employmentGroups.map((group) => [group.work.id, group.details.map((item) => item.id)]), [["work-a", ["linked"]], ["work-b", []]]);
  assert.deepEqual(grouped.independentDetails.map((item) => item.id), ["independent"]);
  assert.deepEqual(grouped.unresolvedDetails.map((item) => item.id), ["stale", "fallback"]);
});

test("manual career detail order places each display group at its first item position", () => {
  const grouped = groupCareerDetails(
    [work("work-a", "샘플테크"), work("work-b", "다른회사")],
    [
      detail("independent-first"),
      detail("linked-b", { relatedWorkItemId: "work-b" }),
      detail("independent-second"),
      detail("linked-a", { relatedWorkItemId: "work-a" }),
      detail("stale", { relatedWorkItemId: "missing", relatedWorkTitle: "예전회사" }),
    ],
  );
  const displayed = orderCareerDetailDisplayGroups([
    { orderKey: "work:work-a", title: "work-a" },
    { orderKey: "work:work-b", title: "work-b" },
    { orderKey: "independent", title: "independent" },
    { orderKey: "unresolved", title: "unresolved" },
  ], grouped.detailGroupOrder);

  assert.deepEqual(grouped.detailGroupOrder, ["independent", "work:work-b", "work:work-a", "unresolved"]);
  assert.deepEqual(displayed.map((group) => group.title), ["independent", "work-b", "work-a", "unresolved"]);
  assert.deepEqual(grouped.independentDetails.map((item) => item.id), ["independent-first", "independent-second"]);
});

test("fallback matching resolves only one exact normalized employer title", () => {
  const unique = groupCareerDetails([work("a", " Sample  Tech ")], [detail("d", { relatedWorkTitle: "sample tech" })], { matchFallbackTitles: true });
  assert.deepEqual(unique.employmentGroups[0].details.map((item) => item.id), ["d"]);
  const ambiguous = groupCareerDetails([work("a", "Sample Tech"), work("b", "sample   tech")], [detail("d", { relatedWorkTitle: "Sample Tech" })], { matchFallbackTitles: true });
  assert.deepEqual(ambiguous.unresolvedDetails.map((item) => item.id), ["d"]);
});

test("career presentation sorting is stable and keeps duration metadata out of detail grouping", () => {
  const grouped = groupCareerDetails(
    [work("old", "Old", "개발자", "2020-01"), work("new", "New", "개발자", "2024-01")],
    [detail("d-old", { startMonth: "2021-01" }), detail("d-new", { startMonth: "2025-01" })],
    { workSortDirection: "latest-first", detailSortDirection: "latest-first" },
  );
  assert.deepEqual(grouped.employmentGroups.map((group) => group.work.id), ["new", "old"]);
  assert.deepEqual(grouped.independentDetails.map((item) => item.id), ["d-new", "d-old"]);
});
