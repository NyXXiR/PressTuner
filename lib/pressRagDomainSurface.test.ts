import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const activePressFiles = [
  "lib/services/articleService.ts",
  "lib/services/press/pressService.ts",
  "lib/services/pressReviewService.ts",
  "lib/llm/articleGenerator.ts",
  "app/api/articles/[id]/generate/route.ts",
  "app/api/press/[id]/review/route.ts",
  "app/api/press/[id]/save/route.ts",
  "components/press/PressGenerator.tsx",
  "components/press/SimplifiedPressFlow.tsx",
  "stores/usePressGeneratorStore.ts",
];

test("the active press flow does not depend on the legacy StyleGuide surface", () => {
  const forbidden = [
    "styleCompiler",
    "styleGuideService",
    "styleSignalService",
    "TeamStyleGuidePanel",
    "styleNotice",
    "/api/style-guides/",
  ];

  for (const file of activePressFiles) {
    const source = readFileSync(join(root, file), "utf8");
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `${file} contains ${token}`);
    }
  }
});

test("legacy team StyleGuide navigation redirects to team knowledge", () => {
  const page = readFileSync(
    join(root, "app/(dashboard)/team/style-guide/page.tsx"),
    "utf8",
  );
  const nav = readFileSync(join(root, "lib/constants/nav.ts"), "utf8");
  const nextSteps = readFileSync(
    join(root, "components/article/NextSteps.tsx"),
    "utf8",
  );

  assert.match(page, /redirect\(["']\/team\/knowledge["']\)/);
  assert.doesNotMatch(nav, /\/team\/style-guide/);
  assert.doesNotMatch(nextSteps, /\/team\/style-guide/);
});

test("every simplified FINAL action exposes the explicit verification step", () => {
  const flow = readFileSync(
    join(root, "components/press/SimplifiedPressFlow.tsx"),
    "utf8",
  );

  assert.match(flow, /PressVerificationPanel,/);
  assert.match(
    flow,
    /<PressVerificationPanel\s+articleId=\{result\.articleId\}/,
  );
  assert.match(flow, /status:\s*"FINAL"/);
});

test("simplified press confirmation preserves the memo and exposes both event and publication times", () => {
  const flow = readFileSync(
    join(root, "components/press/SimplifiedPressFlow.tsx"),
    "utf8",
  );
  const candidates = readFileSync(
    join(root, "components/press/BriefEvidenceCandidates.tsx"),
    "utf8",
  );

  assert.match(flow, /처음 입력한 메모/);
  assert.match(flow, /\{rawText\}/);
  assert.match(flow, /행사\/출시 일시/);
  assert.match(flow, /보도자료 게시 일시/);
  assert.match(flow, /value=\{brief\.publishAt\}/);
  assert.match(candidates, /팀 문서에서 찾은 근거 제안/);
  assert.match(candidates, /선택하지 않은 문서 내용은 초안에\s+전달되지 않습니다/);
});

test("editing a verified draft refreshes verification and disables stale FINAL actions", () => {
  const panel = readFileSync(
    join(root, "components/press/PressVerificationPanel.tsx"),
    "utf8",
  );
  const reviewFlow = readFileSync(
    join(root, "components/press/SimplifiedPressReviewFlow.tsx"),
    "utf8",
  );

  assert.match(panel, /refreshKey\?:/);
  assert.match(panel, /onStateChange\?:/);
  assert.match(panel, /onStateChange\?\.\(/);
  assert.match(
    reviewFlow,
    /refreshKey=\{`\$\{saveState\}:\$\{verificationRefreshKey\}`\}/,
  );
  assert.match(reviewFlow, /onStateChange=\{setVerificationState\}/);
  assert.match(
    reviewFlow,
    /disabled=\{completing \|\| reviewing \|\| !verificationFinalizable\}/,
  );
});
