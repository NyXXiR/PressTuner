import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(path, "utf8");

test("the retained URL exposes explicit checkpoint execution without a RAG auto-run control", async () => {
  const [page, debuggerSource, workspace, graph, timeline, knowledge] = await Promise.all([source("app/demo/rag-test/page.tsx"), source("components/demo/PressAiProcessDebugger.tsx"), source("components/demo/PressAiAttemptWorkspace.tsx"), source("components/demo/PressAiProcessGraph.tsx"), source("components/demo/PressAiRunTimeline.tsx"), source("components/demo/PressAiKnowledgePanel.tsx")]);
  assert.match(page, /Press AI 프로세스 디버거/); assert.match(page, /PressAiProcessDebugger/);
  assert.match(page, /export const dynamic = "force-static"/); assert.doesNotMatch(page, /PressRagLiveDebugger|PressRagTestDemo|controlled-live/);
  assert.match(debuggerSource, /새 시도 만들기 \(AI 실행 없음\)/); assert.doesNotMatch(debuggerSource, /startPressAiProcessRun|RAG 프로세스 실행/);
  assert.match(graph, /layout\.edges\.map/); assert.match(graph, /markerEnd/); assert.match(graph, /그래프 확대/);
  assert.match(graph, /animateTransform/); assert.match(graph, /RUNNING/);
  assert.match(workspace, /aria-labelledby="press-ai-process-graph-heading"/);
  assert.doesNotMatch(workspace, /<details className="mb-4 min-w-0 rounded-xl border border-border">/);
  assert.match(debuggerSource, /PressAiKnowledgePanel/);
  assert.match(knowledge, /샘플 마운트/); assert.match(knowledge, /언마운트/);
  assert.match(timeline, /보이는 순서형 실행 타임라인/); assert.doesNotMatch(timeline, /sr-only/);
  assert.match(timeline, /timelineRows/); assert.match(timeline, /GuardrailChip/);
});

test("the run action bar is the single home for the next command", async () => {
  const [bar, progress, workspace, timeline, edge] = await Promise.all([
    source("components/demo/PressAiRunActionBar.tsx"),
    source("components/demo/pressAiRunProgress.ts"),
    source("components/demo/PressAiAttemptWorkspace.tsx"),
    source("components/demo/PressAiRunTimeline.tsx"),
    source("components/demo/PressAiEdgeInspector.tsx"),
  ]);
  assert.match(bar, /sticky/); assert.match(bar, /다음 단계/);
  assert.match(progress, /export function nextAction/);
  for (const kind of ["execute", "rewrite", "advance", "retry"]) assert.match(bar, new RegExp(`"${kind}"`));
  // Advancing, executing and acknowledging gates must not reappear outside the bar.
  assert.doesNotMatch(timeline, /다음 노드 활성화|이 노드만 실행|onAdvance/);
  assert.doesNotMatch(edge, /다음 노드 활성화|onAdvance/);
  assert.match(workspace, /PressAiRunActionBar/); assert.match(workspace, /nextAction\(attempt\)/);
});

test("the debugger UI reads its topology from the registry, never a local copy", async () => {
  const sources = await Promise.all([
    source("components/demo/PressAiRunTimeline.tsx"),
    source("components/demo/PressAiRunActionBar.tsx"),
    source("components/demo/pressAiRunProgress.ts"),
    source("components/demo/PressAiEdgeInspector.tsx"),
  ]);
  for (const file of sources) {
    assert.doesNotMatch(file, /const\s+(?:STAGES|STEPS|NODES|EDGES)\s*=/);
    assert.doesNotMatch(file, /nodes\.length\s*[=!]==?\s*\d/);
  }
  assert.match(sources[2], /pressCreationProcess\.nodes/); assert.match(sources[2], /pressCreationProcess\.edges/);
});

test("legacy generic route remains available for RAG-v1 replay", async () => {
  const route = await source("app/api/press/agent/process-debug-runs/route.ts");
  assert.match(route, /startProcessDebugRun/); assert.match(route, /requireTeamContext/); assert.doesNotMatch(route, /prisma\./); assert.match(route, /no-store/);
});

