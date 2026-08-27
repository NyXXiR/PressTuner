import assert from "node:assert/strict";
import test from "node:test";

import {
  resumePdfRequestSchema,
  safeResumePdfFilename,
  type ResumePdfSnapshot,
} from "./pdfSnapshot";

const snapshot = (): ResumePdfSnapshot => ({
  company: "브리프플로우",
  documentName: "홍길동 이력서",
  role: "제품 엔지니어",
  currentMonth: "2026-08",
  relatedWorkItems: [],
  sections: [{
    id: "profile",
    title: "인적사항",
    kind: "identity",
    layout: "standard",
    content: {
      name: "홍길동",
      email: "hong@example.com",
      links: [],
      photo: "data:image/jpeg;base64,/9j/2Q==",
    },
  }],
});

test("PDF snapshot accepts only bounded serializable resume fields", () => {
  assert.equal(resumePdfRequestSchema.parse({ snapshot: snapshot() }).snapshot.sections.length, 1);
  assert.equal(resumePdfRequestSchema.safeParse({ snapshot: { ...snapshot(), unexpected: true } }).success, false);
  assert.equal(resumePdfRequestSchema.safeParse({
    snapshot: {
      ...snapshot(),
      sections: [{
        ...snapshot().sections[0],
        content: { name: "홍길동", email: "hong@example.com", links: [], photo: "https://example.com/photo.jpg" },
      }],
    },
  }).success, false);
  assert.equal(resumePdfRequestSchema.safeParse({ snapshot: { ...snapshot(), currentMonth: "2026-13" } }).success, false);
});

test("safe PDF names preserve Korean while removing path, control, and duplicate suffix characters", () => {
  assert.equal(safeResumePdfFilename(" 홍길동: 플랫폼/이력서.PDF.pdf. "), "홍길동 플랫폼 이력서.pdf");
  assert.equal(safeResumePdfFilename("../\u0000.."), "resume.pdf");
  assert.equal(safeResumePdfFilename("resume"), "resume.pdf");
  assert.equal(safeResumePdfFilename(".pdf"), "resume.pdf");
  assert.ok(Array.from(safeResumePdfFilename("가".repeat(300))).length <= 119);
});
