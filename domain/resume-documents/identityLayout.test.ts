import assert from "node:assert/strict";
import test from "node:test";

import { RESUME_PDF_CONTENT_WIDTH_MM } from "./pdfLayout";
import {
  identityContactItems,
  identityContactValueWidthMm,
  identityFactItems,
  RESUME_IDENTITY_LAYOUT,
  wrapIdentityContact,
} from "./identityLayout";

test("identity layout derives the same contact width from the shared A4 geometry", () => {
  assert.equal(
    identityContactValueWidthMm(true),
    RESUME_PDF_CONTENT_WIDTH_MM
      - RESUME_IDENTITY_LAYOUT.photoWidthMm
      - RESUME_IDENTITY_LAYOUT.columnGapMm
      - RESUME_IDENTITY_LAYOUT.contactLabelWidthMm
      - RESUME_IDENTITY_LAYOUT.contactColumnGapMm,
  );
  assert.equal(
    identityContactValueWidthMm(false),
    RESUME_PDF_CONTENT_WIDTH_MM
      - RESUME_IDENTITY_LAYOUT.contactLabelWidthMm
      - RESUME_IDENTITY_LAYOUT.contactColumnGapMm,
  );
});

test("identity contacts use deterministic breaks in both preview renderers", () => {
  const longContact = `https://example.com/${"long-path-".repeat(24)}`;
  const withPhoto = wrapIdentityContact(longContact, true);
  const withoutPhoto = wrapIdentityContact(longContact, false);

  assert.ok(withPhoto.includes("\n"));
  assert.ok(withPhoto.split("\n").length > withoutPhoto.split("\n").length);
  assert.equal(withPhoto.replace(/\n/gu, ""), longContact);
  assert.equal(withoutPhoto.replace(/\n/gu, ""), longContact);
});

test("identity preview and PDF can share one ordered content projection", () => {
  const content = {
    name: "홍길동",
    email: "hong@example.com",
    phone: "010-1234-5678",
    location: "서울",
    links: ["https://example.com"],
    birthDate: "1990-01-02",
    gender: "비공개",
  };

  assert.deepEqual(identityContactItems(content), [
    { label: "EMAIL", value: "hong@example.com" },
    { label: "PHONE", value: "010-1234-5678" },
    { label: "LOCATION", value: "서울" },
    { label: "LINK", value: "https://example.com" },
  ]);
  assert.deepEqual(identityFactItems(content), ["생년월일 1990-01-02", "성별 비공개"]);
});
