import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { join } from "node:path";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function assertAbsent(haystack: string, needles: string[], context: string) {
  for (const needle of needles) {
    assert.equal(
      haystack.includes(needle),
      false,
      `${context} should not include ${needle}`,
    );
  }
}

test("resume simplified workspace separates core work nav from resource menu", () => {
  const workspace = source("components/resume/ResumeSimplifiedWorkspace.tsx");

  assert.match(workspace, /label:\s*"새 지원서"/);
  assert.match(workspace, /label:\s*"대시보드"/);
  assert.match(workspace, /label:\s*"지원서 목록"/);
  assert.match(workspace, /label:\s*"경험 보관함"/);
  assert.match(workspace, /label:\s*"문항 뱅크"/);
  assert.match(workspace, /label:\s*"공지사항"/);
  assert.match(workspace, /label:\s*"요금제"/);
  assert.match(workspace, /label:\s*"고객지원"/);
  assert.match(workspace, /자료\/서비스 메뉴|자료 메뉴|서비스 메뉴|>더보기<|더보기<\/span>/);
  assertAbsent(workspace, ["role=\"menu\"", "role=\{options?.panel ? \"menuitem\" : undefined\}"], "resume mobile resource disclosure");
  assertAbsent(
    workspace,
    ["ResumeRightPanel", "Sidebar", "기업별 문항 뱅크"],
    "resume simplified workspace",
  );
});

