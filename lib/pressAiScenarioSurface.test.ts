import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(path, "utf8");

test("the public scenario route is static, canonical, and clearly isolated", async () => {
  const page = await source("app/demo/rag-test/scenario/page.tsx");

  assert.match(page, /export const dynamic = ["']force-static["']/);
  assert.match(page, /export const metadata/);
  assert.match(page, /title:\s*\{\s*absolute:/);
  assert.match(page, /\bdescription[:,]/);
  assert.match(page, /canonical:\s*["']\/demo\/rag-test\/scenario["']/);
  assert.match(page, /openGraph:/);
  assert.match(page, /url:\s*["']\/demo\/rag-test\/scenario["']/);
  assert.match(page, /twitter:/);
  assert.match(page, /index:\s*true/);
  assert.match(page, /follow:\s*true/);
  assert.match(page, /href=["']\/["']/);
  assert.match(page, /로그인 없음 · API\/AI\/저장\/할당량 사용 없음/);
  assert.match(page, /overflow-x-clip/);
  assert.match(page, /PressAiScenarioDemo/);
  assert.match(page, /MarketingFooter/);
});

test("the scenario exposes an ordered native-control workflow and status announcements", async () => {
  const component = await source("components/demo/PressAiScenarioDemo.tsx");

  assert.match(component, /^["']use client["'];/);
  assert.match(component, /PRESS_AI_SCENARIO_NODES\.map/);
  assert.match(component, /<ol\b/);
  assert.match(component, /<button\b/);
  assert.match(component, /aria-current=/);
  assert.match(component, /["']step["']/);
  assert.match(component, /disabled=/);
  assert.match(component, /aria-live=["']polite["']/);
  assert.match(component, /role=["']alert["']/);
  assert.match(component, /aria-expanded=/);
  assert.match(component, /aria-controls=/);
  assert.match(component, /<label[^>]*htmlFor=["']scenario-launch-date["']/);
  assert.match(component, /id=["']scenario-launch-date["']/);
  assert.match(component, /type=["']date["']/);
  assert.match(component, /aria-describedby=/);
  assert.match(component, /다시 재생|처음부터 다시/);
  assert.match(component, /focus-visible:/);
  assert.match(component, /min-h-11/);
});

test("the review card owns an accessible bounded self-loop", async () => {
  const component = await source("components/demo/PressAiScenarioDemo.tsx");

  assert.match(component, /review-loop-title/);
  assert.match(component, /초안 리뷰 반복/);
  assert.match(component, /<svg[\s\S]*?role=["']img["']/);
  assert.match(component, /aria-labelledby=["']review-loop-title["']/);
  assert.match(component, /<marker\b/);
  assert.match(component, /markerEnd=/);
  assert.match(component, /motion-reduce:/);
  assert.match(component, /2회 실행/);
  assert.match(component, /min-w-0/);
});

test("the scenario boundary has no runtime, persistence, or mutation dependency", async () => {
  const files = [
    "app/demo/rag-test/scenario/page.tsx",
    "components/demo/PressAiScenarioDemo.tsx",
    "domain/demo/pressAiScenario.ts",
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
    /localStorage/i,
    /sessionStorage/i,
    /\b(database|mutation)\b/i,
  ];

  for (const file of files) {
    const fileSource = await source(file);
    for (const pattern of forbidden) {
      assert.doesNotMatch(fileSource, pattern, `${file} matched ${pattern}`);
    }
  }
});
