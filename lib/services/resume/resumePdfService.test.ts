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
    const compactText = text.replace(/\s/gu, "");
    for (const label of ["EMAIL", "PHONE", "LOCATION", "LINK"]) assert.ok(compactText.includes(label), `missing identity label: ${label}`);
    assert.ok(!text.includes(resumePdfFixture.documentName), "the filename must not be repeated inside the resume header");
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

test("identity facts rule keeps a safe vertical gap below the name", { timeout: 30_000 }, async () => {
  const snapshot = structuredClone(resumePdfFixture);
  snapshot.sections = snapshot.sections.filter((section) => section.id === "profile");
  const profile = snapshot.sections[0];
  assert.equal(profile?.kind, "identity");
  if (profile?.kind === "identity") {
    delete profile.content.photo;
    delete profile.content.photoName;
  }

  const generated = await generateResumePdf(snapshot);
  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const textItems = content.items.filter((item) => "str" in item);
    const name = textItems.find((item) => item.str === "홍길동");
    const birthDate = textItems.find((item) => item.str.startsWith("생년월일 1990-01-02"));

    assert.ok(name && birthDate);
    const gapAboveFactsText = name.transform[5] - (birthDate.transform[5] + birthDate.height);
    assert.ok(
      gapAboveFactsText >= points(4),
      `identity facts rule needs safe space below the name; received ${gapAboveFactsText.toFixed(2)}pt`,
    );
  } finally {
    await pdf.destroy();
  }
});

test("long identity contacts wrap before the profile photo and page margin", { timeout: 30_000 }, async () => {
  const snapshot = structuredClone(resumePdfFixture);
  snapshot.sections = snapshot.sections.filter((section) => section.id === "profile");
  const profile = snapshot.sections[0];
  assert.equal(profile?.kind, "identity");
  if (profile?.kind !== "identity") return;
  profile.content.email = `very-long-address-${"x".repeat(80)}@example.com`;
  profile.content.links = [`https://portfolio.example.com/${"long-path-".repeat(18)}`];

  const generated = await generateResumePdf(snapshot);
  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const textItems = content.items.filter((item) => "str" in item);
    const name = textItems.find((item) => item.str === "홍길동");
    const facts = textItems.find((item) => item.str.startsWith("생년월일 1990-01-02"));
    const firstContact = textItems.find((item) => item.str.includes("very-long-address"));
    assert.ok(name && facts);
    assert.ok(firstContact);
    const nameToContactGap = name.transform[5] - (firstContact.transform[5] + firstContact.height);
    assert.ok(
      nameToContactGap >= points(3),
      `identity contacts need safe space below the rendered name; received ${nameToContactGap.toFixed(2)}pt`,
    );
    const contacts = textItems.filter((item) => item.transform[5] < name.transform[5] && item.transform[5] > facts.transform[5]);
    assert.ok(contacts.some((item) => item.str.includes("very-long-address")));
    assert.ok(contacts.some((item) => item.str.includes("portfolio.example.com")));
    const photoLeft = points(A4_WIDTH_MM - RESUME_PAGE_MARGIN_RIGHT_MM - 25 - 7);
    for (const item of contacts) {
      assert.ok(item.transform[4] + item.width <= photoLeft + 2, `identity contact crossed into the photo column: ${item.str}`);
    }
  } finally {
    await pdf.destroy();
  }
});

test("highlight sections render two bordered cards on the same PDF row", { timeout: 30_000 }, async () => {
  const snapshot = structuredClone(resumePdfFixture);
  snapshot.sections = [{
    id: "strengths",
    title: "핵심 역량",
    kind: "items",
    layout: "highlight-grid",
    content: { items: [
      { id: "strength-a", meta: "", title: "문제 구조화", subtitle: "실행 단위로 전환", body: "모호한 요구사항을 측정 가능한 단계로 나눕니다." },
      { id: "strength-b", meta: "", title: "운영 개선", subtitle: "결과까지 확인", body: "배포 뒤 지표를 확인하고 다음 개선으로 연결합니다." },
    ] },
  }];

  const generated = await generateResumePdf(snapshot);
  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    const page = await pdf.getPage(1);
    const content = await page.getTextContent();
    const textItems = content.items.filter((item) => "str" in item);
    const first = textItems.find((item) => item.str === "문제 구조화");
    const second = textItems.find((item) => item.str === "운영 개선");
    assert.ok(first && second);
    assert.ok(Math.abs(first.transform[5] - second.transform[5]) < 1, "the first two cards should share a row");
    assert.ok(second.transform[4] - first.transform[4] > points(50), "the second card should occupy the right column");
  } finally {
    await pdf.destroy();
  }
});

