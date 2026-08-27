import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ResumePrintableDocument } from "@/components/resume/ResumePrintableDocument";
import type { ItemContent, ResumeSection } from "@/domain/resume-documents/model";

export const chromeSentinel = "EDITOR_CHROME_MUST_NOT_PRINT";
export const dialogSentinel = "DIALOG_CHROME_MUST_NOT_PRINT";

const longBody = Array.from({ length: 12 }, (_, index) => `검증 문장 ${index + 1}: 페이지 경계를 확인하기 위한 충분히 긴 설명입니다.`).join(" ");

const items = (count: number): ItemContent[] => Array.from({ length: count }, (_, index) => ({
  id: `fixture-item-${index + 1}`,
  meta: `${2025 - index}.01 — 현재`,
  title: `브라우저 검증 항목 ${index + 1}`,
  subtitle: "페이지 분할 회귀 테스트",
  body: longBody,
}));

export const fixtureSections: ResumeSection[] = [
  {
    id: "fixture-profile",
    title: "인적사항",
    kind: "identity",
    content: {
      name: "페이지 검증 지원자",
      email: "fixture@example.com",
      phone: "010-0000-0000",
      location: "서울",
      links: ["https://example.com"],
      photo: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='64'%3E%3Crect width='48' height='64' fill='%23ddd'/%3E%3C/svg%3E",
    },
  },
  {
    id: "fixture-intro",
    title: "소개",
    kind: "narrative",
    content: { body: Array.from({ length: 8 }, (_, index) => `소개 문단 ${index + 1}. ${longBody}`).join("\n\n") },
  },
  { id: "fixture-long-items", title: "긴 경력", kind: "items", content: { items: items(12) } },
  { id: "fixture-short", title: "짧은 자격", kind: "tags", content: { items: ["TypeScript", "React", "접근성"] } },
];

process.stdout.write(renderToStaticMarkup(createElement(ResumePrintableDocument, {
  company: "브라우저 검증 회사",
  documentName: "브라우저 검증 이력서",
  relatedWorkItems: [],
  role: "테스트 엔지니어",
  sections: fixtureSections,
})));
