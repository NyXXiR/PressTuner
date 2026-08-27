import assert from "node:assert/strict";
import test from "node:test";

import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  RESUME_PAGE_MARGIN_BOTTOM_MM,
  RESUME_PAGE_MARGIN_TOP_MM,
  estimateResumePrintPageCount,
} from "./printLayout";

test("resume page estimation uses the printable height between repeated page margins", () => {
  assert.equal(A4_WIDTH_MM, 210);
  assert.equal(A4_HEIGHT_MM, 297);
  assert.equal(RESUME_PAGE_MARGIN_TOP_MM, 16);
  assert.equal(RESUME_PAGE_MARGIN_BOTTOM_MM, 16);

  const pxPerMm = 4;
  const paperWidth = A4_WIDTH_MM * pxPerMm;
  const printableHeight = (
    A4_HEIGHT_MM - RESUME_PAGE_MARGIN_TOP_MM - RESUME_PAGE_MARGIN_BOTTOM_MM
  ) * pxPerMm;

  assert.equal(estimateResumePrintPageCount(printableHeight, paperWidth), 1);
  assert.equal(estimateResumePrintPageCount(printableHeight + 1, paperWidth), 2);
  assert.equal(estimateResumePrintPageCount(printableHeight * 2, paperWidth), 2);
  assert.equal(estimateResumePrintPageCount(printableHeight * 2 + 1, paperWidth), 3);
});

test("resume page estimation stays safe for incomplete browser measurements", () => {
  assert.equal(estimateResumePrintPageCount(0, 0), 1);
  assert.equal(estimateResumePrintPageCount(-1, 210), 1);
  assert.equal(estimateResumePrintPageCount(Number.NaN, 210), 1);
});
