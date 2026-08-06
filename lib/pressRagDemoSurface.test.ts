import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
async function source(path: string) { return readFile(new URL(path, ROOT), "utf8"); }

test("the demo remains public, static, and server-projected", async () => {
  const [proxy, page, loader] = await Promise.all([
    source("proxy.ts"), source("app/demo/rag-test/page.tsx"), source("lib/services/evaluation/loadPressRagDemo.ts"),
  ]);
  assert.match(proxy, /"\/demo\/:path\*"/);
  assert.match(page, /export const dynamic = "force-static"/);
  assert.match(page, /loadPressRagDemo\(\)/);
  assert.match(page, /변경값만 브라우저에서 로컬 판정/);
  assert.match(page, /새 검색, 답변 생성, 모델\/API 호출은 없습니다/);
  assert.match(loader, /^import "server-only";/);
  assert.deepEqual([...loader.matchAll(/"(evals\/press-rag\/controlled-live\/[^"]+\.json)"/g)].map(([, path]) => path), [
    "evals/press-rag/controlled-live/dataset-v4.approved.json",
    "evals/press-rag/controlled-live/results/baseline-v1.json",
    "evals/press-rag/controlled-live/results/candidate-v3-optimized.json",
  ]);
  assert.doesNotMatch(`${page}\n${loader}`, /prisma|executePressRag|runAgent|fetch\(|process\.env/);
});

test("execution identity is persistent and disclaims artifact-wide timestamps", async () => {
  const [demo, identity] = await Promise.all([
    source("components/demo/PressRagTestDemo.tsx"), source("components/demo/PressRagExecutionIdentityStrip.tsx"),
  ]);
  for (const value of ["scenarioLabel", "caseId", "partition", "repetitionIndex", "repetitionCount", "artifact.artifact", "artifact.startedAt", "artifact.completedAt", "Asia/Seoul"]) assert.match(identity, new RegExp(value.replace(".", "\\.")));
  assert.match(identity, /아티팩트 전체 실행 기간/);
  assert.match(identity, /개별 반복의 실행 시각이 아니라 아티팩트 전체 수집 기간입니다/);
  assert.match(identity, /aria-label="기록 구성 선택"/);
  assert.match(demo, /scenarioLabel=\{scenario\.label\}/);
  assert.match(demo, /partition=\{scenario\.partition\}/);
  assert.match(demo, /key=\{`\$\{scenario\.caseId\}-\$\{selectedRun\.runIndex\}`\}/);
});

