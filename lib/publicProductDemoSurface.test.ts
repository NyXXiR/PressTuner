import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("/demo has route metadata and an explicit public proxy contract", () => {
  const page = read("app/demo/page.tsx");
  const proxy = read("proxy.ts");
  const sitemap = read("app/sitemap.ts");

  assert.match(page, /export const metadata/);
  assert.match(page, /title:/);
  assert.match(page, /\bdescription[:,]/);
  assert.match(page, /canonical:\s*["']\/demo["']/);
  assert.match(page, /openGraph:/);
  assert.match(page, /twitter:/);
  assert.match(page, /index:\s*true/);
  assert.match(page, /follow:\s*true/);
  assert.doesNotMatch(page, /AuthRedirectIfAuthed/);
  assert.doesNotMatch(page, /components\/layout\/Header/);
  assert.match(page, /로그인 없는 보도자료 근거 검증 데모/);
  assert.match(page, /페이지 단위 근거 검증/);
  assert.match(
    proxy,
    /publicPaths\s*=\s*\[[\s\S]*?["']\/demo["'][\s\S]*?\]/,
  );
  assert.match(proxy, /["']\/demo\/:path\*["']/);
  assert.match(sitemap, /url:\s*`\$\{baseUrl\}\/demo`/);
  assert.match(sitemap, /changeFrequency:\s*["']weekly["']/);
});

test("landing and demo navigation use tracked links with exact destinations", () => {
  const landing = read("components/marketing/BriefFlowLandingPage.tsx");
  const pressLanding = read(
    "components/marketing/PressLandingPage.tsx",
  );
  const demo = read("components/demo/BriefFlowProductDemo.tsx");

  assert.match(landing, /href=["']\/demo["']/);
  assert.match(landing, /eventName=["']product_demo_opened["']/);
  assert.match(landing, /source:\s*["']landing_hero["']/);
  assert.match(landing, /target_path:\s*["']\/demo["']/);

  assert.match(pressLanding, /TrackedMarketingLink/);
  assert.match(pressLanding, /href=["']\/demo["']/);
  assert.match(pressLanding, /eventName=["']product_demo_opened["']/);
  assert.match(pressLanding, /source:\s*["']press_landing_hero["']/);
  assert.match(pressLanding, /target_path:\s*["']\/demo["']/);

  assert.match(demo, /TrackedMarketingLink/);
  assert.match(demo, /href=["']\/login\?next=\/press\/new["']/);
  assert.match(demo, /eventName=["']demo_workspace_cta_clicked["']/);
  assert.match(demo, /source:\s*["']public_product_demo["']/);
  assert.match(demo, /track:\s*["']press["']/);
});

test("all four root landing start actions use the public product routes", () => {
  const landing = read("components/marketing/BriefFlowLandingPage.tsx");

  assert.match(
    landing,
    /id:\s*["']press["'][\s\S]*?startHref:\s*["']\/press["']/,
  );
  assert.match(
    landing,
    /href=["']\/press["'][\s\S]*?cta_name:\s*["']hero_press_start["'][\s\S]*?target_path:\s*["']\/press["']/,
  );
  assert.match(
    landing,
    /id:\s*["']resume["'][\s\S]*?startHref:\s*["']\/resume["']/,
  );
  assert.match(
    landing,
    /href=["']\/resume["'][\s\S]*?cta_name:\s*["']hero_resume_start["'][\s\S]*?target_path:\s*["']\/resume["']/,
  );
  assert.match(
    landing,
    /href=\{track\.startHref\}[\s\S]*?target_path:\s*track\.startHref/,
  );
  assert.doesNotMatch(landing, /\/login\?next=\/press\/new/);
  assert.doesNotMatch(landing, /\/login\?next=\/resume\/write/);
});

test("demo surfaces required domain and accessibility language", () => {
  const source =
    read("components/demo/BriefFlowProductDemo.tsx") +
    read("domain/demo/productDemo.ts");

  for (const label of [
    "오류가 포함된 초안",
    "근거 후보",
    "주장 검증",
    "검증 완료",
    "32%",
    "40%",
    "업계 최초",
    "PASS",
    "WARN",
    "BLOCK",
    "출처 맵",
    "controlled-synthetic",
    "AI/API 호출 · 저장 없음",
  ]) {
    assert.ok(source.includes(label), `missing demo label: ${label}`);
  }

  assert.match(source, /<button\b/);
  assert.match(source, /aria-current=/);
  assert.match(source, /aria-live=["']polite["']/);
  assert.match(source, /focus-visible:/);
  assert.doesNotMatch(source, /role=["']tab(list)?["']/);
});

test("demo exposes four distinct stages and resets only after completion", () => {
  const source = read("components/demo/BriefFlowProductDemo.tsx");

  assert.match(source, /id:\s*["']draft["'][\s\S]*?id:\s*["']evidence["'][\s\S]*?id:\s*["']verification["'][\s\S]*?id:\s*["']complete["']/);
  assert.match(source, /sm:grid-cols-4/);
  assert.match(source, /BLOCK 항목 때문에 최종 확정할 수 없습니다/);
  assert.match(source, /32%를 40%로 수정/);
  assert.match(source, /재검증 결과 · PASS/);
  assert.match(source, /stage === ["']complete["'][\s\S]*?처음부터 다시/);
  assert.match(source, /demo_press_release_completed/);
});

test("demo exposes page-level PDF evidence and a complete corrected source map", () => {
  const source =
    read("components/demo/BriefFlowProductDemo.tsx") +
    read("domain/demo/productDemo.ts");

  for (const href of [
    "/samples/press-ai-debugger/basic-multipage-facts.pdf#page=1",
    "/samples/press-ai-debugger/basic-multipage-facts.pdf#page=2",
    "/samples/press-ai-debugger/basic-multipage-facts.pdf#page=3",
    "/samples/press-ai-debugger/fact-style-guide.pdf#page=1",
  ]) assert.ok(source.includes(href), `missing page link: ${href}`);

  assert.match(source, /FACT/);
  assert.match(source, /STYLE/);
  assert.match(source, /사실 근거로 사용할 수 없/);
  assert.match(source, /demoSourceMap\.map/);
});

test("demo offers the live AI process debugger as a separate secondary choice", () => {
  const source = read("components/demo/BriefFlowProductDemo.tsx");

  assert.match(source, /href=["']\/demo\/rag-test\/scenario["']/);
  assert.match(source, /AI 프로세스 디버거 데모 열기/);
  assert.match(source, /결정론적 튜토리얼/);
  assert.match(source, /서버측 AI/);
  assert.doesNotMatch(
    source,
    /id:\s*["'](?:rag-test|scenario|debugger)["']/,
  );
});

test("tutorial and debugger CTA labels explicitly identify demos", () => {
  const page = read("app/demo/page.tsx");
  const source = read("components/demo/BriefFlowProductDemo.tsx");

  assert.match(page, /보도자료 근거 검증 데모/);
  assert.match(source, /AI 프로세스 디버거 데모 열기/);
});

test("demo import and interaction surface has no network or server dependency", () => {
  const demoFiles = [
    "app/demo/page.tsx",
    "components/demo/BriefFlowProductDemo.tsx",
    "domain/demo/productDemo.ts",
  ];
  const forbidden = [
    /fetch\s*\(/i,
    /["'`]\/api\//i,
    /axios/i,
    /\bopenai\b/i,
    /@prisma/i,
    /lib\/services/i,
    /server action/i,
    /["']use server["']/i,
    /\/mutation/i,
  ];

  for (const file of demoFiles) {
    const source = read(file);
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${file} matched ${pattern}`);
    }
  }
});
