import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("production Resume flow and playground share the injectable client", () => {
  const wrapper = source("app/resume/write/components/flowApi.ts");
  const hook = source("app/resume/write/components/useWriteFlow.ts");
  const playground = source(
    "app/(dashboard)/dev/api-playground/ResumeApiPlaygroundClient.tsx",
  );
  const parity = source(
    "app/(dashboard)/dev/api-playground/ResumeScreenParityMode.tsx",
  );
  const inspection = source(
    "app/(dashboard)/dev/api-playground/ResumeDomainInspectionMode.tsx",
  );
  const orchestration = source(
    "lib/resume/resumeWriteFlowOrchestration.ts",
  );
  const client = source("lib/resume/resumeWriteFlowApiClient.ts");

  assert.match(wrapper, /createResumeWriteFlowApiClient/);
  assert.match(wrapper, /resumeWriteFlowApi/);
  assert.match(hook, /resumeWriteFlowApi/);
  assert.match(playground, /useState<Mode>\("screen-parity"\)/);
  assert.match(playground, /Screen parity/);
  assert.match(playground, /Domain inspection/);
  assert.match(parity, /WriteFlowRoot/);
  assert.match(inspection, /createResumeWriteFlowApiClient/);
  assert.match(inspection, /writeGroundedCareerAnswer/);
  assert.match(inspection, /completeQuestion/);
  assert.match(inspection, /completeApplication/);
  assert.match(inspection, /nested\?\.answerHash === current\?\.answerHash/);
  assert.match(
    inspection,
    /nested\?\.careerMemoryVersion === current\?\.careerMemoryVersion/,
  );
  assert.match(hook, /startIntakeWithBricks/);
  assert.match(hook, /startWorkspaceWithFirstDraft/);
  assert.match(hook, /saveThenCompleteQuestion/);
  assert.match(hook, /completeReadyApplication/);
  assert.match(orchestration, /Promise\.all/);
  assert.match(orchestration, /expectedAnswerRevision:\s*saved\.answerRevision/);
  assert.match(orchestration, /workspace\.captures\.length/);
  assert.doesNotMatch(orchestration, /workspace\.deferredCaptures\.length/);
  assert.doesNotMatch(inspection, /workspace\.deferredCaptures\.length/);
  assert.doesNotMatch(wrapper, /\bfetch\(/);
  assert.doesNotMatch(hook, /\bfetch\(/);
  assert.doesNotMatch(client, /@prisma|lib\/services|zustand|process\.env|node:/);
  assert.doesNotMatch(client, /\/api\/dev\/api-playground/);
});

test("combined page retains the gate and renders both playgrounds", () => {
  const page = source("app/(dashboard)/dev/api-playground/page.tsx");
  assert.match(page, /assertDevApiPlaygroundEnabled/);
  assert.match(page, /requireTeamContext/);
  assert.match(page, /isAdmin\(role\)/);
  assert.match(page, /PressApiPlaygroundClient/);
  assert.match(page, /ResumeApiPlaygroundClient/);
});
