import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("resume documents keeps a simple local-only role flow with optional support versions", async () => {
  const source = await readFile(
    new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /직군 이력서/);
  assert.match(source, /공통 정보/);
  assert.match(source, /회사별 지원 버전 만들기/);
  assert.match(source, /type="month"/);
  assert.match(source, /재직 중/);
  assert.match(source, /섹션 이름/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /증명사진 업로드/);
  assert.match(source, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(source, /canvas\.toDataURL/);
  assert.match(source, /PDF 기본 순서/);
  assert.match(source, /핸들을 위아래로 끌어 PDF 순서를 변경/);
  assert.match(source, /공통 정보 순서 이동/);
  assert.match(source, /서술형 서식 도구/);
  assert.match(source, /공백 포함/);
  assert.match(source, /formatBlock/);
  assert.match(source, /굵게/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.match(source, /onPaste/);
  assert.match(source, /clipboardData\.getData\("text\/html"\)/);
  assert.match(source, /DOMParser/);
  assert.match(source, /parseNarrativeClipboard/);
  assert.match(source, /localStorage\.setItem/);
  assert.doesNotMatch(source, /LOCAL PROTOTYPE/);
  assert.doesNotMatch(source, /local-\$\{Date\.now\(\)\}/);
  assert.match(source, /\/api\/resume\/bricks\/all/);
  assert.doesNotMatch(source, /prisma/i);
});

test("resume documents exposes simplified section actions and exact paged preview", async () => {
  const [source, printable, dialog] = await Promise.all([
    readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/resume/ResumePrintableDocument.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/resume/ResumePdfPreviewDialog.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(source, /지원 버전 복제/);
  assert.match(source, /작성 상태 점검/);
  assert.match(source, /inspectResumeReadiness/);
  assert.match(source, /섹션 더보기/);
  assert.match(source, /섹션 숨기기/);
  assert.match(source, /섹션 표시/);
  assert.doesNotMatch(source, /내용 출처/);
  assert.doesNotMatch(source, /표시 스타일/);
  assert.doesNotMatch(source, /다음 페이지에서 시작/);
  assert.doesNotMatch(source, /resume-page-break/);
  assert.match(source, /ResumePdfPreviewDialog/);
  assert.match(source, /저장 미리보기에서 정확한 페이지 수/);
  assert.doesNotMatch(source, /예상 \{pageCount\}페이지/);
  assert.match(printable, /data-resume-section-id/);
  assert.match(printable, /data-resume-item-id/);
  assert.match(printable, /data-resume-paragraph-id/);
  assert.doesNotMatch(printable, /<button|<input|Reorder|framer-motion|onClick/);
  for (const phrase of ["PDF 미리보기를 만드는 중", "페이지 미리보기 완료", "다시 시도", "인쇄 대화상자를 여는 중"]) {
    assert.match(dialog, new RegExp(phrase));
  }
});

test("resume PDF uses a dedicated stylesheet with exact geometry and print isolation", async () => {
  const [source, styles, adapter, layout] = await Promise.all([
    readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/styles/resume-print.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/resume/pagedPreviewer.client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(styles, /@page resume-document\s*\{[\s\S]*?size:\s*210mm 297mm;[\s\S]*?margin:\s*16mm 18mm;/);
  assert.match(styles, /\.resume-pdf-page[\s\S]*?width:\s*210mm[\s\S]*?height:\s*297mm/);
  assert.match(styles, /\.pagedjs_page_content[\s\S]*?width:\s*174mm[\s\S]*?height:\s*265mm/);
  assert.match(styles, /@media print[\s\S]*?@page\s*\{[\s\S]*?margin:\s*0/);
  assert.match(styles, /body\.resume-pdf-printing[\s\S]*?\.resume-pdf-page/);
  assert.match(styles, /\.resume-group-heading[\s\S]*?break-after:\s*avoid/);
  assert.match(styles, /\.resume-item[\s\S]*?break-inside:\s*avoid/);
  assert.match(styles, /\.resume-section-opening[\s\S]*?page-break-inside:\s*avoid/);
  assert.match(adapter, /import\("pagedjs"\)/);
  assert.match(adapter, /new Previewer/);
  assert.match(adapter, /preview\(source, \["\/styles\/resume-print\.css"\], output\)/);
  assert.doesNotMatch(adapter, /PagedConfig|PagedPolyfill|paged\.polyfill/);
  assert.doesNotMatch(source, /window\.print\(\)/);
  assert.doesNotMatch(source, /measurePrintedPageCount|ResizeObserver|estimateResumePrintPageCount/);
  assert.match(source, /px-\[18mm\] py-\[16mm\]/);
  assert.match(layout, /\/styles\/resume-print\.css/);
});

test("common information explains role overrides without owning their reset action", async () => {
  const source = await readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8");

  assert.match(source, /공통 정보 변경이 반영되지 않습니다/);
  assert.match(source, /해당 이력서 섹션의 더보기/);
  assert.doesNotMatch(source, /onResetRole/);
  assert.match(source, /공통 섹션 추가/);
  assert.match(source, /모든 직군과 지원 버전에서 삭제/);
  assert.match(source, /addSharedSection/);
  assert.match(source, /deleteSharedSection/);
  assert.match(source, /resetRoleProfileSectionToShared/);
});

test("custom sections can be promoted into common information from their own action menu", async () => {
  const source = await readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8");

  assert.match(source, /공통 섹션으로 전환/);
  assert.match(source, /모든 직군과 지원 버전에 표시됩니다/);
  assert.match(source, /promoteRoleCustomSectionToShared/);
  assert.match(source, /promoteSupportCustomSectionToShared/);
});

test("inherited section editors default to a compact current-only footer target and keep reset on the section", async () => {
  const source = await readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8");

  assert.match(source, /저장 위치/);
  assert.match(source, /공통 정보로 저장하고 전파/);
  assert.match(source, /이 직군 전용 섹션으로 저장/);
  assert.match(source, /직군 이력서로 저장하고 전파/);
  assert.match(source, /이 지원 버전 전용 섹션으로 저장/);
  assert.match(source, /saveTarget: "current" \| "parent"/);
  assert.match(source, /saveTarget: "current"/);
  assert.match(source, /aria-label="저장 위치"/);
  assert.match(source, /text-\[11px\]/);
  assert.doesNotMatch(source, /저장 위치를 선택해 주세요/);
  assert.match(source, /공통 정보로 되돌리기/);
  assert.match(source, /직군 이력서로 되돌리기/);
  assert.match(source, /saveTarget/);
  assert.match(source, /resetSupportVariantSectionToRole/);
});

test("identity rendering places an optional profile photo on the right", async () => {
  const source = await readFile(new URL("../components/resume/ResumePrintableDocument.tsx", import.meta.url), "utf8");

  assert.match(source, /data-photo-position="right"/);
  assert.match(source, /resume-profile-photo/);
  assert.match(source, /resume-identity-copy/);
});

test("identity keeps reusable contact, birth date, and gender fields", async () => {
  const source = await readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8");

  for (const label of ["전화번호", "거주 지역", "성별", "생년월일"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /import \{ DateInput \} from "@\/components\/ui\/DateInput"/);
  assert.match(source, /const localToday = formatDateOnly\(new Date\(\)\)/);
  const birthDateField = source.match(/<DateInput\s+label="생년월일"[\s\S]*?\/>/)?.[0];
  assert.ok(birthDateField);
  assert.match(birthDateField, /min="1900-01-01"/);
  assert.match(birthDateField, /max=\{localToday\}/);
  assert.match(birthDateField, /startMonth="1900-01-01"/);
  assert.match(birthDateField, /endMonth=\{localToday\}/);
  assert.match(birthDateField, /reverseYears/);
  assert.match(birthDateField, /quickActions=\{\[\]\}/);
  assert.doesNotMatch(source, /<Field\s+label="생년월일"\s+type="date"/);
});

test("eligibility is a dedicated normal section and owns the four moved facts", async () => {
  const source = await readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8");
  assert.match(source, /type EligibilityContent/);
  assert.match(source, /section\.kind === "eligibility"/);
  assert.match(source, /병역 · 보훈 · 장애 · 취업보호/);
  for (const label of ["병역 여부", "보훈 대상", "장애 여부", "취업보호 대상"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /군필/);
  assert.match(source, /비대상/);
  assert.match(source, /eligibility[\s\S]*섹션 숨기기|섹션 숨기기[\s\S]*eligibility/);
  assert.match(source, /eligibility[\s\S]*PDF 순서|PDF 순서[\s\S]*eligibility/);
});

test("confirmed experience bricks have accessible bulk sync states and retry", async () => {
  const source = await readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8");
  assert.match(source, /fetch\("\/api\/resume\/bricks\/all", \{ cache: "no-store"/);
  assert.match(source, /AbortController/);
  assert.match(source, /aria-live="polite"/);
  for (const phrase of ["불러오는 중", "동기화했습니다", "동기화할 확정 경험이 없습니다", "다시 시도", "일괄 가져오기", "동기화"]) {
    assert.match(source, new RegExp(phrase));
  }
  assert.match(source, /현재 (?:직군|지원) 이력서에서 제외/);
  assert.doesNotMatch(source, /로컬 경험 참조 추가/);
  assert.doesNotMatch(source, /태그\(쉼표 구분\)/);
});

test("the bulk API route stays authenticated and delegates projection to the service", async () => {
  const route = await readFile(new URL("../app/api/resume/bricks/all/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireTeamContext\(\)/);
  assert.match(route, /listAllExperienceBricks\(user\.id\)/);
  assert.doesNotMatch(route, /prisma/i);
});

test("resume documents explains section formats and keeps mobile editing controls readable", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /sectionKindGuidance/);
  for (const guidance of ["연락처와 기본 정보", "문단 중심", "기간과 항목", "짧은 키워드"]) {
    assert.match(source, new RegExp(guidance));
  }
  assert.match(source, /resume-mobile-settings-toggle/);
  assert.match(source, /aria-expanded=\{mobileSettingsOpen\}/);
  assert.match(source, /resume-dialog-panel/);
  assert.match(source, /resume-dialog-scroll/);
  assert.match(source, /resume-dialog-footer/);
  assert.match(styles, /@media screen and \(max-width: 767px\)/);
  assert.match(styles, /\.resume-paper-inner/);
  assert.match(styles, /\.resume-paper \.resume-item\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test("resume paged source remains local-state based without measurement clones", async () => {
  const [source, printable] = await Promise.all([
    readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/resume/ResumePrintableDocument.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(source, /RESUME_DOCUMENT_STORAGE_KEY/);
  assert.match(source, /localStorage\.setItem/);
  assert.doesNotMatch(printable, /localStorage|RESUME_DOCUMENT_STORAGE_KEY|fetch\(/);
  assert.doesNotMatch(source, /cloneNode\(true\)|resume-print-measure/);
});

test("experience presentation exposes persisted sort and duration controls in printable output", async () => {
  const [source, printable] = await Promise.all([
    readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/resume/ResumePrintableDocument.tsx", import.meta.url), "utf8"),
  ]);

  for (const label of ["최신순", "오래된순", "수동 순서", "자동 계산", "직접 입력", "경력 연", "경력 개월"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(printable, /sortExperienceItems/);
  assert.match(printable, /resolveCareerDurationMonths/);
  assert.match(printable, /formatCareerDuration/);
  assert.match(printable, /data-experience-duration/);
  const durationNode = printable.match(/<[^>]+data-experience-duration[^>]*>/)?.[0];
  assert.ok(durationNode);
  assert.doesNotMatch(durationNode, /print:hidden|resume-section-controls/);
});

test("all item editors expose explicit end-month controls with experience mutual exclusion", async () => {
  const [builder, panel] = await Promise.all([
    readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/resume/ResumeDocumentImportPanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.ok((builder.match(/종료연월 있음/g) ?? []).length >= 2);
  assert.match(builder, /endMonthEnabled/);
  assert.match(builder, /isItemEndMonthEnabled/);
  assert.match(builder, /endMonth: ""/);
  assert.match(builder, /isCurrent: false/);
  assert.match(panel, /종료연월 있음/);
  assert.match(panel, /disabled={disabled \|\| !endMonthEnabled}/);
  assert.match(panel, /endMonth: event\.target\.checked[\s\S]*?: ""/);
});

test("PDF import lifecycle polling is selected-detail-only, abortable, and visibility-aware", async () => {
  const source = await readFile(new URL("../components/resume/ResumeDocumentImportPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /`\/api\/resume\/documents\/imports\/\$\{selectedId\}`/);
  assert.match(source, /AbortController/);
  assert.match(source, /document\.visibilityState/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /window\.setTimeout/);
  assert.match(source, /shouldPollImport/);
  assert.match(source, /nextImportPollDelay/);
  assert.match(source, /canLoadImportCandidates/);
  assert.doesNotMatch(source, /setInterval/);

  const pollingEffect = source.match(/const poll = async \(\) => \{[\s\S]*?visibilitychange[\s\S]*?\}, \[[^\]]*selectedId[^\]]*\]\);/)?.[0];
  assert.ok(pollingEffect);
  assert.doesNotMatch(pollingEffect, /"\/api\/resume\/documents\/imports"/);
});

test("PDF imports stay review-first and recover approved but unapplied candidates", async () => {
  const [builder, panel, decisionRoute, appliedRoute] = await Promise.all([
    readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/resume/ResumeDocumentImportPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/resume/documents/candidates/[candidateId]/decision/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/resume/documents/candidates/[candidateId]/applied/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(builder, /PDF로 채우기/);
  assert.match(builder, /applyResumeImportCommand/);
  assert.match(builder, /localStorage\.setItem\(RESUME_DOCUMENT_STORAGE_KEY/);
  assert.match(panel, /AI는 섹션별 후보만 만듭니다/);
  assert.match(panel, /확인하고 반영/);
  assert.match(panel, /문서 반영 다시 시도/);
  assert.match(panel, /PDF 원문 근거/);
  assert.match(panel, /경력 보관함/);
  assert.match(panel, /추천일 뿐이며 승인 전에 바꿀 수 있습니다/);
  assert.match(builder, /sections=\{orderedSections\}/);
  assert.match(decisionRoute, /decideResumeDocumentCandidate/);
  assert.match(appliedRoute, /acknowledgeResumeDocumentCandidateApplied/);
});

test("PDF import review supports one-click bulk approval and rejection", async () => {
  const panel = await readFile(new URL("../components/resume/ResumeDocumentImportPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /전체 승인·반영/);
  assert.match(panel, /전체 제외/);
  assert.match(panel, /bulkReview/);
});

test("PDF import review groups candidates by section and isolates possible duplicates from bulk approval", async () => {
  const panel = await readFile(new URL("../components/resume/ResumeDocumentImportPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /섹션별 검토/);
  assert.match(panel, /중복 가능성/);
  assert.match(panel, /개별 확인/);
  assert.match(panel, /inspectResumeImportOverlap/);
});

test("resume documents expose canonical career details with type and relationship controls", async () => {
  const [builder, panel] = await Promise.all([
    readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/resume/ResumeDocumentImportPanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(builder, /경력 상세/);
  assert.match(builder, /연결 경력/);
  assert.match(builder, /독립 프로젝트/);
  assert.match(builder, /연결 확인 필요/);
  assert.match(panel, /value="project">프로젝트/);
  assert.match(panel, /value="responsibility">상시 책임/);
  assert.match(panel, /value="improvement">개선/);
  assert.match(panel, /value="troubleshooting">문제 해결/);
  assert.doesNotMatch(panel, /value="career-description">경력기술서/);
});
