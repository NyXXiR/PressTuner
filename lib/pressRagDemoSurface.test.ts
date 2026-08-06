import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("the static demo page mounts only the live authenticated debugger", async () => {
  const page = await source("app/demo/rag-test/page.tsx");
  assert.match(page, /PressRagLiveDebugger/);
  assert.match(page, /export const dynamic = "force-static"/);
  assert.doesNotMatch(page, /PressRagTestDemo|loadPressRagDemo|controlled-live|로컬 예제/);
});

test("live setup requires selectable documents and exposes the two retrieval presets", async () => {
  const [debuggerSource, setup] = await Promise.all([source("components/demo/PressRagLiveDebugger.tsx"), source("components/demo/PressRagLiveTestSetup.tsx")]);
  assert.match(debuggerSource, /fetchPressAgentRagDebuggerDocuments/);
  assert.match(debuggerSource, /selectedDocumentIds\.length === 0/);
  assert.match(setup, /준비된 문서 모두 선택/);
  assert.match(setup, /readinessReason/);
  assert.match(setup, /PRESS_AGENT_RAG_DEBUGGER_RETRIEVAL_PRESETS/);
});

test("selected workflow nodes refresh durable details and abort stale requests", async () => {
  const [viewer, detail] = await Promise.all([
    source("components/demo/PressRagLiveWorkflowViewer.tsx"),
    source("components/demo/PressRagLiveStageDetail.tsx"),
  ]);
  assert.match(viewer, /fetchPressAgentRagDebuggerDetail/);
  assert.match(viewer, /projection\.lastSequence/);
  assert.match(viewer, /controller\.abort\(\)/);
  assert.match(viewer, /PressRagLiveStageDetail/);
  for (const copy of ["검증 전 AI 응답", "주장에 연결한 인용문", "교체되기 전 AI 응답", "사용자에게 전달한 최종 응답"]) {
    assert.match(detail, new RegExp(copy));
  }
});
