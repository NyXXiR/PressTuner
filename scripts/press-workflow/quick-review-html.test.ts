import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Script } from "node:vm";
import { datasetSchema } from "../../domain/press-workflow/evaluation/contracts";
import { createReviewSession } from "../../domain/press-workflow/evaluation/quick-review";
import { quickReviewHtml } from "./quick-review-html";

test("selection UI includes readable content, no required writing, no judge values and executable persistence script", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../domain/press-workflow/evaluation/analysis-fixture.json", import.meta.url), "utf8"));
  const dataset = datasetSchema.parse(JSON.parse(await readFile("evals/press-workflow/dual/v1/dataset.json", "utf8")));
  const session = createReviewSession(dataset, fixture.batch, undefined, 2, "test");
  session.packet.entries[0].draft += "</script><script>alert(1)</script>";
  const html = quickReviewHtml(session, "test-token"), script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  assert.doesNotThrow(() => new Script(script));
  assert.ok(html.includes("&lt;/script&gt;"));
  assert.ok(!html.includes("<textarea") && !html.includes('type="text"'));
  assert.ok(!html.includes("BASELINE") && !html.includes("CANDIDATE") && !html.includes("0.214285"));
  assert.ok(html.includes("/selection"));
  assert.ok(html.includes("저장하지 못했습니다"));
});