test("tag category headings move with their first keyword row", { timeout: 30_000 }, async () => {
  const snapshot = structuredClone(resumePdfFixture);
  snapshot.sections = [{
    id: "skills",
    title: "핵심 역량",
    kind: "tags",
    layout: "standard",
    content: {
      items: [],
      groups: [
        {
          id: "frontend",
          title: "Frontend",
          items: Array.from({ length: 101 }, (_, index) => `프론트기술-${String(index + 1).padStart(3, "0")}`),
        },
        { id: "infra", title: "Infra", items: ["Docker", "Ubuntu", "Kubernetes", "AWS"] },
      ],
    },
  }];

  const generated = await generateResumePdf(snapshot);
  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent();
      pageTexts.push(content.items.map((item) => "str" in item ? item.str : "").join(""));
    }

    const precedingTagPage = pageTexts.findIndex((text) => text.includes("프론트기술-101"));
    const infraPage = pageTexts.findIndex((text) => text.includes("Infra"));
    assert.ok(precedingTagPage >= 0 && infraPage > precedingTagPage, "the fixture must place Infra at a page boundary");
    for (const keyword of ["Docker", "Ubuntu", "Kubernetes", "AWS"]) {
      assert.ok(pageTexts[infraPage]?.includes(keyword), `${keyword} must stay with the Infra category opening`);
    }
  } finally {
    await pdf.destroy();
  }
});

test("PDF fills each line and preserves a long narrative without whitespace or inserted hyphens", { timeout: 30_000 }, async () => {
  const snapshot = structuredClone(resumePdfFixture);
  const uninterruptedText = "가나다라마바사아자차카타파하".repeat(80);
  snapshot.company = "Company";
  snapshot.documentName = "Document";
  snapshot.role = "Role";
  snapshot.sections = [{
    id: "cover-letter",
    title: "Introduction",
    kind: "narrative",
    layout: "standard",
    content: { body: uninterruptedText },
  }];

  const generated = await generateResumePdf(snapshot);
  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    const renderedRuns: string[] = [];
    const renderedLines = new Map<string, number>();
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!("str" in item) || !/[가-하-]/u.test(item.str)) continue;
        assert.ok(
          item.transform[4] + item.width <= points(A4_WIDTH_MM - RESUME_PAGE_MARGIN_RIGHT_MM) + 3,
          `uninterrupted narrative crossed the right margin on page ${pageNumber}`,
        );
        renderedRuns.push(item.str);
        const lineKey = `${pageNumber}:${item.transform[5].toFixed(2)}`;
        renderedLines.set(lineKey, Math.max(
          renderedLines.get(lineKey) ?? 0,
          item.transform[4] + item.width,
        ));
      }
    }

    assert.ok(renderedRuns.length > 1, "uninterrupted narrative should wrap onto multiple lines");
    assert.equal(renderedRuns.join("").replace(/\s/gu, ""), uninterruptedText);
    const lineEnds = [...renderedLines.values()];
    for (const rightEdge of lineEnds.slice(0, -1)) {
      const unusedWidth = points(A4_WIDTH_MM - RESUME_PAGE_MARGIN_RIGHT_MM) - rightEdge;
      assert.ok(unusedWidth <= points(4), `wrapped line left ${unusedWidth.toFixed(2)}pt unused`);
    }
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
    for (const marker of ["상세-01", "상세-02"]) {
      assert.ok(pageTexts[openingPage]?.includes(marker), `career item opening should keep ${marker} with its heading`);
    }
    assert.ok(endingPage > openingPage, "an oversized career item should continue naturally on a later page");
  } finally {
    await pdf.destroy();
  }
});

