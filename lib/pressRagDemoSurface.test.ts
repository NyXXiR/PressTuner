import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("the existing proxy policy leaves the demo route public", async () => {
  const proxy = await source("proxy.ts");
  assert.match(proxy, /publicPaths\s*=\s*\[[\s\S]*?"\/demo"/);
  assert.match(proxy, /"\/demo\/:path\*"/);
});

test("the route is static and passes only the server-built view model to the client", async () => {
  const page = await source("app/demo/rag-test/page.tsx");
  assert.match(page, /export const dynamic = "force-static"/);
  assert.match(page, /loadPressRagDemo\(\)/);
  assert.match(page, /<PressRagTestDemo viewModel=\{viewModel\}/);
  assert.match(page, /MarketingFooter/);
  assert.match(page, /새 요청을 실행하지 않고, 승인된 controlled-live 기록을 재생합니다/);
  assert.match(page, /모델[\s\S]*API[\s\S]*데이터베이스/);
  assert.doesNotMatch(page, /node:fs|prisma|executePressRag|runAgent|process\.env/);
});

test("the loader reads only the three fixed approved evidence files", async () => {
  const loader = await source("lib/services/evaluation/loadPressRagDemo.ts");
  const jsonPaths = [...loader.matchAll(/"(evals\/press-rag\/controlled-live\/[^"]+\.json)"/g)].map(
    ([, path]) => path,
  );
  assert.deepEqual(jsonPaths, [
    "evals/press-rag/controlled-live/dataset-v4.approved.json",
    "evals/press-rag/controlled-live/results/baseline-v1.json",
    "evals/press-rag/controlled-live/results/candidate-v3-optimized.json",
  ]);
  assert.match(loader, /^import "server-only";/);
  assert.doesNotMatch(loader, /prisma|executePressRag|runAgent|fetch\(|process\.env/);
});

test("the client has deterministic local controls and no live or mutating access", async () => {
  const client = await source("components/demo/PressRagTestDemo.tsx");
  assert.match(client, /^"use client";/);
  assert.match(client, /aria-pressed/);
  assert.match(client, /<label[^>]*htmlFor=/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /기록된 비용/);
  assert.match(client, /micro-USD/);
  assert.doesNotMatch(
    client,
    /fetch\(|\/api\/|use server|prisma|DATABASE_URL|OPENAI|process\.env|executePressRag|runAgent|mutation|setTimeout|setInterval/,
  );
});

test("presenter and loader stay detached from runtime executors and mutation services", async () => {
  const combined = `${await source("domain/evaluation/pressRagDemoPresenter.ts")}\n${await source(
    "lib/services/evaluation/loadPressRagDemo.ts",
  )}`;
  assert.doesNotMatch(
    combined,
    /@prisma|PrismaClient|openai|executePressRag|controlledLiveExecutor|pressAgentRuntime|mutationService/,
  );
});