test("resume mobile workspace nav uses the press-style sticky four-tab surface", () => {
  const workspace = source("components/resume/ResumeSimplifiedWorkspace.tsx");

  assert.match(workspace, /sticky top-16 z-40/);
  assert.match(workspace, /grid-cols-4/);
  assert.match(workspace, /mobileLabel:\s*"작성"/);
  assert.match(workspace, /mobileLabel:\s*"현황"/);
  assert.match(workspace, /mobileLabel:\s*"목록"/);
  assert.match(workspace, />더보기<|더보기<\/span>/);
  assert.match(workspace, /자료\/서비스 메뉴|자료 메뉴|서비스 메뉴/);
  assert.match(workspace, /const mobileServiceLabel = mobileServiceOpen/);
  assert.match(workspace, /aria-label=\{mobileServiceLabel\}/);
  assert.match(workspace, /prefetch=\{"prefetch" in item \? item\.prefetch : undefined\}/);
  assert.match(workspace, /isPublicResumeRoute\(pathname\) \? "\/resume" : "\/resume\/write"/);
  assert.match(workspace, /pathname === "\/resume\/pricing"/);
  assert.match(workspace, /pathname\.startsWith\("\/resume\/notices"\)/);
  assert.match(workspace, /homeHref=\{headerHomeHref\}/);
  assert.ok(
    (workspace.match(/prefetch:\s*false/g) ?? []).length >= 4,
    "protected resume workspace links should avoid public-page prefetch noise",
  );
  assert.match(
    workspace,
    /\{MOBILE_NAV_ITEMS\.map\(\(item\) =>\s*renderNavItem\(item, \{\s*onClick: \(\) => setMobileServiceOpen\(false\)/,
  );
  assertAbsent(
    workspace,
    [
      "overflow-x-auto",
      "grid-cols-[minmax(0,1fr)_auto]",
      ">서비스</span>",
      "absolute inset-x-0 top-full",
      "absolute right-0 top-12",
      "w-44 rounded-lg",
    ],
    "resume mobile workspace nav",
  );
});

test("resume layout delegates chrome to the simplified workspace", () => {
  const layout = source("app/resume/layout.tsx");

  assert.match(layout, /ResumeSimplifiedWorkspace/);
  assertAbsent(
    layout,
    ["ResumeRightPanel", "Sidebar", "isMobileSidebarOpen", "Ambient Light", "overflow-hidden"],
    "resume layout",
  );
});

test("resume pricing defaults to the career tab inside the resume surface", () => {
  const pricingPage = source("app/resume/(public)/pricing/page.tsx");
  const pricingClient = source("app/(dashboard)/(public)/pricing/PricingPlansClient.tsx");

  assert.match(pricingPage, /basePath="\/resume\/pricing"/);
  assert.match(pricingPage, /defaultTab="CAREER"/);
  assert.match(pricingClient, /defaultTab = "PRESS"/);
  assert.match(pricingClient, /setActiveTab\(defaultTab\)/);
});

test("resume write page keeps one primary step visible at a time", () => {
  const writePage = source("app/resume/write/page.tsx");
  const writeRoot = source("app/resume/write/components/WriteFlowRoot.tsx");
  const legacyPage = source("app/resume/write/legacy/page.tsx");

  assert.match(writePage, /WriteFlowRoot/);
  assert.match(writePage, /initialAppId=\{id\}/);
  assert.match(writePage, /isTutorial=\{tutorial === "1"\}/);
  assert.match(writeRoot, /switch\s*\(stage\)/);
  assert.match(writeRoot, /case\s*"intake":/);
  assert.match(writeRoot, /case\s*"review":/);
  assert.match(writeRoot, /case\s*"writing":/);
  assert.match(writeRoot, /case\s*"capture":/);
  assert.match(writeRoot, /case\s*"done":/);
  assert.match(writeRoot, /renderStage\(visibleState/);
  assertAbsent(
    writePage,
    ["@/stores/legacy/useResumeWriteStore"],
    "resume write page",
  );
  assert.match(legacyPage, /@\/stores\/useResumeWriteStore/);
});

test("resume writing flow captures new experiences from the drafting surface", () => {
  const flowWriting = source("app/resume/write/components/FlowWriting.tsx");
  const captureCard = source("app/resume/write/components/FlowCaptureCard.tsx");
  const captureStage = source("app/resume/write/components/FlowCaptureStage.tsx");
  const flowApi = source("app/resume/write/components/flowApi.ts");
  const captureApi = source("lib/resume/resumeWriteFlowApiClient.ts");

  assert.match(flowWriting, /FlowCaptureCard/);
  assert.match(flowWriting, /onApply=\{\(\) => void commands\.applyCapture/);
  assert.match(flowWriting, /onDismiss=\{\(\) => void commands\.dismissCapture/);
  assert.match(captureApi, /\/api\/resume\/writing-workspaces\/\$\{input\.appId\}\/captures\/\$\{input\.captureId\}/);
  assert.match(captureApi, /action: "apply"/);
  assert.match(captureApi, /action: "dismiss"/);
  assert.match(flowApi, /resumeWriteFlowApi\.resolveCapture/);
  assert.doesNotMatch(flowApi, /\bfetch\(/);
  assert.match(captureCard, /새 경험으로 저장/);
  assert.match(captureCard, /경력 기억에 반영/);
  assert.match(captureCard, /이번엔 보류/);
  assert.match(captureStage, /마무리 · 경험 확인/);
});

test("resume dashboard is focused on recent writing status instead of onboarding/import clutter", () => {
  const dashboard = source("app/resume/dashboard/page.tsx");

  assert.match(dashboard, /오늘의 책상/);
  assert.match(dashboard, /책상 위에 쓰던 지원서가 있어요/);
  assert.match(dashboard, /이어쓰기/);
  assert.match(dashboard, /최근 지원서/);
  assert.match(dashboard, /새 지원서 작성/);
  assert.match(dashboard, /경험 추가/);
  assert.match(dashboard, /이번 달 완료/);
  assert.match(dashboard, /작성 중/);
  assert.match(dashboard, /fetchWithLoading\("\/api\/resume\/applications\?page=1&pageSize=5"\)/);
  assert.match(dashboard, /catch/);
  assert.match(dashboard, /setDashboardError/);
  assertAbsent(
    dashboard,
    [
      "targetGoal",
      "isEditingGoal",
      "resume_target_goal",
      "목표 설정",
      "Drag",
      "onDragOver",
      "showReviewModal",
      "중복",
      "MarketingFooter",
    ],
    "resume dashboard",
  );
});

test("resume applications API preserves query, status, and pagination contract", () => {
  const route = source("app/api/resume/applications/route.ts");
  const detailRoute = source("app/api/resume/applications/[id]/route.ts");
  const bulkRoute = source("app/api/resume/applications/bulk-delete/route.ts");
  const service = source("lib/services/resume/resumeApplicationService.ts");
  const store = source("stores/useResumeApplicationListStore.ts");

  assert.match(route, /searchParams\.get\("q"\)/);
  assert.match(route, /searchParams\.get\("status"\)/);
  assert.match(route, /searchParams\.get\("page"\)/);
  assert.match(route, /searchParams\.get\("pageSize"\)/);
  assert.match(route, /return NextResponse\.json\(\{ ok: true, \.\.\.result \}\)/);
  assert.match(route, /ApplicationStatus\.WRITING/);
  assert.match(route, /ApplicationStatus\.DONE/);
  assertAbsent(route, ["ApplicationStatus.SUBMITTED"], "resume application list route");
  assertAbsent(route, ["ApplicationStatus.ARCHIVED"], "resume application list route");
  assert.match(service, /ACTIVE_APPLICATION_STATUSES/);
  assert.match(service, /status:\s*\n\s*input\.status && input\.status\.length > 0\s*\n\s*\? \{ in: input\.status \}/);
  assert.match(service, /: \{ in: \[\.\.\.ACTIVE_APPLICATION_STATUSES\] \}/);
  assert.match(service, /contains: q, mode: "insensitive"/);
  assert.match(service, /skip: \(page - 1\) \* pageSize/);
  assert.match(service, /take: pageSize/);
  assert.match(service, /prisma\.application\.count\(\{ where \}\)/);
  assert.match(service, /totalPages: Math\.max\(1, Math\.ceil\(total \/ pageSize\)\)/);
  assert.match(service, /deleteApplication\(input: \{\s*\n\s*userId: string;\s*\n\s*teamId: string;/);
  assert.match(service, /teamId: input\.teamId/);
  assert.match(detailRoute, /const \{ user, team \} = await requireTeamContext\(\)/);
  assert.match(detailRoute, /userId: user\.id,\s*\n\s*teamId: team\.id/);
  assert.match(bulkRoute, /userId: user\.id,\s*\n\s*teamId: team\.id/);
  assert.match(store, /applicationListRequestSeq/);
  assert.match(store, /requestSeq !== applicationListRequestSeq/);
  assert.match(store, /지원서를 삭제하지 못했습니다/);
  assert.match(store, /query: \{ \.\.\.s\.query, page: Math\.max\(1, totalPages\) \}/);
});

test("resume applications page removes bulk table management and keeps simple status workflow", () => {
  const applications = source("app/resume/applications/page.tsx");

  assert.match(applications, /aria-label="지원서 검색"/);
  assert.match(applications, /aria-pressed=\{isActiveFilter\(query\.status, filter\.value\)\}/);
  assertAbsent(applications, ["SUBMITTED", "제출됨"], "resume applications page");
  assert.match(applications, /handleDelete\(item\)/);
  assert.match(applications, /window\.confirm/);
  assert.match(applications, /href=\{`\/resume\/applications\/\$\{item\.id\}`\}/);
  assert.match(applications, /list\.error/);
  assert.match(applications, /primaryHref/);
  assert.match(applications, /deleteOne\(item\.id\)/);
  assertAbsent(
    applications,
    [
      "selectedIds",
      "bulkDeleteSelected",
      "setAllOnPage",
      "toggleOne",
      "clearSelection",
      "headerCbRef",
      "indeterminate",
      "type=\"checkbox\"",
      "<table",
      "선택 삭제",
    ],
    "resume applications page",
  );
});

test("career memory page focuses on approval-first add search edit without cleanup-console controls", () => {
  const bricks = source("app/resume/bricks/page.tsx");

  assert.match(bricks, /경력 기억/);
  assert.match(bricks, /승인한 경력 기억만 자기소개서의 근거로 사용됩니다/);
  assert.match(bricks, /aria-label="경험 검색"/);
  assert.match(bricks, /handleDelete\(brick\)/);
  assert.match(bricks, /window\.confirm/);
  assert.match(bricks, /list\.error/);
  assert.match(bricks, /PDF에서 경험 추출/);
  assert.match(bricks, /직접 추가/);
  assert.match(bricks, /placeholder="경험 제목·키워드 검색"/);
  assert.match(bricks, /deleteOne\(brick\.id\)/);
  assertAbsent(
    bricks,
    [
      "deleteAll",
      "showCleanupModal",
      "handleOpenCleanup",
      "duplicateGroups",
      "viewMode",
      "LayoutGrid",
      "LayoutList",
      "전체 삭제",
      "중복 정리",
    ],
    "resume bricks page",
  );
});
