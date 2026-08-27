import assert from "node:assert/strict";
import test from "node:test";

import { extractText, getDocumentProxy } from "unpdf";

import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  RESUME_PAGE_MARGIN_BOTTOM_MM,
  RESUME_PAGE_MARGIN_LEFT_MM,
  RESUME_PAGE_MARGIN_RIGHT_MM,
  RESUME_PAGE_MARGIN_TOP_MM,
} from "@/domain/resume-documents/pdfLayout";
import { generateResumePdf } from "./resumePdfService";
import { RESUME_PDF_ABSENT_SENTINELS, RESUME_PDF_VISIBLE_SENTINELS, resumePdfFixture } from "@/tests/fixtures/resumePdfFixture";

const points = (millimeters: number) => millimeters * 72 / 25.4;

test("service renders the deterministic Korean snapshot as a parseable multi-page A4 PDF", { timeout: 30_000 }, async () => {
  const generated = await generateResumePdf(resumePdfFixture);
  assert.equal(generated.bytes.subarray(0, 5).toString("ascii"), "%PDF-");

  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    assert.equal(generated.pageCount, pdf.numPages);
    assert.ok(pdf.numPages > 1);
    const extracted = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text;

    for (const expected of [
      "홍길동",
      "시니어 제품 엔지니어",
      "서술 제목 1",
      "서술 제목 6",
      "굵은 핵심 문장",
      "독립 프로젝트",
      "연결 확인 필요",
      "총 경력 5년 6개월",
      "2024.01 — 현재",
      "입력된 정보가 없습니다.",
      "병역 군필",
      "다중-항목-01",
      "다중-항목-18",
      ...RESUME_PDF_VISIBLE_SENTINELS,
    ]) assert.ok(text.includes(expected), `missing extracted text: ${expected}`);
    for (const absent of RESUME_PDF_ABSENT_SENTINELS) assert.ok(!text.includes(absent), `unexpected extracted text: ${absent}`);
    for (const sentinel of RESUME_PDF_VISIBLE_SENTINELS) assert.equal(text.split(sentinel).length - 1, 1, `${sentinel} must occur once`);
    assert.ok(text.indexOf("항목-최신-유일") < text.indexOf("항목-과거-유일"));
    assert.ok(text.indexOf("연결-프로젝트-유일") < text.indexOf("독립-프로젝트-유일"));
    assert.ok(text.indexOf("독립-프로젝트-유일") < text.indexOf("미해결-프로젝트-유일"));
    assert.match(generated.bytes.toString("latin1"), /\/Subtype\s*\/Image/u);

    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const [left, bottom, right, top] = page.view;
      assert.ok(Math.abs(right - left - points(A4_WIDTH_MM)) < 1);
      assert.ok(Math.abs(top - bottom - points(A4_HEIGHT_MM)) < 1);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => "str" in item ? item.str : "").join(""));
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const x = item.transform[4];
        const y = item.transform[5];
        assert.ok(x >= points(RESUME_PAGE_MARGIN_LEFT_MM) - 2, `text crossed left margin on page ${pageNumber}`);
        assert.ok(x + item.width <= right - points(RESUME_PAGE_MARGIN_RIGHT_MM) + 3, `text crossed right margin on page ${pageNumber}`);
        assert.ok(y >= points(RESUME_PAGE_MARGIN_BOTTOM_MM) - 4, `text crossed bottom margin on page ${pageNumber}`);
        assert.ok(y <= top - points(RESUME_PAGE_MARGIN_TOP_MM) + 4, `text crossed top margin on page ${pageNumber}`);
      }
    }
    assert.notEqual(
      pageTexts.findIndex((pageText) => pageText.includes("긴서술-01")),
      pageTexts.findIndex((pageText) => pageText.includes("긴서술-34")),
      "long narrative should span pages",
    );
    assert.notEqual(
      pageTexts.findIndex((pageText) => pageText.includes("다중-항목-01")),
      pageTexts.findIndex((pageText) => pageText.includes("다중-항목-18")),
      "multi-item section should span pages",
    );
    const firstGroupPage = pageTexts.find((pageText) => pageText.includes("경력 상세"));
    assert.ok(firstGroupPage?.includes("연결-프로젝트-유일"), "compact career group opening should stay with its first item");
    const tagsPage = pageTexts.find((pageText) => pageText.includes("핵심 역량"));
    assert.ok(tagsPage?.includes("문제 해결"), "compact tags section should stay with its opening content");
  } finally {
    await pdf.destroy();
  }
});

test("service renders blank and legacy item month strings without mutating the shared fixture", { timeout: 30_000 }, async () => {
  const originalFixture = structuredClone(resumePdfFixture);
  const legacySnapshot = structuredClone(resumePdfFixture);
  const experience = legacySnapshot.sections.find((section) => section.id === "experience");
  assert.ok(experience?.kind === "items");
  experience.content.items[0].startMonth = "";
  experience.content.items[0].endMonth = "종료 시점 미상";
  experience.content.items[0].endMonthEnabled = true;
  experience.content.items[1].startMonth = "입사 시점 미상";
  experience.content.items[1].endMonth = "";
  experience.content.items[1].endMonthEnabled = false;

  const generated = await generateResumePdf(legacySnapshot);
  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    const extracted = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(extracted.text) ? extracted.text.join("\n") : extracted.text;

    assert.ok(text.includes("종료 시점 미상"));
    assert.ok(text.includes("입사 시점 미상"));
    assert.deepEqual(resumePdfFixture, originalFixture);
  } finally {
    await pdf.destroy();
  }
});