test("the workbench has seven node-only stages and simultaneous recorded/test status", async () => {
  const [viewer, workflow] = await Promise.all([
    source("components/demo/PressRagWorkflowViewer.tsx"), source("domain/evaluation/pressRagWorkflowView.ts"),
  ]);
  assert.match(workflow, /PRESS_RAG_WORKFLOW_STAGE_IDS = \[[\s\S]*?"terminal-evaluation"/);
  const stageBlock = workflow.match(/PRESS_RAG_WORKFLOW_STAGE_IDS = \[([\s\S]*?)\] as const/)?.[1] ?? "";
  assert.equal([...stageBlock.matchAll(/"[^"]+"/g)].length, 7);
  assert.match(viewer, /aria-label="워크플로 7단계"/);
  assert.match(viewer, /recorded\.workflow\.nodes\.map/);
  assert.match(viewer, /lg:grid-cols-7/);
  assert.match(viewer, /tabIndex=\{selected \? 0 : -1\}/);
  assert.match(viewer, /aria-current=/);
  assert.match(viewer, /resolvePressRagWorkflowNavigationIndex/);
  assert.match(viewer, /기록 \$\{STATUS_COPY\[node\.status\]\.label\}/);
  assert.match(viewer, /테스트 \$\{STATUS_COPY\[testedNode\.status\]\.label\}/);
  assert.doesNotMatch(viewer, /kind: "edge"|select\(\{ kind: "edge"|기록\/테스트 표시 전환|기록 그대로|내 테스트 반영/);
  assert.doesNotMatch(viewer, /overflow-x-auto/);
});

test("immutable original failure or mismatch remains visible beside tested terminal state", async () => {
  const header = await source("components/demo/PressRagWorkflowVerdictHeader.tsx");
  assert.match(header, /recordedOutcome\.status === "FAILED"/);
  assert.match(header, /!originalFailure && recordedTerminal\.status === "MISMATCH"/);
  assert.match(header, /원본 실행 실패/);
  assert.match(header, /원본 기대 불일치/);
  assert.match(header, /기록 최종 판정/);
  assert.match(header, /테스트 최종 판정/);
  assert.match(header, /onSelectNode\(firstBroken\.id\)/);
});

test("comparison is simultaneous, ordered, and reports exact parity or explicit deltas", async () => {
  const [viewer, component, projection] = await Promise.all([
    source("components/demo/PressRagWorkflowViewer.tsx"),
    source("components/demo/PressRagStageComparison.tsx"),
    source("domain/evaluation/pressRagWorkflowComparison.ts"),
  ]);
  assert.match(viewer, /projectPressRagWorkflowComparison\(recorded, testResult, selectedStageId\)/);
  assert.match(component, /기록\/테스트 비교/);
  assert.match(component, /변경 없음 \(기록과 정확히 동일\)/);
  assert.match(component, /변경된 값과 판정/);
  assert.match(projection, /const SECTIONS[^\n]*\["input", "evidence", "decisions", "output"\]/);
  assert.match(projection, /source === selectedStageId/);
  assert.match(projection, /traversal: edge\.state/);
  assert.match(projection, /gateVerdict/);
});

test("editing copy, cumulative calculation, validation, and reset are explicit", async () => {
  const [viewer, panel] = await Promise.all([
    source("components/demo/PressRagWorkflowViewer.tsx"), source("components/demo/PressRagWorkflowSandboxPanel.tsx"),
  ]);
  assert.match(panel, /편집 가능/);
  assert.match(panel, /변경값으로 로컬 판정 계산/);
  assert.match(panel, /기록된 값만 다시 계산합니다\. 새 검색, 답변 생성, 모델\/API 호출은 없습니다\./);
  assert.match(panel, /테스트 초기화/);
  assert.match(panel, /고급 JSON \(읽기 전용\)/);
  assert.match(viewer, /const cumulative = testResult \?\? recorded/);
  assert.match(viewer, /current: testResult/);
  assert.match(viewer, /setTestResult\(null\)/);
  assert.match(viewer, /setRunErrors\(\[\]\)/);
  assert.match(viewer, /setRunReport\(null\)/);
  assert.match(viewer, /setDrafts/);
  assert.match(viewer, /로컬 판정을 계산했습니다/);
});

test("transitions, guardrails, provenance hashes, and JSON are collapsed details", async () => {
  const [viewer, panel, demo] = await Promise.all([
    source("components/demo/PressRagWorkflowViewer.tsx"), source("components/demo/PressRagWorkflowSandboxPanel.tsx"), source("components/demo/PressRagTestDemo.tsx"),
  ]);
  assert.match(viewer, /<details[\s\S]*선택 단계 전이와 가드레일 상세/);
  assert.match(viewer, /기록 진행/);
  assert.match(viewer, /기록 전이 규칙/);
  assert.match(viewer, /PRESS_RAG_GUARDRAIL_IDS\.length/);
  assert.match(viewer, /<details[\s\S]*provenance · hashes와 안전한 참조/);
  assert.match(panel, /<details[\s\S]*고급 JSON \(읽기 전용\)/);
  assert.match(demo, /소스 구성 기록 비교 \(Baseline\/Candidate\)/);
  assert.match(demo, /데이터 출처와 기록 신원/);
});

test("client workbench introduces no live, persistence, or mutation dependency", async () => {
  const paths = [
    "components/demo/PressRagTestDemo.tsx", "components/demo/PressRagWorkflowViewer.tsx",
    "components/demo/PressRagExecutionIdentityStrip.tsx", "components/demo/PressRagStageComparison.tsx",
    "components/demo/PressRagWorkflowSandboxPanel.tsx", "domain/evaluation/pressRagWorkflowComparison.ts",
  ];
  const combined = (await Promise.all(paths.map(source))).join("\n");
  assert.doesNotMatch(combined, /fetch\(|\/api\/|use server|@prisma|PrismaClient|DATABASE_URL|OPENAI|process\.env|executePressRag|runAgent|LangSmith|server action/i);
});
