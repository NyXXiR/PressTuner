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
  assert.match(page, /로그인 없는 보도자료 데모/);
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

test("demo surfaces required domain and accessibility language", () => {
  const source =
    read("components/demo/BriefFlowProductDemo.tsx") +
    read("domain/demo/productDemo.ts");

  for (const label of [
    "거친 메모",
    "메시지 브리프",
    "보도자료 초안",
    "32%",
    "결정론적 샘플 데이터",
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
