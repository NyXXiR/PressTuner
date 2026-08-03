import assert from "node:assert/strict";
import test from "node:test";

import {
  generateSimplifiedPressFlow,
  normalizeSimplifiedPressFlow,
  type PressFlowApi,
} from "./pressFlowOrchestration";

function apiDouble() {
  const calls: Array<[string, ...unknown[]]> = [];
  const api = {
    async initializeArticle(input: unknown) {
      calls.push(["initialize", input]);
      return { id: "article-1", articleId: "article-1" };
    },
    async normalizeBrief(articleId: string, input: unknown) {
      calls.push(["normalize", articleId, input]);
      return { normalized: true };
    },
    async generateArticle(articleId: string, input: unknown) {
      calls.push(["generate", articleId, input]);
      return { generated: true };
    },
  } as unknown as PressFlowApi;
  return { api, calls };
}

test("normalize initializes implicitly and sends the exact simplified payload", async () => {
  const { api, calls } = apiDouble();
  const output = await normalizeSimplifiedPressFlow({
    api,
    articleId: null,
    teamId: "team-1",
    brief: { rawText: "brief", tone: "formal" },
  });

  assert.equal(output.articleId, "article-1");
  assert.deepEqual(calls, [
    ["initialize", { type: "PRESS_RELEASE", teamId: "team-1" }],
    [
      "normalize",
      "article-1",
      { rawText: "brief", tone: "formal", quotaMode: "simplified" },
    ],
  ]);
});
test("generate reuses an existing article and forces simplified quota mode", async () => {
  const { api, calls } = apiDouble();
  const output = await generateSimplifiedPressFlow({
    api,
    articleId: "article-existing",
    draft: {
      announceType: "출시",
      points: ["근거"],
      tone: "friendly",
    },
  });

  assert.equal(output.articleId, "article-existing");
  assert.deepEqual(calls, [
    [
      "generate",
      "article-existing",
      {
        announceType: "출시",
        points: ["근거"],
        tone: "friendly",
        quotaMode: "simplified",
      },
    ],
  ]);
});

test("client failures retain their original identity and observed exchange", async () => {
  const observed = { path: "/normalize" };
  const failure = Object.assign(new Error("quota"), { exchange: observed });
  const { api } = apiDouble();
  api.normalizeBrief = async () => {
    throw failure;
  };

  await assert.rejects(
    normalizeSimplifiedPressFlow({
      api,
      brief: { rawText: "brief", tone: "neutral" },
    }),
    (error) =>
      error === failure &&
      (error as typeof failure).exchange === observed,
  );
});
