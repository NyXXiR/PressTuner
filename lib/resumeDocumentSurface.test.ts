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

test("resume documents exposes simplified section actions and automatic print pagination", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
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
  assert.match(source, /예상 \{pageCount\}페이지/);
  assert.match(styles, /\.resume-document-section\s*\{[\s\S]*?break-inside:\s*auto/);
  assert.match(styles, /\.resume-section-heading\s*\{[\s\S]*?break-after:\s*avoid/);
  assert.match(styles, /\.resume-item\s*\{[\s\S]*?break-inside:\s*avoid/);
  assert.match(styles, /\.resume-items\s*\{[\s\S]*?display:\s*block/);
  assert.match(styles, /\.resume-print-sections\s*\{[\s\S]*?display:\s*block/);
  assert.match(styles, /\.resume-print-section\s*\{[\s\S]*?transform:\s*none\s*!important/);
  assert.match(styles, /\.resume-page-guides/);
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
  const source = await readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8");

  assert.match(source, /data-photo-position="right"/);
  assert.match(source, /grid-cols-\[minmax\(0,1fr\)_24mm\]/);
  assert.match(source, /justify-self-end/);
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

test("resume page estimate measures print-like content without editor chrome", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /measurePrintedPageCount/);
  assert.match(source, /cloneNode\(true\)/);
  assert.match(source, /resume-print-measure/);
  assert.match(styles, /\.resume-print-measure \.resume-section-controls/);
  assert.match(styles, /\.resume-print-header\s*\{[\s\S]*?break-inside:\s*avoid/);
});

test("experience presentation exposes persisted sort and duration controls in printable output", async () => {
  const source = await readFile(new URL("../components/resume/ResumeDocumentBuilder.tsx", import.meta.url), "utf8");

  for (const label of ["최신순", "오래된순", "수동 순서", "자동 계산", "직접 입력", "경력 연", "경력 개월"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /sortExperienceItems/);
  assert.match(source, /resolveCareerDurationMonths/);
  assert.match(source, /formatCareerDuration/);
  assert.match(source, /data-experience-duration/);
  assert.match(source, /justify-between/);
  const durationNode = source.match(/<[^>]+data-experience-duration[^>]*>/)?.[0];
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
