import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { GenerateArticleBodySchema, InitializeArticleBodySchema, NormalizeBriefBodySchema, ReviewArticleBodySchema, RewriteArticleBodySchema, resolvePressQuotaMode } from "./pressFlowContracts";

test("shared contracts preserve the five production request shapes", () => {
  assert.equal(InitializeArticleBodySchema.parse({ type: "PRESS_RELEASE", extra: true }).type, "PRESS_RELEASE");
  assert.equal(NormalizeBriefBodySchema.parse({ rawText: "메모", tone: "custom", quotaMode: "simplified" }).tone, "custom");
  assert.deepEqual(GenerateArticleBodySchema.parse({ announceType: "출시", tone: "formal" }).points, []);
  assert.equal(ReviewArticleBodySchema.parse({ title: "제목", plain: "본문" }).title, "제목");
  assert.deepEqual(RewriteArticleBodySchema.parse({}).selectedNoteIds, []);
});

test("omitted and compatibility quota modes resolve to the central rolling policy", () => {
  assert.equal(resolvePressQuotaMode(), "rolling_ai");
  assert.equal(resolvePressQuotaMode("simplified"), "simplified");
});

test("all article routes import the shared contract module", async () => {
  for (const path of ["app/api/articles/init/route.ts", "app/api/articles/[id]/brief/normalize/route.ts", "app/api/articles/[id]/generate/route.ts", "app/api/articles/[id]/polish/route.ts", "app/api/articles/[id]/re-polish/route.ts"]) assert.match(await readFile(path, "utf8"), /domain\/press\/pressFlowContracts/);
});
