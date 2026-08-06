import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(path, "utf8");

test("the retained URL exposes the Press AI process debugger and Korean scenario expectations", async () => {
  const [page, debuggerSource, samples] = await Promise.all([source("app/demo/rag-test/page.tsx"), source("components/demo/PressAiProcessDebugger.tsx"), source("components/demo/PressAiSampleScenarios.tsx")]);
  assert.match(page, /Press AI 프로세스 디버거/); assert.match(page, /PressAiProcessDebugger/);
  assert.match(samples, /예상 결과/); assert.match(samples, /팀에 샘플 추가/); assert.match(samples, /이 시나리오로 설정/);
  assert.match(debuggerSource, /processId: "press-creation"/); assert.match(debuggerSource, /acknowledgedQuotaAndArticleCreation/);
});

test("upload and viewer use production contracts instead of local topology arrays", async () => {
  const [upload, viewer, creation] = await Promise.all([source("lib/pressAiProcessDebuggerClient.ts"), source("components/demo/PressAiProcessWorkflowViewer.tsx"), source("components/demo/PressAiCreationSetup.tsx")]);
  assert.match(upload, /body\.set\("file", file\)/); assert.doesNotMatch(upload, /multipart\/form-data/);
  assert.match(viewer, /getPressAiProcessDefinition/); assert.doesNotMatch(viewer, /const\s+(?:STAGES|STEPS)\s*=/); assert.doesNotMatch(viewer, /nodes\.length\s*[=!]==?\s*\d/);
  assert.match(creation, /실제 문서가 생성/); assert.match(creation, /selectedNoteIds/); assert.match(creation, /\/press\/\$\{encodeURIComponent/);
});

test("generic routes stay thin and delegate execution and persistence", async () => {
  const route = await source("app/api/press/agent/process-debug-runs/route.ts");
  assert.match(route, /startProcessDebugRun/); assert.match(route, /requireTeamContext/); assert.doesNotMatch(route, /prisma\./); assert.match(route, /no-store/);
});

