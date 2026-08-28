import assert from "node:assert/strict";
import test from "node:test";

import { RESUME_DOCUMENT_LAYOUT, RESUME_NARRATIVE_FONT_SIZES_PT } from "./documentLayout";

test("shared resume document geometry uses PDF-ready units", () => {
  assert.equal(RESUME_DOCUMENT_LAYOUT.sectionGapMm, 7);
  assert.equal(RESUME_DOCUMENT_LAYOUT.sectionHeadingBottomGapMm, 4);
  assert.equal(RESUME_DOCUMENT_LAYOUT.sectionTitleFontSizePt, 13);
  assert.equal(RESUME_DOCUMENT_LAYOUT.itemTitleFontSizePt, 10.5);
  assert.equal(RESUME_DOCUMENT_LAYOUT.itemBodyFontSizePt, 9);
  assert.equal(RESUME_DOCUMENT_LAYOUT.highlightColumns, 2);
  assert.equal(RESUME_NARRATIVE_FONT_SIZES_PT.p, 9.5);
  assert.equal(RESUME_NARRATIVE_FONT_SIZES_PT.h1, 18);
});
