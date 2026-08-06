import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("the retained static URL mounts the shared Press AI debugger", async () => {
  const page = await source("app/demo/rag-test/page.tsx");
  assert.match(page, /PressAiProcessDebugger/); assert.match(page, /export const dynamic = "force-static"/); assert.match(page, /Press AI 프로세스 디버거/);
  assert.doesNotMatch(page, /PressRagLiveDebugger|PressRagTestDemo|controlled-live/);
});

test("RAG setup supports samples, direct upload, readiness and registry selection", async () => {
  const [debuggerSource, setup, samples] = await Promise.all([source("components/demo/PressAiProcessDebugger.tsx"), source("components/demo/PressAiKnowledgeDocuments.tsx"), source("components/demo/PressAiSampleScenarios.tsx")]);
  assert.match(debuggerSource, /fetchPressAiKnowledgeDocuments/); assert.match(debuggerSource, /selectedIds\.length === 0/); assert.match(debuggerSource, /5_000/);
  assert.match(setup, /accept="application\/pdf,\.pdf"/); assert.match(setup, /readinessReason/); assert.match(setup, /수동 새로고침/);
  assert.match(samples, /팀에 샘플 추가/); assert.match(samples, /예상 결과/);
});

test("registry-driven nodes refresh durable details and abort stale requests", async () => {
  const [viewer, detail] = await Promise.all([source("components/demo/PressAiProcessWorkflowViewer.tsx"), source("components/demo/PressAiProcessNodeDetail.tsx")]);
  assert.match(viewer, /getPressAiProcessDefinition/); assert.match(viewer, /PressAiProcessNodeDetail/); assert.doesNotMatch(viewer, /const\s+(STEPS|STAGES)/);
  assert.match(detail, /fetchPressAiProcessDetail/); assert.match(detail, /controller\.abort\(\)/); assert.match(detail, /다음 확인/);
});
