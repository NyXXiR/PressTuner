import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("the grounded Press RAG workflow is discoverable on the current production surface", () => {
  const route = source("app/(dashboard)/press/knowledge/page.tsx");
  const workspace = source("components/press/PressSimplifiedWorkspace.tsx");
  const layout = source("app/(dashboard)/layout.tsx");
  const knowledge = source("app/(dashboard)/team/knowledge/page.tsx");
  const reviewFlow = source("components/press/SimplifiedPressReviewFlow.tsx");
  const rightPanel = source("components/layout/RightPanel.tsx");
  const floatingPanel = source("components/layout/FloatingRightPanelShell.tsx");

  assert.match(route, /TeamKnowledgePage/);
  assert.match(workspace, /label:\s*"근거 문서"/);
  assert.match(workspace, /mobileLabel:\s*"근거"/);
  assert.match(workspace, /href:\s*"\/press\/knowledge"/);
  assert.match(layout, /pathname === "\/press\/knowledge"/);
  assert.match(knowledge, /RAG 피드백 테스트/);
  assert.match(knowledge, /href="\/press\/new"/);
  assert.match(knowledge, /승인/);
  assert.match(reviewFlow, /import\s+\{\s*RightPanel\s*\}/);
  assert.match(reviewFlow, /<RightPanel\s*\/>/);
  assert.match(rightPanel, /mobileEnabled=\{isEditPage\}/);
  assert.match(floatingPanel, /mobileEnabled/);
  assert.match(floatingPanel, /mobileEnabled \? "block" : "hidden lg:block"/);
});

test("the feedback route uses existing session protection without exposing legacy team routes", () => {
  const proxy = source("proxy.ts");

  assert.match(proxy, /pathname\.startsWith\("\/team"\)/);
  assert.match(proxy, /pathname\.startsWith\("\/press"\)/);
  assert.match(proxy, /"\/press\/:path\*"/);
  assert.doesNotMatch(proxy, /press\/knowledge/);
});

test("the Press AI panel starts closed and does not persist an open overlay", () => {
  const store = source("stores/rightPanelStore.tsx");
  assert.match(store, /isOpen:\s*false/);
  assert.doesNotMatch(store, /zustand\/middleware/);
  assert.doesNotMatch(store, /ui:rightPanel/);
});

test("knowledge lifecycle controls, quotas, replacement, and authorized sources are exposed", () => {
  const knowledge = source("app/(dashboard)/team/knowledge/page.tsx");
  const service = source("lib/services/knowledge/knowledgeDocumentService.ts");
  const transaction = source(
    "lib/services/knowledge/knowledgeTransaction.ts",
  );
  const citationService = source(
    "lib/services/knowledge/agentKnowledgeCitationService.ts",
  );
  const retrieval = source("lib/services/knowledge/knowledgeRetrievalService.ts");
  const sourceRoute = source("app/api/knowledge/documents/[id]/source/route.ts");

  assert.match(knowledge, /최근 .*시간 업로드/);
  assert.match(knowledge, /교체/);
  assert.match(knowledge, /삭제/);
  assert.match(transaction, /pg_advisory_xact_lock/);
  assert.match(service, /lockKnowledgeTeam/);
  assert.match(citationService, /lockKnowledgeTeam/);
  assert.match(service, /knowledgeUploadEvent/);
  assert.match(service, /KNOWLEDGE_REPLACEMENT_IDENTICAL/);
  assert.match(service, /archiveOrPurge/);
  assert.match(retrieval, /kd\."deleted_at" IS NULL/);
  assert.match(retrieval, /successor\."status" = 'READY'/);
  assert.match(sourceRoute, /requireTeamContext/);
  assert.match(sourceRoute, /private, no-store/);
  assert.match(sourceRoute, /default-src 'none'/);
});
