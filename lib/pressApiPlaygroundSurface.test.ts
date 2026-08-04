import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("production press surfaces share the browser-safe Press API client", () => {
  const store = source("stores/usePressGeneratorStore.ts");
  const flow = source("components/press/SimplifiedPressFlow.tsx");
  const verification = source("components/press/PressVerificationPanel.tsx");
  const client = source("lib/press/pressFlowApiClient.ts");
  const orchestration = source("lib/press/pressFlowOrchestration.ts");

  assert.match(store, /createPressFlowApiClient/);
  assert.match(store, /fetch:\s*fetchWithLoading/);
  assert.match(store, /normalizeSimplifiedPressFlow/);
  assert.match(store, /generateSimplifiedPressFlow/);
  assert.doesNotMatch(store, /["'`]\/api\/articles\/init/);
  assert.doesNotMatch(store, /brief\/normalize/);
  assert.doesNotMatch(store, /\/generate/);
  assert.match(flow, /updateStatus/);
  assert.doesNotMatch(flow, /fetch\(`\/api\/articles\/\$\{targetId\}\/status/);
  assert.match(verification, /readVerification/);
  assert.match(verification, /runVerification/);
  assert.doesNotMatch(verification, /fetch\(/);
  assert.doesNotMatch(client, /@prisma|lib\/services|zustand|process\.env|node:/);
  assert.match(orchestration, /quotaMode:\s*"simplified"/);
});

test("the playground is independently env-gated and team-admin gated", () => {
  const proxy = source("proxy.ts");
  const page = source("app/(dashboard)/dev/api-playground/page.tsx");
  const gate = source("lib/devApiPlayground.ts");
  const nav = source("app/(dashboard)/admin/AdminToolNav.tsx");
  const fixtureGet = source("app/api/dev/api-playground/rag/route.ts");
  const fixturePut = source(
    "app/api/dev/api-playground/rag/[domain]/route.ts",
  );
  const autoRoute = source("app/api/auth/qa/auto/route.ts");

  assert.match(gate, /ENABLE_DEV_API_PLAYGROUND/);
  assert.match(gate, /NODE_ENV !== "production"/);
  assert.match(proxy, /DEV_API_PLAYGROUND_ENABLED/);
  assert.match(proxy, /pathname === "\/dev\/api-playground"/);
  assert.match(proxy, /isDisabledDevToolApiPath/);
  assert.match(proxy, /DEV_BILLING_SANDBOX_ENABLED/);
  assert.match(page, /assertDevApiPlaygroundEnabled/);
  assert.match(page, /isDevApiPlaygroundAutoSessionEligible/);
  assert.match(page, /requireTeamContext/);
  assert.match(page, /isAdmin\(role\)/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /redirect\("\/api\/auth\/qa\/auto"\)/);
  assert.match(page, /\/login\?next=/);
  assert.match(proxy, /new URL\("\/api\/auth\/qa\/auto"/);
  assert.match(autoRoute, /PLAYGROUND_PATH = "\/dev\/api-playground"/);
  assert.match(autoRoute, /isDevApiPlaygroundAutoSessionEligible/);
  assert.doesNotMatch(autoRoute, /searchParams|get\("next"\)|teamId|userId|teamSlug|loginId/);
  assert.match(nav, /isDevApiPlaygroundEnabled/);
  assert.match(nav, /\/dev\/api-playground/);
  for (const route of [fixtureGet, fixturePut]) {
    assert.match(route, /assertDevApiPlaygroundEnabled/);
    assert.match(route, /requireTeamContext/);
    assert.match(route, /isAdmin\(role\)/);
  }
  assert.match(fixturePut, /parseDevRagFixtureMutation/);
  assert.match(fixturePut, /parseDevRagFixtureDomain/);
});

test("the playground exposes traces and scoped fixtures without a bypass or deletion", () => {
  const client = source(
    "app/(dashboard)/dev/api-playground/PressApiPlaygroundClient.tsx",
  );
  const inspection = source(
    "app/(dashboard)/dev/api-playground/PressDomainInspectionMode.tsx",
  );
  const parity = source(
    "app/(dashboard)/dev/api-playground/PressScreenParityMode.tsx",
  );
  const allFiles = [
    source("lib/press/pressFlowApiClient.ts"),
    source("lib/devRagFixtureApiClient.ts"),
    client,
    inspection,
    parity,
    source("app/(dashboard)/dev/api-playground/page.tsx"),
    source("app/api/dev/api-playground/rag/route.ts"),
    source("app/api/dev/api-playground/rag/[domain]/route.ts"),
  ].join("\n");

  assert.match(client, /useState<Mode>\("screen-parity"\)/);
  assert.match(client, /Screen parity/);
  assert.match(client, /Domain inspection/);
  assert.match(parity, /SimplifiedPressFlow/);
  assert.match(inspection, /Initialize real draft/);
  assert.match(inspection, /Clear local history/);
  assert.match(inspection, /setHistory\(\[\]\)/);
  assert.match(inspection, /window\.confirm/);
  assert.match(inspection, /confirmation/);
  assert.match(inspection, /CURRENT/);
  assert.match(inspection, /PASS|WARN/);
  assert.match(inspection, /decideGroundingCandidate/);
  assert.match(client, /RagFixtureCard/);
  assert.doesNotMatch(allFiles, /method:\s*["']DELETE["']/);
  assert.doesNotMatch(allFiles, /authBypass|skipAuth|resetDatabase|quotaOverride/);
  assert.doesNotMatch(
    source("lib/press/pressFlowApiClient.ts"),
    /\/api\/dev\/api-playground/,
  );
  assert.doesNotMatch(
    source("lib/devRagFixtureApiClient.ts"),
    /teamId|userId|facts|content/,
  );
});

test("production Press candidate decisions use the shared client", () => {
  const store = source("stores/usePressGeneratorStore.ts");
  assert.match(store, /pressFlowApi\.decideGroundingCandidate/);
  assert.doesNotMatch(store, /grounding\/candidates\/\$\{candidateId\}/);
});
