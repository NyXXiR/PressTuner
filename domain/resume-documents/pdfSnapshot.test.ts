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
  assert.equal(resumePdfRequestSchema.safeParse({ snapshot: { ...snapshot(), sections: [{ ...snapshot().sections[0], layout: "highlight-grid" }] } }).success, true);
  assert.equal(resumePdfRequestSchema.parse({ snapshot: { ...snapshot(), sections: [{ ...snapshot().sections[0], pageBreakBefore: true }] } }).snapshot.sections[0].pageBreakBefore, true);
});

test("PDF snapshot preserves blank and legacy item months while currentMonth remains canonical", () => {
  const value = snapshot();
  value.relatedWorkItems = [{
    id: "legacy-related-work",
    itemKind: "work",
    meta: "",
    startMonth: "2019년 봄",
    endMonth: "",
    title: "이전 회사",
    subtitle: "제품팀",
    body: "레거시 기간 문자열",
  }];
  value.sections.push({
    id: "experience",
    title: "경력",
    kind: "items",
    content: {
      items: [{
        id: "blank-and-legacy-months",
        itemKind: "work",
        meta: "",
        startMonth: "",
        endMonth: "종료 시점 미상",
        endMonthEnabled: true,
        title: "현재 회사",
        subtitle: "플랫폼팀",
        body: "빈 시작 월과 레거시 종료 월",
      }],
    },
  });

  const parsed = resumePdfRequestSchema.parse({ snapshot: value }).snapshot;
  const itemSection = parsed.sections.find((section) => section.kind === "items");

  assert.equal(parsed.relatedWorkItems[0]?.startMonth, "2019년 봄");
  assert.equal(parsed.relatedWorkItems[0]?.endMonth, "");
  assert.equal(itemSection?.content.items[0]?.startMonth, "");
  assert.equal(itemSection?.content.items[0]?.endMonth, "종료 시점 미상");
  assert.equal(resumePdfRequestSchema.safeParse({ snapshot: { ...value, currentMonth: "2026년 8월" } }).success, false);
});

test("safe PDF names preserve Korean while removing path, control, and duplicate suffix characters", () => {
  assert.equal(safeResumePdfFilename(" 홍길동: 플랫폼/이력서.PDF.pdf. "), "홍길동 플랫폼 이력서.pdf");
  assert.equal(safeResumePdfFilename("../\u0000.."), "resume.pdf");
  assert.equal(safeResumePdfFilename("resume"), "resume.pdf");
  assert.equal(safeResumePdfFilename(".pdf"), "resume.pdf");
  assert.ok(Array.from(safeResumePdfFilename("가".repeat(300))).length <= 119);
});
