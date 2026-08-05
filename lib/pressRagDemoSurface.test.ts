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
  assert.match(page, /RAG 실행 워크플로 디버거/);
  assert.match(page, /기록 실행 참조는 Ops Console UUID나 공급자 추적 ID가 아니며 서로 조인할 수 없습니다/);
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
  assert.match(client, /viewModel\.scenarios\.map/);
  assert.match(client, /lg:grid-cols-5/);
  assert.doesNotMatch(client, /\.quote\b|<blockquote/);
  assert.match(client, /근거 좌표/);
});

test("the workflow viewer exposes configuration, node, focus, status, and live-detail contracts", async () => {
  const viewer = await source("components/demo/PressRagWorkflowViewer.tsx");

  assert.match(viewer, /^"use client";/);
  assert.match(viewer, /useState<[^>]*>\("candidate"\)/);
  assert.match(viewer, /<button[\s\S]*?type="button"[\s\S]*?aria-pressed=/);
  assert.match(viewer, /aria-label=\{`[^`]*\$\{item\.node\.status\}/);
  assert.match(viewer, /tabIndex=\{item\.node\.id === selectedNode\.id \? 0 : -1\}/);
  assert.match(viewer, /aria-current=/);
  assert.match(viewer, /aria-controls=\{`workflow-transition-\$\{item\.node\.id\}`\}/);
  assert.match(viewer, /onKeyDown=/);
  assert.match(viewer, /resolvePressRagWorkflowNavigationIndex/);
  assert.match(viewer, /scrollIntoView/);
  assert.match(viewer, /focus-visible:/);
  assert.match(viewer, /aria-live="polite"/);
  assert.match(viewer, /node\.statusReason/);
  assert.match(viewer, /node\.traversal/);
  assert.match(viewer, /node\.latencyMs === null/);
  assert.match(viewer, /현재 위치/);
  assert.match(viewer, /이전 상태/);
  assert.match(viewer, /다음 상태/);
  assert.match(viewer, /disabled=\{selectedNodeIndex === 0\}/);
  assert.match(viewer, /disabled=\{selectedNodeIndex === workflow\.nodes\.length - 1\}/);
  assert.match(viewer, /role="status"/);
  assert.match(viewer, /workflow\.summary\.schemaVersion/);
  assert.match(viewer, /workflow\.summary\.recordedExecutionRef/);
  assert.match(viewer, /workflow\.summary\.facts\.map/);
  assert.match(viewer, /graphItems/);
  assert.match(viewer, /item\.edge\.decisionLabel/);
  assert.match(viewer, /item\.edge\.state/);
  assert.doesNotMatch(
    viewer,
    /fetch\(|\/api\/|use server|prisma|DATABASE_URL|OPENAI|process\.env|executePressRag|runAgent|mutation|setTimeout|setInterval|reactflow|react-flow|@xyflow|d3|cytoscape/,
  );
});

test("every recorded state transition stays expanded for debugging", async () => {
  const viewer = await source("components/demo/PressRagWorkflowViewer.tsx");

  // The graph wraps instead of scrolling sideways, so no state can hide off-screen.
  assert.match(viewer, /flex-wrap/);
  assert.doesNotMatch(viewer, /overflow-x-auto/);

  // Each transition renders its own input, transition, output, and guardrail result.
  assert.match(viewer, /workflow\.nodes\.map\(\(node, index\) => \(\s*<TransitionBlock/);
  for (const panel of ["입력", "출력", "정책·가드레일 결정", "근거"]) {
    assert.match(viewer, new RegExp(`title="${panel}"`));
  }
  for (const field of ["input", "output", "decisions", "evidence"]) {
    assert.match(viewer, new RegExp(`node\\.inspection\\.${field}`));
  }
  assert.match(viewer, /전환/);
  assert.match(viewer, /previousLabel/);
  assert.match(viewer, /nextLabel/);
  assert.match(viewer, /incoming\.decisionLabel/);
  assert.match(viewer, /outgoing\.decisionLabel/);
});

test("the versioned contracts use recorded execution terminology and never expose raw operation joins", async () => {
  const identity = await source("domain/evaluation/pressRagRecordedExecutionIdentity.ts");
  const workflow = await source("domain/evaluation/pressRagWorkflowView.ts");
  const presenter = await source("domain/evaluation/pressRagDemoPresenter.ts");

  assert.match(identity, /press-rag-recorded-execution-ref\/v1/);
  assert.match(workflow, /press-rag-workflow-view\/v3/);
  assert.match(workflow, /press-rag-execution-summary\/v1/);
  assert.match(presenter, /recordedExecutionRef/);
  assert.doesNotMatch(`${identity}\n${workflow}`, /publicOperation|operationId|providerTrace/);
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
