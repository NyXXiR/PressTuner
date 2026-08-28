import assert from "node:assert/strict";
import test from "node:test";

import {
  findResumeItemDateIssue,
  normalizeResumeItemDates,
  resolveResumeItemDatePolicy,
} from "./itemDatePolicy";

test("date policy follows item meaning instead of editor section", () => {
  assert.deepEqual(resolveResumeItemDatePolicy({ itemKind: "work" }), {
    dateMode: "range",
    startMeaning: "started",
    endBehavior: "always",
    ongoingMeaning: "employed",
  });
  assert.deepEqual(resolveResumeItemDatePolicy({ itemKind: "credential" }), {
    dateMode: "single",
    startMeaning: "acquired",
    endBehavior: "optional",
    endMeaning: "expires",
  });
  assert.deepEqual(resolveResumeItemDatePolicy({ itemKind: "award" }), {
    dateMode: "single",
    startMeaning: "awarded",
    endBehavior: "hidden",
  });
  assert.equal(resolveResumeItemDatePolicy({}, "education").ongoingMeaning, "enrolled");
});

test("date normalization removes values that are not meaningful for the item kind", () => {
  const award = normalizeResumeItemDates({
    id: "award-1",
    itemKind: "award",
    meta: "",
    startMonth: "2024-01",
    endMonth: "2025-01",
    endMonthEnabled: true,
    isCurrent: true,
    title: "Award",
    subtitle: "",
    body: "",
  });
  assert.equal(award.endMonth, "");
  assert.equal(award.endMonthEnabled, false);
  assert.equal(award.isCurrent, false);

  const currentWork = normalizeResumeItemDates({
    ...award,
    itemKind: "work",
    isCurrent: true,
    endMonth: "2025-01",
    endMonthEnabled: true,
  });
  assert.equal(currentWork.endMonth, "");
  assert.equal(currentWork.endMonthEnabled, false);
  assert.equal(currentWork.isCurrent, true);

  const legacyCredential = normalizeResumeItemDates({
    ...award,
    itemKind: "credential",
    endMonth: "2027-01",
    endMonthEnabled: undefined,
  });
  assert.equal(legacyCredential.endMonth, "2027-01");
  assert.equal(legacyCredential.endMonthEnabled, true);
});

test("date validation reports the first active reversed range", () => {
  assert.deepEqual(findResumeItemDateIssue({
    itemKind: "work",
    startMonth: "2025-03",
    endMonth: "2024-12",
    endMonthEnabled: true,
  }), { field: "endMonth", message: "종료 연월은 시작 연월보다 빠를 수 없습니다." });

  assert.equal(findResumeItemDateIssue({
    itemKind: "award",
    startMonth: "2025-03",
    endMonth: "2024-12",
    endMonthEnabled: true,
  }), null);
});
