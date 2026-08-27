import type { ResumePdfSnapshot } from "@/domain/resume-documents/pdfSnapshot";

const tinyJpeg = "data:image/jpeg;base64,/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAgABgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCiwF6UAAAAAB//2Q==";

const longParagraph = Array.from({ length: 34 }, (_, index) =>
  `긴서술-${String(index + 1).padStart(2, "0")} 사용자의 문제를 관찰하고 가설을 세운 뒤 작은 실험으로 검증했습니다. 결과와 근거를 동료가 다시 확인할 수 있도록 기록하고 다음 의사결정에 반영했습니다.`,
).join("\n");

export const RESUME_PDF_VISIBLE_SENTINELS = [
  "항목-최신-유일",
  "항목-과거-유일",
  "연결-프로젝트-유일",
  "독립-프로젝트-유일",
  "미해결-프로젝트-유일",
] as const;

export const RESUME_PDF_ABSENT_SENTINELS = [
  "숨김-섹션-절대출력금지",
  "편집기-크롬-절대출력금지",
  "대화상자-크롬-절대출력금지",
] as const;

export const resumePdfFixture: ResumePdfSnapshot = {
  company: "브리프플로우 채용팀",
  documentName: "홍길동: 플랫폼/이력서.pdf",
  role: "시니어 제품 엔지니어",
  currentMonth: "2026-08",
  relatedWorkItems: [
    { id: "work-current", itemKind: "work", meta: "", startMonth: "2024-01", isCurrent: true, title: "현재회사", subtitle: "플랫폼팀 · 리드", body: "현재 역할" },
    { id: "work-old", itemKind: "work", meta: "", startMonth: "2021-03", endMonth: "2023-12", endMonthEnabled: true, title: "이전회사", subtitle: "제품팀 · 엔지니어", body: "이전 역할" },
  ],
  sections: [
    {
      id: "profile",
      title: "인적사항",
      kind: "identity",
      layout: "standard",
      content: {
        name: "홍길동",
        email: "hong@example.com",
        phone: "010-1234-5678",
        location: "서울",
        gender: "비공개",
        birthDate: "1990-01-02",
        links: ["https://example.com/hong"],
        photo: tinyJpeg,
        photoName: "profile.jpg",
      },
    },
    {
      id: "summary",
      title: "소개와 서술 서식",
      kind: "narrative",
      layout: "cards",
      content: {
        body: "",
        blocks: [
          { id: "heading-1", type: "h1", runs: [{ text: "서술 제목 1" }] },
          { id: "heading-2", type: "h2", runs: [{ text: "서술 제목 2" }] },
          { id: "heading-3", type: "h3", runs: [{ text: "서술 제목 3" }] },
          { id: "heading-4", type: "h4", runs: [{ text: "서술 제목 4" }] },
          { id: "heading-5", type: "h5", runs: [{ text: "서술 제목 5" }] },
          { id: "heading-6", type: "h6", runs: [{ text: "서술 제목 6" }] },
          { id: "bold-run", type: "p", runs: [{ text: "일반 문장과 " }, { text: "굵은 핵심 문장", bold: true }, { text: "을 함께 표시합니다." }] },
          { id: "long-narrative", type: "p", runs: [{ text: longParagraph }] },
        ],
      },
    },
    {
      id: "experience",
      title: "경력",
      kind: "items",
      layout: "standard",
      content: {
        sortDirection: "latest-first",
        items: [
          { id: "work-old", itemKind: "work", meta: "", startMonth: "2021-03", endMonth: "2023-12", endMonthEnabled: true, title: "이전회사 항목-과거-유일", subtitle: "제품팀 · 엔지니어", body: "오래된 경력 설명" },
          { id: "work-current", itemKind: "work", meta: "", startMonth: "2024-01", isCurrent: true, title: "현재회사 항목-최신-유일", subtitle: "플랫폼팀 · 리드", body: "최신 경력 설명" },
        ],
      },
    },
    {
      id: "projects",
      title: "경력 상세",
      kind: "items",
      layout: "compact",
      pageBreakBefore: true,
      content: {
        sortDirection: "oldest-first",
        items: [
          { id: "detail-linked", itemKind: "career-detail", detailType: "improvement", relatedWorkItemId: "work-current", relatedWorkTitle: "현재회사", meta: "", startMonth: "2024-04", endMonth: "2024-10", endMonthEnabled: true, title: "연결-프로젝트-유일", subtitle: "성능 개선", body: "응답 시간을 줄였습니다." },
          { id: "detail-independent", itemKind: "career-detail", detailType: "project", meta: "", startMonth: "2020-02", endMonth: "2020-06", endMonthEnabled: true, title: "독립-프로젝트-유일", subtitle: "개인 프로젝트", body: "독립적으로 기획하고 출시했습니다." },
          { id: "detail-unresolved", itemKind: "career-detail", detailType: "troubleshooting", relatedWorkItemId: "missing-work", relatedWorkTitle: "알 수 없는 회사", meta: "", startMonth: "2025-01", endMonth: "2025-03", endMonthEnabled: true, title: "미해결-프로젝트-유일", subtitle: "연결 확인", body: "연결되지 않은 경력 상세입니다." },
        ],
      },
    },
    { id: "skills", title: "핵심 역량", kind: "tags", layout: "standard", content: { items: ["문제 해결", "제품 전략", "React", "Node.js"] } },
    { id: "empty-tags", title: "빈 태그", kind: "tags", layout: "compact", content: { items: [] } },
    {
      id: "multi-items",
      title: "다중 항목",
      kind: "items",
      layout: "cards",
      content: {
        items: Array.from({ length: 18 }, (_, index) => ({
          id: `multi-${index + 1}`,
          itemKind: "activity" as const,
          meta: `202${index % 7}.0${index % 9 + 1}`,
          title: `다중-항목-${String(index + 1).padStart(2, "0")}`,
          subtitle: "커뮤니티 활동",
          body: "문제를 정의하고 동료와 해결안을 검토했습니다. 실행 결과를 문서로 남기고 다음 활동에 반영했습니다. 반복 가능한 기준과 점검 목록을 함께 만들었습니다.",
        })),
      },
    },
    { id: "empty-items", title: "빈 항목", kind: "items", layout: "cards", content: { items: [] } },
    { id: "empty-narrative", title: "빈 서술", kind: "narrative", layout: "standard", content: { body: "" } },
    { id: "eligibility", title: "병역 · 보훈 · 장애 · 취업보호", kind: "eligibility", content: { militaryStatus: "군필", veteranStatus: "비대상", disabilityStatus: "해당 없음", employmentProtectionStatus: "비대상" } },
    { id: "hidden", title: "숨김", kind: "narrative", hidden: true, content: { body: "숨김-섹션-절대출력금지" } },
  ],
};
