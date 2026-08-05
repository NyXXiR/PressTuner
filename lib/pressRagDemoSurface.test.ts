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
  assert.match(viewer, /aria-label=\{`\$\{node\.label\}: \$\{STATE_COPY\[node\.status\]\}/);
  assert.match(viewer, /tabIndex=\{isSelected \? 0 : -1\}/);
  assert.match(viewer, /aria-current=/);
  assert.match(viewer, /aria-controls="guardrail-panel"/);
  assert.match(viewer, /onKeyDown=/);
  assert.match(viewer, /resolvePressRagWorkflowNavigationIndex/);
  assert.match(viewer, /scrollIntoView/);
  assert.match(viewer, /focus-visible:/);
  assert.match(viewer, /aria-live="polite"/);
  assert.match(viewer, /이전 상태/);
  assert.match(viewer, /다음 상태/);
  assert.match(viewer, /disabled=\{nodeIndex <= 0\}/);
  assert.match(viewer, /disabled=\{nodeIndex === workflow\.nodes\.length - 1\}/);
  assert.match(viewer, /role="status"/);
  assert.match(viewer, /workflow\.summary\.recordedExecutionRef/);
  assert.match(viewer, /edge\.decisionLabel/);
  assert.match(viewer, /edge\.state/);
  assert.doesNotMatch(
    viewer,
    /fetch\(|\/api\/|use server|prisma|DATABASE_URL|OPENAI|process\.env|executePressRag|runAgent|mutation|setTimeout|setInterval|reactflow|react-flow|@xyflow|d3|cytoscape/,
  );
});

test("the graph keeps every state visible and makes edges selectable", async () => {
  const viewer = await source("components/demo/PressRagWorkflowViewer.tsx");

  // Nodes and edges wrap instead of scrolling sideways, so no state hides off-screen.
  assert.match(viewer, /flex-wrap/);
  assert.doesNotMatch(viewer, /overflow-x-auto/);

  // A transition condition is itself a guardrail judgment, so edges are selectable too.
  assert.match(viewer, /setSelection\(\{ kind: "edge", id: edge\.id \}\)/);
  assert.match(viewer, /setSelection\(\{ kind: "node", id: node\.id \}\)/);
  assert.match(viewer, /guardrails\.byEdge\[selection\.id\]/);
  assert.match(viewer, /guardrails\.byNode\[selection\.id\]/);
});

test("the selected node or edge drives five fixed guardrail lanes", async () => {
  const viewer = await source("components/demo/PressRagWorkflowViewer.tsx");
  const guardrails = await source("domain/evaluation/pressRagGuardrails.ts");

  assert.match(viewer, /PRESS_RAG_GUARDRAIL_IDS/);
  assert.match(viewer, /results\.map\(\(result\) => \(/);
  assert.match(viewer, /<GuardrailLane/);
  // Each lane states the rule, the expectation, what was observed, and why it was judged.
  for (const field of ["result.label", "result.rule", "result.expected", "result.observed", "result.reason"]) {
    assert.match(viewer, new RegExp(field.replace(".", "\\.")));
  }
  assert.match(viewer, /재검증/);
  assert.match(viewer, /전이 조건/);

  // The five guardrails match the recorded execution summary vocabulary.
  for (const id of [
    "evidence-use", "citation-claim-verification", "forbidden-source-protection",
    "expected-tool-behavior", "safe-fallback",
  ]) {
    assert.match(guardrails, new RegExp(`"${id}"`));
  }
  assert.match(guardrails, /press-rag-guardrail-view\/v1/);
  assert.doesNotMatch(guardrails, /fetch\(|process\.env|prisma|server-only/);
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
