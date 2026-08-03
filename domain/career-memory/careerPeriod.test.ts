import assert from "node:assert/strict";
import test from "node:test";
import { deriveCareerPeriod, normalizeCareerDates, parseLegacyCareerPeriod, validateCareerDates } from "./careerPeriod";

test("career period policy", async (t) => {
  await t.test("clears an end date when an experience is current", () => {
    assert.deepEqual(normalizeCareerDates({ startDate: new Date("2022-01-01T00:00:00.000Z"), endDate: new Date("2024-01-01T00:00:00.000Z"), isCurrent: true }), { startDate: new Date("2022-01-01T00:00:00.000Z"), endDate: null, isCurrent: true });
  });
  await t.test("derives display period from structured dates", () => {
    const startDate = new Date("2022-01-01T00:00:00.000Z");
    const endDate = new Date("2024-03-01T00:00:00.000Z");
    const tuples = [
      { dates: { startDate, endDate, isCurrent: false }, period: "2022.01 - 2024.03" },
      { dates: { startDate, endDate: null, isCurrent: true }, period: "2022.01 - Present" },
      { dates: { startDate, endDate: null, isCurrent: false }, period: "2022.01" },
      { dates: { startDate: null, endDate, isCurrent: false }, period: "Until 2024.03" },
      { dates: { startDate: null, endDate: null, isCurrent: true }, period: "Present" },
      { dates: { startDate: null, endDate: null, isCurrent: false }, period: null },
    ];

    for (const { dates, period } of tuples) {
      assert.equal(deriveCareerPeriod(dates), period);
    }
  });
  await t.test("rejects reversed structured dates", () => {
    assert.throws(() => validateCareerDates({ startDate: new Date("2025-01-01T00:00:00.000Z"), endDate: new Date("2024-01-01T00:00:00.000Z"), isCurrent: false }), /end date/i);
  });
  await t.test("rejects invalid structured Date objects", () => {
    assert.throws(() => validateCareerDates({ startDate: new Date(Number.NaN), endDate: null, isCurrent: false }), /invalid date/i);
    assert.throws(() => normalizeCareerDates({ startDate: null, endDate: new Date(Number.NaN), isCurrent: true }), /invalid date/i);
  });
  await t.test("parses legacy periods deterministically", () => {
    assert.deepEqual(parseLegacyCareerPeriod("Jan 2021 - Mar 2023"), { startDate: new Date("2021-01-01T00:00:00.000Z"), endDate: new Date("2023-03-01T00:00:00.000Z"), isCurrent: false });
    assert.deepEqual(parseLegacyCareerPeriod("2023 - Present"), { startDate: new Date("2023-01-01T00:00:00.000Z"), endDate: null, isCurrent: true });
    assert.deepEqual(parseLegacyCareerPeriod("2021-03 ~ 2022-11"), { startDate: new Date("2021-03-01T00:00:00.000Z"), endDate: new Date("2022-11-01T00:00:00.000Z"), isCurrent: false });
    assert.deepEqual(parseLegacyCareerPeriod("2024-07 ~ 현재"), { startDate: new Date("2024-07-01T00:00:00.000Z"), endDate: null, isCurrent: true });
    assert.deepEqual(parseLegacyCareerPeriod("2024-07 ~ Present"), { startDate: new Date("2024-07-01T00:00:00.000Z"), endDate: null, isCurrent: true });
    const canonical = "2021.02 - 2023.11";
    assert.deepEqual(parseLegacyCareerPeriod(canonical), { startDate: new Date("2021-02-01T00:00:00.000Z"), endDate: new Date("2023-11-01T00:00:00.000Z"), isCurrent: false });
    assert.equal(deriveCareerPeriod(parseLegacyCareerPeriod(canonical)), canonical);
  });
  await t.test("round trips every non-null canonical period", () => {
    const canonicalDates = [
      { startDate: new Date("2021-02-01T00:00:00.000Z"), endDate: new Date("2023-11-01T00:00:00.000Z"), isCurrent: false },
      { startDate: new Date("2021-02-01T00:00:00.000Z"), endDate: null, isCurrent: true },
      { startDate: new Date("2021-02-01T00:00:00.000Z"), endDate: null, isCurrent: false },
      { startDate: null, endDate: new Date("2023-11-01T00:00:00.000Z"), isCurrent: false },
      { startDate: null, endDate: null, isCurrent: true },
    ];

    for (const dates of canonicalDates) {
      const period = deriveCareerPeriod(dates);
      assert.ok(period);
      assert.deepEqual(parseLegacyCareerPeriod(period), dates);
    }
  });
  await t.test("requires one forward range and rejects extra separators", () => {
    assert.throws(() => parseLegacyCareerPeriod("Present - 2024"), /invalid legacy career period/i);
    assert.throws(() => parseLegacyCareerPeriod("2021 - 2022 - 2023"), /invalid legacy career period/i);
    assert.throws(() => parseLegacyCareerPeriod("2021"), /invalid legacy career period/i);
    assert.throws(() => parseLegacyCareerPeriod("Until 2021.02 - Present"), /invalid legacy career period/i);
    assert.throws(() => parseLegacyCareerPeriod("Until 2021"), /invalid legacy career period/i);
    assert.throws(() => parseLegacyCareerPeriod("2021.13"), /invalid legacy career period/i);
    assert.throws(() => parseLegacyCareerPeriod("2023.11 - 2021.02"), /end date/i);
  });
  await t.test("rejects ambiguous ISO-like legacy ranges", () => {
    assert.throws(() => parseLegacyCareerPeriod("2023-01-01 - 2024-01-01"), /invalid legacy career period/i);
  });
});
