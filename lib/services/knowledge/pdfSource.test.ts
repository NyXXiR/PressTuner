import assert from "node:assert/strict";
import test from "node:test";

import { buildPdfContentDisposition } from "./pdfSource";

test("PDF content disposition strips controls and RFC 5987 encodes UTF-8", () => {
  const header = buildPdfContentDisposition("보고서\r\n'최종'.pdf");
  assert.doesNotMatch(header, /[\r\n]/);
  assert.match(header, /^inline; filename=/);
  assert.match(header, /filename\*=UTF-8''/);
  assert.match(header, /%27/);
  assert.match(header, /%EB%B3%B4%EA%B3%A0%EC%84%9C/);
});