test("a long career detail uses meaningful remaining space before continuing on the next page", { timeout: 30_000 }, async () => {
  const snapshot = structuredClone(resumePdfFixture);
  const filler = Array.from({ length: 24 }, (_, index) =>
    `앞내용-${String(index + 1).padStart(2, "0")} 현재 페이지의 절반가량을 사용하되 다음 섹션의 시작 부분은 표시할 수 있습니다.`,
  ).join("\n");
  const longCareerDetail = Array.from({ length: 14 }, (_, index) =>
    `남은공간-${String(index + 1).padStart(2, "0")} 긴 프로젝트 설명이 현재 페이지부터 자연스럽게 이어지는지 확인합니다.`,
  ).join("\n");
  snapshot.relatedWorkItems = [];
  snapshot.sections = [
    { id: "summary", title: "앞선 소개", kind: "narrative", layout: "standard", content: { body: filler } },
    {
      id: "projects",
      title: "경력 상세",
      kind: "items",
      layout: "compact",
      content: { items: [{ id: "flowing-project", itemKind: "career-detail", meta: "2025", title: "남은 공간을 활용하는 프로젝트", subtitle: "플랫폼", body: longCareerDetail }] },
    },
  ];

  const generated = await generateResumePdf(snapshot);
  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent();
      pageTexts.push(content.items.map((item) => "str" in item ? item.str : "").join(""));
    }
    const openingPage = pageTexts.findIndex((text) => text.includes("남은 공간을 활용하는 프로젝트"));
    const endingPage = pageTexts.findIndex((text) => text.includes("남은공간-14"));
    assert.equal(openingPage, 0, "a long project should start in meaningful space left on the current page");
    assert.ok(pageTexts[0]?.includes("남은공간-01"));
    assert.ok(endingPage > openingPage, "the remaining project body should continue on a later page");
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

test("a manual section page break starts that section on the next PDF page", { timeout: 30_000 }, async () => {
  const snapshot = structuredClone(resumePdfFixture);
  snapshot.relatedWorkItems = [];
  snapshot.sections = [
    { id: "summary", title: "첫 페이지 소개", kind: "narrative", layout: "standard", content: { body: "첫 페이지에 남아야 하는 짧은 내용" } },
    { id: "skills", title: "새 페이지 역량", kind: "narrative", layout: "standard", pageBreakBefore: true, content: { body: "수동 페이지 나누기 이후 내용" } },
  ];

  const generated = await generateResumePdf(snapshot);
  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    assert.equal(pdf.numPages, 2);
    const firstPage = await (await pdf.getPage(1)).getTextContent();
    const secondPage = await (await pdf.getPage(2)).getTextContent();
    const firstText = firstPage.items.map((item) => "str" in item ? item.str : "").join("");
    const secondText = secondPage.items.map((item) => "str" in item ? item.str : "").join("");
    assert.ok(firstText.includes("첫 페이지 소개"));
    assert.ok(!firstText.includes("새 페이지 역량"));
    assert.ok(secondText.includes("새 페이지 역량"));
    assert.ok(secondText.includes("수동 페이지 나누기 이후 내용"));
  } finally {
    await pdf.destroy();
  }
});

test("section openings use the same protection when the current page remainder is too small", { timeout: 30_000 }, async () => {
  const snapshot = structuredClone(resumePdfFixture);
  const filler = Array.from({ length: 36 }, (_, index) =>
    `공간채움-${String(index + 1).padStart(2, "0")} 앞선 내용을 충분히 설명하여 현재 페이지 아래쪽의 남은 공간을 작게 만듭니다.`,
  ).join("\n");
  const itemBody = Array.from({ length: 18 }, (_, index) =>
    `조건부시작-${String(index + 1).padStart(2, "0")} 문제와 해결 과정, 측정 가능한 결과를 구체적으로 기록했습니다.`,
  ).join("\n");
  snapshot.relatedWorkItems = [];
  snapshot.sections = [
    { id: "summary", title: "앞선 긴 내용", kind: "narrative", layout: "standard", content: { body: filler } },
    {
      id: "education",
      title: "학력",
      kind: "items",
      layout: "compact",
      content: {
        items: [{
          id: "conditional-education",
          itemKind: "education",
          meta: "2025",
          title: "남은 공간에 따라 이동하는 학력 항목",
          subtitle: "컴퓨터공학과",
          body: itemBody,
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

    const sectionPage = pageTexts.findIndex((text) => text.includes("학력"));
    assert.ok(sectionPage > 0, "any section should move when its meaningful opening does not fit");
    assert.ok(pageTexts[sectionPage]?.includes("남은 공간에 따라 이동하는 학력 항목"));
    assert.ok(pageTexts[sectionPage]?.includes("조건부시작-01"));
    assert.ok(pageTexts[sectionPage]?.includes("조건부시작-02"));
  } finally {
    await pdf.destroy();
  }
});
