import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(path, "utf8");

test("the public scenario route stays static while disclosing its live isolated API", async () => {
  const page = await source("app/demo/rag-test/scenario/page.tsx");
  assert.match(page, /export const dynamic = ["']force-static["']/);
  assert.match(page, /canonical:\s*["']\/demo\/rag-test\/scenario["']/);
  assert.match(page, /로그인 없음 · 서버측 AI 사용 · 고객 저장\/제품 할당량 사용 없음/);
  assert.doesNotMatch(page, /API\/AI\/저장\/할당량 사용 없음/);
  assert.match(page, /PressAiScenarioDemo/);
});

test("the public scenario route is discoverable in the sitemap", async () => {
  const sitemap = await source("app/sitemap.ts");
  assert.match(sitemap, /url:\s*`\$\{baseUrl\}\/demo\/rag-test\/scenario`/);
  assert.match(sitemap, /changeFrequency:\s*["']weekly["']/);
});

test("the guided surface exposes evidence, quota, live status, repair, lineage and debugger views", async () => {
  const component = await source("components/demo/PressAiScenarioDemo.tsx");
  for (const contract of [
    /PUBLIC_PRESS_RAG_GUIDED_MEMO/,
    /PressAiScenarioEvidencePanel/,
    /6회 \/ 10분|PUBLIC_PRESS_RAG_LIMITS\.starts/,
    /aria-live="polite"/,
    /role="alert"/,
    /scenario-repair-memo/,
    /PressAiScenarioLineage/,
    /PressAiProcessGraph/,
    /PressAiStateIoPanel/,
    /PressAiRunTimeline/,
    /review-repeat self-loop/,
    /새로고침하면/,
  ]) assert.match(component, contract);
  assert.match(component, /min-h-11/);
  assert.match(component, /focus-visible:/);
  assert.doesNotMatch(component, /localStorage|sessionStorage|OPENAI_API_KEY|PRESS_RAG_DEMO_SIGNING_SECRET/);
});

test("the browser boundary calls only the two public demo endpoints", async () => {
  const [client, hook] = await Promise.all([
    source("lib/publicPressRagScenarioClient.ts"),
    source("components/demo/usePublicPressRagScenario.ts"),
  ]);
  assert.match(client, /\/api\/demo\/press-rag-scenario\/start/);
  assert.match(client, /\/api\/demo\/press-rag-scenario\/command/);
  assert.doesNotMatch(client + hook, /\/api\/press\/|@prisma|OPENAI_API_KEY|signing/i);
});

test("the evidence panel links the controlled PDF page and exposes no upload input", async () => {
  const panel = await source("components/demo/PressAiScenarioEvidencePanel.tsx");
  const contract = await source("domain/demo/pressRagScenarioContract.ts");
  assert.match(contract, /\/samples\/press-ai-debugger\/evidence-fact-consistency\.pdf#page=1/);
  assert.match(panel, /PUBLIC_PRESS_RAG_EVIDENCE\.assetUrl/);
  assert.doesNotMatch(panel, /type=["']file["']|onChange=.*files|upload/i);
});
