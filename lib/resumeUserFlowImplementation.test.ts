import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("resume login keeps resume intent through authentication", () => {
  const login = source("app/login/LoginClient.tsx");

  assert.match(login, /isResumeRedirect/);
  assert.match(login, /자기소개서 초안을 이어서 시작하세요/);
  assert.match(login, /경험과 문항을 안전하게 불러옵니다/);
  assert.match(login, /자기소개서 AI로 돌아가기/);
});

test("resume dashboard labels first-time CTA as experience setup", () => {
  const dashboard = source("app/resume/dashboard/page.tsx");

  assert.match(dashboard, /primaryLabel/);
  assert.match(dashboard, /경험 먼저 추가/);
  assert.match(dashboard, /hasBricks\s*\?\s*writeHref\s*:\s*"\/resume\/bricks\?onboarding=true"/);
});

test("resume first-time write flow offers tutorial and posting-first intake", () => {
  const setupPage = source("app/resume/write/page.tsx");
  const writeRoot = source("app/resume/write/components/WriteFlowRoot.tsx");
  const preview = source("app/resume/write/components/flowPreviewState.ts");
  const intake = source("app/resume/write/components/FlowIntake.tsx");
  const flowApi = source("app/resume/write/components/flowApi.ts");
  const sharedApi = source("lib/resume/resumeWriteFlowApiClient.ts");

  assert.match(setupPage, /tutorial === "1"/);
  assert.match(writeRoot, /presstuner\.resume-write-tutorial-seen:v1/);
  assert.match(preview, /튜토리얼 모드입니다/);
  assert.match(intake, /공고와 문항을 그대로 붙여넣으세요/);
  assert.match(intake, /flow-posting-url/);
  assert.match(intake, /flow-rough-input/);
  assert.match(sharedApi, /\/api\/resume\/intake\/compose/);
  assert.match(sharedApi, /text: input\.rawText/);
  assert.match(sharedApi, /url: input\.postingUrl/);
  assert.match(flowApi, /resumeWriteFlowApi\.organizeIntake/);
  assert.doesNotMatch(flowApi, /\bfetch\(/);
});

test("resume brick listing preserves schema defaults when pagination is omitted", () => {
  const route = source("app/api/resume/bricks/route.ts");

  assert.match(route, /page:\s*searchParams\.get\("page"\)\s*\|\|\s*undefined/);
  assert.match(
    route,
    /pageSize:\s*searchParams\.get\("pageSize"\)\s*\|\|\s*undefined/,
  );
});
