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

test("long career items move their opening together and still split when they exceed a page", { timeout: 30_000 }, async () => {
  const snapshot = structuredClone(resumePdfFixture);
  const filler = Array.from({ length: 32 }, (_, index) =>
    `채움-${String(index + 1).padStart(2, "0")} 페이지 배치를 확인하기 위한 충분히 긴 문장입니다. 내용의 높이를 안정적으로 확보합니다.`,
  ).join("\n");
  const longCareerDetail = Array.from({ length: 50 }, (_, index) =>
    `상세-${String(index + 1).padStart(2, "0")} 문제를 분석하고 해결한 결과를 동료가 확인할 수 있도록 기록했습니다.`,
  ).join("\n");
  snapshot.sections = [
    { id: "intro", title: "앞선 내용", kind: "narrative", layout: "standard", content: { body: filler } },
    {
      id: "experience",
      title: "경력 상세",
      kind: "items",
      layout: "standard",
      content: {
        items: [{
          id: "long-career-item",
          itemKind: "activity",
          meta: "2024",
          title: "긴 경력 항목 사용자 경험과 운영 안정성을 함께 개선한 전사 플랫폼 전환 프로젝트의 기술 리딩과 실행",
          subtitle: "플랫폼 개선 · 여러 제품 조직과 공통 인프라 담당자가 함께 참여한 장기 협업 과제",
          body: longCareerDetail,
        }],
      },
    },
  ];

  const generated = await generateResumePdf(snapshot);
  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => "str" in item ? item.str : "").join(""));
    }

    const openingPage = pageTexts.findIndex((text) => text.includes("긴 경력 항목"));
    const endingPage = pageTexts.findIndex((text) => text.includes("상세-50"));
    assert.ok(openingPage > 0, "career item opening should move away from an undersized remainder");
    for (const marker of ["상세-01", "상세-02", "상세-03", "상세-04"]) {
      assert.ok(pageTexts[openingPage]?.includes(marker), `career item opening should keep ${marker} with its heading`);
    }
    assert.ok(endingPage > openingPage, "an oversized career item should continue naturally on a later page");
  } finally {
    await pdf.destroy();
  }
});

test("career detail sections use ample remaining space and may continue across later pages", { timeout: 30_000 }, async () => {
  const snapshot = structuredClone(resumePdfFixture);
  const longCareerDetail = Array.from({ length: 70 }, (_, index) =>
    `새섹션-상세-${String(index + 1).padStart(2, "0")} 성과와 판단 근거를 다음 검토자가 이해할 수 있도록 구체적으로 기록했습니다.`,
  ).join("\n");
  snapshot.relatedWorkItems = [];
  snapshot.sections = [
    {
      id: "summary",
      title: "간단한 소개",
      kind: "narrative",
      layout: "standard",
      content: { body: "앞 페이지에 남는 짧은 소개입니다." },
    },
    {
      id: "projects",
      title: "경력 상세",
      kind: "items",
      layout: "compact",
      content: {
        items: [{
          id: "independent-long-detail",
          itemKind: "career-detail",
          detailType: "project",
          meta: "2024",
          title: "새 페이지에서 시작하는 장기 프로젝트",
          subtitle: "플랫폼 전환",
          body: longCareerDetail,
        }],
      },
    },
  ];

  const generated = await generateResumePdf(snapshot);
  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => "str" in item ? item.str : "").join(""));
    }

    const sectionPage = pageTexts.findIndex((text) => text.includes("경력 상세"));
    const endingPage = pageTexts.findIndex((text) => text.includes("새섹션-상세-70"));
    assert.equal(sectionPage, 0, "career detail should use ample space left on the current page");
    assert.ok(pageTexts[0]?.includes("새 페이지에서 시작하는 장기 프로젝트"));
    assert.ok(endingPage > sectionPage, "a long career detail section should continue after its opening page");
  } finally {
    await pdf.destroy();
  }
});

test("career detail openings move when the current page remainder is too small", { timeout: 30_000 }, async () => {
  const snapshot = structuredClone(resumePdfFixture);
  const filler = Array.from({ length: 32 }, (_, index) =>
    `공간채움-${String(index + 1).padStart(2, "0")} 앞선 내용을 충분히 설명하여 현재 페이지 아래쪽의 남은 공간을 작게 만듭니다.`,
  ).join("\n");
  const careerDetail = Array.from({ length: 18 }, (_, index) =>
    `조건부시작-${String(index + 1).padStart(2, "0")} 문제와 해결 과정, 측정 가능한 결과를 구체적으로 기록했습니다.`,
  ).join("\n");
  snapshot.relatedWorkItems = [];
  snapshot.sections = [
    { id: "summary", title: "앞선 긴 내용", kind: "narrative", layout: "standard", content: { body: filler } },
    {
      id: "projects",
      title: "경력 상세",
      kind: "items",
      layout: "compact",
      content: {
        items: [{
          id: "conditional-detail",
          itemKind: "career-detail",
          detailType: "improvement",
          meta: "2025",
          title: "남은 공간에 따라 이동하는 프로젝트",
          subtitle: "서비스 안정화",
          body: careerDetail,
        }],
      },
    },
  ];

  const generated = await generateResumePdf(snapshot);
  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pageTexts.push(content.items.map((item) => "str" in item ? item.str : "").join(""));
    }

    const sectionPage = pageTexts.findIndex((text) => text.includes("경력 상세"));
    assert.ok(sectionPage > 0, "career detail should move when its meaningful opening does not fit");
    assert.ok(pageTexts[sectionPage]?.includes("조건부시작-01"));
    assert.ok(pageTexts[sectionPage]?.includes("조건부시작-04"));
  } finally {
    await pdf.destroy();
  }
});
