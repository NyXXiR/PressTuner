import assert from "node:assert/strict";
import test from "node:test";

import { getDocumentProxy } from "unpdf";

import type { ResumePdfSnapshot } from "@/domain/resume-documents/pdfSnapshot";
import { generateResumePdf } from "./resumePdfService";

async function renderCareerDetailBoundary(bodyLineCount: number, fillerLineCount: number) {
  const bodyLines = Array.from({ length: bodyLineCount }, (_, index) =>
    `경계상세-${index + 1} 문제와 해결 과정을 동료가 확인할 수 있도록 기록했습니다.`,
  );
  const snapshot: ResumePdfSnapshot = {
    company: "Company",
    documentName: "Document",
    role: "Role",
    relatedWorkItems: [],
    sections: [{
      id: "projects",
      title: "주요 프로젝트 및 성과",
      kind: "items",
      layout: "compact",
      content: {
        items: [
          {
            id: "preceding",
            itemKind: "career-detail",
            detailType: "project",
            meta: "2024",
            title: "앞선 프로젝트",
            subtitle: "",
            body: Array.from({ length: fillerLineCount }, (_, index) =>
              `앞선내용-${index + 1} 페이지의 남은 공간을 채우는 설명입니다.`,
            ).join("\n"),
          },
          {
            id: "boundary",
            itemKind: "career-detail",
            detailType: "project",
            meta: "2025",
            title: "경계 프로젝트",
            subtitle: "",
            body: bodyLines.join("\n"),
          },
        ],
      },
    }, {
      id: "hidden-ending",
      title: "숨긴 마지막 섹션",
      kind: "narrative",
      hidden: true,
      content: { body: "숨긴 내용은 출력하지 않습니다." },
    }],
  };

  const generated = await generateResumePdf(snapshot);
  const pdf = await getDocumentProxy(new Uint8Array(generated.bytes), { disableWorker: true } as never);
  try {
    const pageTexts: string[] = [];
    const renderedBodyLines: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const content = await (await pdf.getPage(pageNumber)).getTextContent();
      const textItems = content.items.filter((item) => "str" in item);
      pageTexts.push(textItems.map((item) => item.str).join(""));
      renderedBodyLines.push(...textItems.filter((item) => item.str.startsWith("경계상세-")).map((item) => item.str));
    }

    return { bodyLines, pageTexts, renderedBodyLines };
  } finally {
    await pdf.destroy();
  }
}

for (const [bodyLineCount, fillerLineCount] of [[4, 34], [5, 33]]) {
  test(`a ${bodyLineCount}-line career detail keeps its period and heading with its unsplittable body`, { timeout: 30_000 }, async () => {
    const { bodyLines, pageTexts, renderedBodyLines } = await renderCareerDetailBoundary(bodyLineCount, fillerLineCount);

    assert.deepEqual(renderedBodyLines, bodyLines, "the fixture must render exactly four or five complete body lines");
    assert.equal(pageTexts.length, 2);
    assert.ok(pageTexts[0].includes(`앞선내용-${fillerLineCount}`), "the preceding item must use the first page remainder");
    assert.ok(pageTexts[1].includes("경계 프로젝트"), "the heading must move with a body that cannot split into three-line fragments");
    assert.ok(pageTexts[1].includes("2025"), "the period must move with the heading");
    for (const line of bodyLines) assert.ok(pageTexts[1].includes(line), `the heading must share a page with ${line}`);
    assert.ok(!pageTexts[0].includes("경계 프로젝트"), "the first page must not retain an orphaned item heading");
  });
}

test("a career detail that reaches the page bottom does not create a blank trailing page for item spacing", { timeout: 30_000 }, async () => {
  for (const fillerLineCount of [32, 33]) {
    const { bodyLines, pageTexts, renderedBodyLines } = await renderCareerDetailBoundary(47, fillerLineCount);

    assert.deepEqual(renderedBodyLines, bodyLines, "all body lines must survive pagination exactly once");
    assert.ok(pageTexts.length >= 2, "the fixture must require pagination");
    assert.ok(pageTexts.every((text) => text.trim().length > 0), `item spacing after ${fillerLineCount} preceding lines must not spill onto an empty final page`);
  }
});
