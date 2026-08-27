import assert from "node:assert/strict";
import test from "node:test";

import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  RESUME_PAGE_MARGIN_BOTTOM_MM,
  RESUME_PAGE_MARGIN_LEFT_MM,
  RESUME_PAGE_MARGIN_RIGHT_MM,
  RESUME_PAGE_MARGIN_TOP_MM,
  RESUME_PRINTABLE_HEIGHT_MM,
  RESUME_PRINTABLE_WIDTH_MM,
} from "./printLayout";

test("resume print geometry uses A4 with balanced interviewer-readable margins", () => {
  assert.equal(A4_WIDTH_MM, 210);
  assert.equal(A4_HEIGHT_MM, 297);
  assert.equal(RESUME_PAGE_MARGIN_TOP_MM, 16);
  assert.equal(RESUME_PAGE_MARGIN_BOTTOM_MM, 16);
  assert.equal(RESUME_PAGE_MARGIN_LEFT_MM, 18);
  assert.equal(RESUME_PAGE_MARGIN_RIGHT_MM, 18);
});

test("resume printable content dimensions are derived from page geometry", () => {
  assert.equal(
    RESUME_PRINTABLE_WIDTH_MM,
    A4_WIDTH_MM - RESUME_PAGE_MARGIN_LEFT_MM - RESUME_PAGE_MARGIN_RIGHT_MM,
  );
  assert.equal(
    RESUME_PRINTABLE_HEIGHT_MM,
    A4_HEIGHT_MM - RESUME_PAGE_MARGIN_TOP_MM - RESUME_PAGE_MARGIN_BOTTOM_MM,
  );
  assert.equal(RESUME_PRINTABLE_WIDTH_MM, 174);
  assert.equal(RESUME_PRINTABLE_HEIGHT_MM, 265);
});
