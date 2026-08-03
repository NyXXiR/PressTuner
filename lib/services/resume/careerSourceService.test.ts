import assert from "node:assert/strict";
import test from "node:test";

import {
  CAREER_SOURCE_MAX_BYTES,
  validateCareerPdf,
} from "./careerSourceService";

test("career PDF validation checks extension, MIME, signature, and 20 MB limit", () => {
  const valid = {
    originalName: "resume.pdf",
    mimeType: "application/pdf",
    bytes: Buffer.from("%PDF-1.7\ncontent"),
  };
  assert.doesNotThrow(() => validateCareerPdf(valid));
  assert.throws(
    () => validateCareerPdf({ ...valid, originalName: "resume.txt" }),
    /Only PDF/,
  );
  assert.throws(
    () => validateCareerPdf({ ...valid, mimeType: "application/octet-stream" }),
    /application\/pdf/,
  );
  assert.throws(
    () => validateCareerPdf({ ...valid, bytes: Buffer.from("not a pdf") }),
    /signature/,
  );
  assert.throws(
    () =>
      validateCareerPdf({
        ...valid,
        bytes: new Uint8Array(CAREER_SOURCE_MAX_BYTES + 1),
      }),
    /20 MB/,
  );
});
