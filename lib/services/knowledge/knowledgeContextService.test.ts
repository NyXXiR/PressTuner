import assert from "node:assert/strict";
import test from "node:test";

import { loadKnowledgeContexts } from "./knowledgeContextService";

test("fact and style roles load separately and examples are labeled non-factual", async () => {
  const calls: string[][] = [];
  const result = await loadKnowledgeContexts(
    { teamId: "team-1", query: "launch" },
    (async ({ roles }: any) => {
      calls.push(roles);
      return {
        context: `${roles[0]} context`,
        citations: [],
        hits: [],
      };
    }) as any,
  );
  assert.deepEqual(calls, [["FACT"], ["STYLE_POLICY"], ["STYLE_EXAMPLE"]]);
  assert.equal(result.facts, "FACT context");
  assert.equal(result.stylePolicy, "STYLE_POLICY context");
  assert.match(result.styleExamples, /NON-FACTUAL[\s\S]*STYLE_EXAMPLE context/);
});
