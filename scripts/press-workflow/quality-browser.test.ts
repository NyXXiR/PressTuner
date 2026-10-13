import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { datasetSchema } from "../../domain/press-workflow/evaluation/contracts";
import { startReviewServer } from "./review-server";

test("adaptive mobile choices persist; uncertainty, skipped questions and experiment hold remain distinct", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../domain/press-workflow/evaluation/analysis-fixture.json", import.meta.url), "utf8"));
  // Isolated synthetic UI QA, never imported into a human reliability report.
  fixture.batch.evaluations.forEach((e: { evaluationMode: string; draft: { evidenceClass: string } }) => { e.evaluationMode = "MOCK"; e.draft.evidenceClass = "SYNTHETIC"; });
  fixture.batch.generation.attempts.forEach((a: { draft: { evidenceClass: string } }) => { a.draft.evidenceClass = "SYNTHETIC"; });
  const dataset = datasetSchema.parse(JSON.parse(await readFile("evals/press-workflow/dual/v1/dataset.json", "utf8")));
  const dir = await mkdtemp(join(tmpdir(), "press-adaptive-browser-qa-"));
  const server = await startReviewServer({ dataset, batch: fixture.batch, dir, port: 0, questionBudget: 3 });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.goto(server.url);
    assert.equal(await page.locator(".question").count(), 3);
    assert.equal(await page.locator(".question:visible").count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const first = await page.locator(".question:visible fieldset").getAttribute("data-criterion");
    await page.locator(".question:visible").getByRole("button", { name: "판단 어려움", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("status")?.textContent?.includes("저장됨"));
    assert.equal(server.session().events[0].criterion, first);
    assert.equal(server.session().events[0].judgment, "UNCERTAIN");
    await page.reload();
    assert.equal(await page.locator(".question:visible").getAttribute("id"), "question-1");
    await page.locator(".question:visible").getByRole("button", { name: "건너뛰기", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("status")?.textContent?.includes("건너뛰기"));
    assert.equal(server.session().events[1].judgment, null);
    await page.goto(`${server.url}/decisions`);
    assert.equal(await page.getByRole("heading", { name: "확인할 문제와 다음 선택" }).count(), 1);
    if (process.env.PRESS_QUALITY_SCREENSHOTS) {
      const output = resolve(process.env.PRESS_QUALITY_SCREENSHOTS); await mkdir(output, { recursive: true });
      await page.screenshot({ path: join(output, "quality-decisions-mobile.png"), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: join(output, "quality-decisions-desktop.png"), fullPage: true });
    }
    await page.goto(`${server.url}/experiment`);
    assert.equal(await page.getByRole("button", { name: "후보로 추가 검증" }).isDisabled(), true);
    await page.getByRole("button", { name: "판단 보류", exact: true }).click();
    await page.waitForFunction(() => document.getElementById("status")?.textContent?.includes("저장됨"));
    await page.reload();
    assert.match(await page.locator("#status").innerText(), /저장된 결정: 판단 보류/);
    assert.equal(server.session().experimentDecisions?.[0].choice, "HOLD");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await server.close(); }
});
