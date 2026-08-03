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

test("press simplified workspace exposes only core work nav plus common service menu", () => {
  const workspace = source("components/press/PressSimplifiedWorkspace.tsx");

  assertAbsent(workspace, ["검토 대기", "/my/articles/pending", "Clock,"], "workspace nav");
  assert.match(workspace, /label:\s*"새 보도자료"/);
  assert.match(workspace, /label:\s*"대시보드"/);
  assert.match(workspace, /label:\s*"보도자료 목록"/);
  assert.match(workspace, /label:\s*"근거 문서"/);
  assert.match(workspace, /label:\s*"공지사항"/);
  assert.match(workspace, /label:\s*"요금제"/);
  assert.match(workspace, /label:\s*"고객지원"/);
  assert.match(workspace, /서비스 메뉴|>더보기<|더보기<\/span>/);
});

test("mobile workspace nav uses sticky segmented tabs instead of horizontal chips", () => {
  const workspace = source("components/press/PressSimplifiedWorkspace.tsx");

  assert.match(workspace, /sticky top-16 z-40/);
  assert.match(workspace, /grid-cols-5/);
  assert.match(workspace, /mobileLabel:\s*"작성"/);
  assert.match(workspace, /mobileLabel:\s*"현황"/);
  assert.match(workspace, /mobileLabel:\s*"목록"/);
  assert.match(workspace, /mobileLabel:\s*"근거"/);
  assert.match(workspace, />더보기<|더보기<\/span>/);
  assert.match(workspace, /서비스 메뉴/);
  assert.match(workspace, /className="mt-2 border border-border bg-popover/);
  assert.match(workspace, /role=\{options\?\.panel \? "menuitem" : undefined\}/);
  assert.match(workspace, /prefetch=\{"prefetch" in item \? item\.prefetch : undefined\}/);
  assert.equal(
    (workspace.match(/prefetch:\s*false/g) ?? []).length,
    4,
    "protected core mobile/desktop links should not be prefetched from public pages",
  );
  assert.match(
    workspace,
    /\{NAV_ITEMS\.map\(\(item\) =>\s*renderNavItem\(item, \{\s*onClick: \(\) => setMobileServiceOpen\(false\)/,
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
    "mobile workspace nav",
  );
});

test("legacy pending-review article page redirects to the personal article list", () => {
  const pendingPage = source("app/(dashboard)/my/articles/pending/page.tsx");

  assert.match(pendingPage, /import\s+\{\s*redirect\s*\}\s+from\s+"next\/navigation"/);
  assert.match(pendingPage, /redirect\(\s*"\/my\/articles"\s*\)/);
  assertAbsent(pendingPage, ["fetchWithLoading", "검토 요청 관리", "/api/my/articles/pending"], "pending page");
});

test("my dashboard keeps only writing-focused overview content", () => {
  const dashboard = source("app/(dashboard)/my/dashboard/page.tsx");

  assert.match(dashboard, /brieFFlow Press/);
  assert.match(dashboard, /보도자료 작업 현황/);
  assert.match(dashboard, /최근 작업과 이번 달 작성 현황만 빠르게 확인합니다\./);
  assert.match(dashboard, /새 보도자료 작성/);
  assert.match(dashboard, /보도자료 목록/);
  assert.match(dashboard, /이번 달 생성/);
  assert.match(dashboard, /이번 달 완료/);
  assert.match(dashboard, /아직 작업한 보도자료가 없습니다/);
  assertAbsent(
    dashboard,
    [
      "검토 대기 중",
      "/my/articles/pending",
      "MarketingFooter",
      "next/image",
      "팀 스타일 가이드 반영",
      "누적 데이터 기반 학습",
      "brieFFlow</p>",
    ],
    "dashboard",
  );
});

test("my articles page removes team/bulk management and keeps simple status workflow", () => {
  const articles = source("app/(dashboard)/my/articles/page.tsx");

  assert.match(articles, /placeholder="보도자료 제목 검색"/);
  assert.match(articles, /\{ label: "전체", value: "all" \}/);
  assert.match(articles, /\{ label: "초안", value: "drafts" \}/);
  assert.match(articles, /\{ label: "작성 중", value: "active" \}/);
  assert.match(articles, /\{ label: "완료", value: "final" \}/);
  assert.match(articles, /href=\{primaryAction\.href\}/);
  assert.match(articles, /deleteOne\(it\.id\)/);
  assertAbsent(
    articles,
    [
      "InlineTeamSelect",
      "Users,",
      "updateTeam",
      "selectedIds",
      "bulkDeleteSelected",
      "setAllOnPage",
      "toggleOne",
      "clearSelection",
      "소속 팀 변경",
      "선택 삭제",
      "type=\"checkbox\"",
      "발행 완료",
    ],
    "articles page",
  );
});

test("press notices uses the shared compact row surface", () => {
  const pressNotices = source("app/(dashboard)/press/(public)/notices/page.tsx");
  const noticesClient = source("app/(dashboard)/(public)/notices/NoticesListClient.tsx");

  assert.match(pressNotices, /brieFFlow Press/);
  assert.match(pressNotices, /variant="compact"/);
  assert.match(pressNotices, /mt-6 border-t-2 border-foreground/);
  assert.match(noticesClient, /variant\?:\s*"default"\s*\|\s*"compact"/);
  assert.match(noticesClient, /const isCompact = variant === "compact"/);
  assert.match(noticesClient, />\s*보기\s*</);
  assert.match(noticesClient, /className="border-b border-border"/);
  assertAbsent(pressNotices, ["보기 →"], "press notices page");
});

test("press pricing has a dedicated compact client scoped to press plans", () => {
  const pressPricingPage = source("app/(dashboard)/press/(public)/pricing/page.tsx");
  const pressPricingClient = source("app/(dashboard)/press/(public)/pricing/PressPricingPlansClient.tsx");
  const publicPricingClient = source("app/(dashboard)/(public)/pricing/PricingPlansClient.tsx");

  assert.match(pressPricingPage, /PressPricingPlansClient/);
  assert.match(pressPricingPage, /Billing/);
  assert.match(pressPricingPage, /보도자료 작성량에 맞는 플랜을 선택합니다\./);
  assertAbsent(pressPricingPage, ["@/app/(dashboard)/(public)/pricing/PricingPlansClient", "심플한 가격, 강력한 기능", "취업 준비생부터 기업 홍보팀까지"], "press pricing page");

  assert.match(pressPricingClient, /p\.isFree \|\| p\.category === "PRESS"/);
  assert.match(pressPricingClient, /\/billing\/checkout\?plan=/);
  assert.match(pressPricingClient, /이용권 쿠폰 적용/);
  assert.match(pressPricingClient, /authStatus/);
  assert.match(pressPricingClient, /authStatus !== "authed"/);
  assertAbsent(pressPricingClient, ["기업 홍보", "취업 / 이직", "올인원", "TABS", "rounded-3xl", "FAQS"], "press pricing client");

  assert.match(publicPricingClient, /취업 \/ 이직/);
  assertAbsent(publicPricingClient, ["올인원", "STANDARD"], "public pricing client");
});
