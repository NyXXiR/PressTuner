import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeChunkRole } from "@prisma/client";

import { resolveAgentKnowledgeRoles } from "./agentKnowledgeRolePolicy";

test("career identifiers select CAREER evidence without relying on model routing", () => {
  assert.deepEqual(
    resolveAgentKnowledgeRoles({ query: "PT-CAREER-001과 PT-CAREER-002 비교" }),
    [KnowledgeChunkRole.CAREER],
  );
});

test("explicit tool roles are deduplicated and take precedence", () => {
  assert.deepEqual(
    resolveAgentKnowledgeRoles({
      query: "작성 규칙",
      requestedRoles: [KnowledgeChunkRole.STYLE_POLICY, KnowledgeChunkRole.STYLE_POLICY],
    }),
    [KnowledgeChunkRole.STYLE_POLICY],
  );
});

test("ordinary factual requests remain FACT scoped", () => {
  assert.deepEqual(resolveAgentKnowledgeRoles({ query: "제품 매출 수치" }), [KnowledgeChunkRole.FACT]);
});