test("checkpoint UI exposes review selection, immutable retry navigation, history, comparison, and additive expectations", async () => {
  const [debuggerSource, workspace, hook, history, comparison, cases, edge, timeline] = await Promise.all([
    source("components/demo/PressAiProcessDebugger.tsx"),
    source("components/demo/PressAiAttemptWorkspace.tsx"),
    source("components/demo/usePressAiCheckpointDebugger.ts"),
    source("components/demo/PressAiAttemptHistory.tsx"),
    source("components/demo/PressAiAttemptComparison.tsx"),
    source("components/demo/PressAiCasePanel.tsx"),
    source("components/demo/PressAiEdgeInspector.tsx"),
    source("components/demo/PressAiRunTimeline.tsx"),
  ]);
  assert.match(workspace, /반영할 리뷰 노트 선택/);
  assert.match(workspace, /selectedNoteIds/);
  assert.match(workspace, /저장된 시도 · 완료 체크포인트 보존/);
  for (const label of ["새 입력으로 시작", "같은 입력으로 처음부터", "이 단계부터 분기"]) {
    assert.match(workspace, new RegExp(label));
  }
  for (const label of ["시도 ID", "상태", "생성 시각", "부모 시도", "시작 노드", "리비전"]) {
    assert.match(workspace, new RegExp(label));
  }
  assert.match(workspace, /<dl/);
  assert.match(workspace, /<time dateTime=/);
  assert.match(workspace, /getCompletedRetryCheckpoints/);
  assert.match(debuggerSource, /<PressAiAttemptWorkspace[\s\S]*key=\{attempt\.id\}/);
  assert.match(debuggerSource, /debuggerState\.clear\(\)/);
  assert.match(hook, /withAttemptParam\(window\.location\.search, attemptId\)/);
  assert.match(hook, /clear[\s\S]*replaceAttemptUrl\(null\)/);
  assert.match(hook, /loadToken\.current/);
  assert.match(hook, /selectAttempt/);
  assert.match(hook, /selectedAttemptId\.current !== nextAttempt\.id[\s\S]*commands\.current\.clear\(\)/);
  assert.match(hook, /if \(token === loadToken\.current\)[\s\S]*setError/);
  assert.match(history, /fetchPressAiCheckpointAttemptHistory/);
  assert.match(comparison, /fetchPressAiCheckpointComparison/);
  assert.match(cases, /필수 가드레일은 그대로 두고/);
  assert.match(cases, /기대값 추가/);
  for (const state of ["UNTESTED", "UNPROVEN", "DETECTED", "VERIFIED"]) assert.match(cases, new RegExp(state));
  assert.match(cases, /필수 가드레일 · 읽기 전용/);
  assert.match(cases, /guardrailLabelKo/);
  assert.match(cases, /formIdentity/);
  assert.match(cases, /PressAiCasePanelForm key=\{formIdentity\}/);
  assert.match(cases, /sameExpectationDefinition/);
  assert.match(cases, /createCaseExpectationRow\(edgeId\)/);
  assert.doesNotMatch(cases, /필수 가드레일[\s\S]{0,200}삭제/);
  assert.match(hook, /fetchPressAiDebugCase/);
  assert.match(hook, /nextAttempt\.caseId/);
  assert.match(workspace, /id="press-ai-branch-checkpoint"/);
  assert.doesNotMatch(edge, /다시 시작할 노드|새 시도로 다시 실행|onRetry/);
  assert.doesNotMatch(timeline, /onRetry/);
});

test("the attempt key contains all attempt-local interactive descendants", async () => {
  const [debuggerSource, workspace, bar] = await Promise.all([
    source("components/demo/PressAiProcessDebugger.tsx"),
    source("components/demo/PressAiAttemptWorkspace.tsx"),
    source("components/demo/PressAiRunActionBar.tsx"),
  ]);
  assert.match(debuggerSource, /<PressAiAttemptWorkspace[\s\S]*key=\{attempt\.id\}/);
  for (const state of ["selectedNoteIds", "rewriteInstruction", "selectedKey", "openRows", "branchNodeId"]) {
    assert.match(workspace, new RegExp(`\\[${state},`));
  }
  for (const descendant of ["PressAiRunActionBar", "PressAiProcessGraph", "PressAiRunTimeline", "PressAiSidePanels"]) {
    assert.match(workspace, new RegExp(descendant));
  }
  assert.match(bar, /edge and attempt identity|edge와 시도 정체성/);
});
