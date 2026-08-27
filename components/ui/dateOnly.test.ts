import assert from "node:assert/strict";
import test from "node:test";

import {
  addLocalCalendarDays,
  formatDateOnly,
  isDateOnlyWithinBounds,
  parseDateOnly,
  resolveInitialCalendarMonth,
  resolveNavigationMonths,
} from "./dateOnly";

test("strictly parses canonical date-only values in local time", () => {
  const parsed = parseDateOnly("1992-06-05");

  assert.ok(parsed);
  assert.equal(parsed.getFullYear(), 1992);
  assert.equal(parsed.getMonth(), 5);
  assert.equal(parsed.getDate(), 5);
  assert.equal(formatDateOnly(parsed), "1992-06-05");
});

test("accepts leap days and rejects rollovers, malformed values, and noncanonical values", () => {
  assert.equal(formatDateOnly(parseDateOnly("2024-02-29")!), "2024-02-29");

  for (const value of [
    "2023-02-29",
    "1992-02-30",
    "1992-13-01",
    "1992-00-01",
    "1992-01-00",
    "1992-6-05",
    "92-06-05",
    "1992/06/05",
    "1992-06-05T00:00:00Z",
    "",
  ]) {
    assert.equal(parseDateOnly(value), null, value);
  }
});

test("formats using local calendar fields without UTC conversion", () => {
  const localLateEvening = new Date(2024, 11, 31, 23, 30);

  assert.equal(formatDateOnly(localLateEvening), "2024-12-31");
});

test("checks inclusive validated selection bounds", () => {
  assert.equal(
    isDateOnlyWithinBounds("1900-01-01", "1900-01-01", "2026-08-27"),
    true,
  );
  assert.equal(
    isDateOnlyWithinBounds("2026-08-27", "1900-01-01", "2026-08-27"),
    true,
  );
  assert.equal(
    isDateOnlyWithinBounds("1899-12-31", "1900-01-01", "2026-08-27"),
    false,
  );
  assert.equal(
    isDateOnlyWithinBounds("2026-08-28", "1900-01-01", "2026-08-27"),
    false,
  );
  assert.equal(isDateOnlyWithinBounds("1992-02-30", "1900-01-01"), false);
});

test("ignores invalid optional selection bounds safely", () => {
  assert.equal(isDateOnlyWithinBounds("1992-06-05", "not-a-date", "also-bad"), true);
  assert.equal(isDateOnlyWithinBounds("1992-06-05", "2020-01-01", "1900-01-01"), true);
});

test("adds local calendar days across month and year boundaries", () => {
  assert.equal(
    formatDateOnly(addLocalCalendarDays(parseDateOnly("2024-01-31")!, 1)),
    "2024-02-01",
  );
  assert.equal(
    formatDateOnly(addLocalCalendarDays(parseDateOnly("2024-12-31")!, 1)),
    "2025-01-01",
  );
});

test("resolves default and explicit calendar navigation months", () => {
  const today = parseDateOnly("2026-08-27")!;
  const defaults = resolveNavigationMonths({ today });

  assert.equal(formatDateOnly(defaults.startMonth), "1926-01-01");
  assert.equal(formatDateOnly(defaults.endMonth), "2036-12-01");

  const explicit = resolveNavigationMonths({
    today,
    startMonth: "1900-06-15",
    endMonth: "2026-08-27",
  });
  assert.equal(formatDateOnly(explicit.startMonth), "1900-06-01");
  assert.equal(formatDateOnly(explicit.endMonth), "2026-08-01");

  const invalid = resolveNavigationMonths({
    today,
    startMonth: "2030-01-01",
    endMonth: "1900-01-01",
  });
  assert.equal(formatDateOnly(invalid.startMonth), "1926-01-01");
  assert.equal(formatDateOnly(invalid.endMonth), "2036-12-01");
});

test("resolves the initial month by precedence and clamps to navigation bounds", () => {
  const today = parseDateOnly("2026-08-27")!;
  const options = {
    today,
    startMonth: "1900-01-01",
    endMonth: "2026-08-27",
  };

  assert.equal(
    formatDateOnly(
      resolveInitialCalendarMonth({
        ...options,
        value: "1992-06-05",
        defaultMonth: "2001-03-20",
      }),
    ),
    "1992-06-01",
  );
  assert.equal(
    formatDateOnly(
      resolveInitialCalendarMonth({
        ...options,
        value: "invalid",
        defaultMonth: "2001-03-20",
      }),
    ),
    "2001-03-01",
  );
  assert.equal(
    formatDateOnly(
      resolveInitialCalendarMonth({
        ...options,
        value: "invalid",
        defaultMonth: "also-invalid",
      }),
    ),
    "2026-08-01",
  );
  assert.equal(
    formatDateOnly(
      resolveInitialCalendarMonth({
        ...options,
        value: "1899-12-31",
      }),
    ),
    "1900-01-01",
  );
  assert.equal(
    formatDateOnly(
      resolveInitialCalendarMonth({
        ...options,
        value: "2030-01-01",
      }),
    ),
    "2026-08-01",
  );
});
