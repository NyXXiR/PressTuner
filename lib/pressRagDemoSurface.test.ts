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

test("the accessible workflow viewer is ordered before comparison cards and resets by recorded selection", async () => {
  const client = await source("components/demo/PressRagTestDemo.tsx");
  const viewerPosition = client.indexOf("<PressRagWorkflowViewer");
  const comparisonPosition = client.indexOf("기록 결과 비교");

  assert.ok(viewerPosition > 0);
  assert.ok(comparisonPosition > viewerPosition);
  assert.match(client, /key=\{`\$\{scenario\.caseId\}-\$\{selectedRun\.runIndex\}`\}/);
  assert.match(client, /baseline=\{selectedRun\.baseline\}/);
  assert.match(client, /candidate=\{selectedRun\.candidate\}/);
  assert.match(client, /expectation=\{scenario\.expectation\}/);
  assert.match(client, /prompt=\{scenario\.prompt\}/);
});

test("the workflow viewer exposes configuration, node, focus, status, and live-detail contracts", async () => {
  const viewer = await source("components/demo/PressRagWorkflowViewer.tsx");

  assert.match(viewer, /^"use client";/);
  assert.match(viewer, /useState<[^>]*>\("candidate"\)/);
  assert.match(viewer, /<button[\s\S]*?type="button"[\s\S]*?aria-pressed=/);
  assert.match(viewer, /aria-label=\{`[^`]*\$\{node\.status\}/);
  assert.match(viewer, /aria-pressed=\{node\.id === selectedNodeId\}/);
  assert.match(viewer, /focus-visible:/);
  assert.match(viewer, /aria-live="polite"/);
  assert.match(viewer, /selectedNode\.statusReason/);
  assert.match(viewer, /selectedNode\.traversal/);
  assert.match(viewer, /selectedNode\.latencyMs === null/);
  assert.match(viewer, /현재 위치/);
  assert.match(viewer, /이전 상태/);
  assert.match(viewer, /다음 상태/);
  assert.match(viewer, /입력/);
  assert.match(viewer, /근거와 판정/);
  assert.match(viewer, /출력/);
  assert.match(viewer, /selectedNode\.inspection\.input/);
  assert.match(viewer, /selectedNode\.inspection\.evidence/);
  assert.match(viewer, /selectedNode\.inspection\.output/);
  assert.match(viewer, /disabled=\{selectedNodeIndex === 0\}/);
  assert.match(viewer, /disabled=\{selectedNodeIndex === workflow\.nodes\.length - 1\}/);
  assert.match(viewer, /role="status"/);
  assert.doesNotMatch(
    viewer,
    /fetch\(|\/api\/|use server|prisma|DATABASE_URL|OPENAI|process\.env|executePressRag|runAgent|mutation|setTimeout|setInterval|reactflow|react-flow|@xyflow|d3|cytoscape/,
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
