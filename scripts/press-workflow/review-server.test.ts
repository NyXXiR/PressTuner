import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { datasetSchema } from "../../domain/press-workflow/evaluation/contracts";
import { startReviewServer } from "./review-server";

test("selection survives restart, report updates, and stale/cross-origin requests cannot write", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../domain/press-workflow/evaluation/analysis-fixture.json", import.meta.url), "utf8"));
  const dataset = datasetSchema.parse(JSON.parse(await readFile("evals/press-workflow/dual/v1/dataset.json", "utf8")));
  const dir = await mkdtemp(join(tmpdir(), "press-review-server-"));
  const options = { dataset, batch: fixture.batch, dir, port: 0 };
  let server = await startReviewServer(options);
  try {
    const initial = server.session();
    const selection = { sessionId: initial.sessionId, revision: 0, reviewId: initial.queue[0].reviewId, criterion: "FACTUAL_SUPPORT", judgment: "FAIL", confirmed: true };
    const send = (origin: string) => fetch(`${server.url}/selection`, { method: "POST", headers: { origin, "Content-Type": "application/json", "X-Review-Token": server.token }, body: JSON.stringify(selection) });
    assert.equal((await send("http://evil.invalid")).status, 403);
    assert.equal((await send(server.url)).status, 200);
    assert.equal((await send(server.url)).status, 409);
    await assert.rejects(startReviewServer(options), /SESSION_ALREADY_OPEN/);
    const occupied = join(dir, "revision-000002.json");
    await writeFile(occupied, "occupied-for-write-failure-test");
    const failed = await fetch(`${server.url}/selection`, { method: "POST", headers: { origin: server.url, "Content-Type": "application/json", "X-Review-Token": server.token }, body: JSON.stringify({ ...selection, revision: 1, judgment: "PASS" }) });
    assert.equal(failed.status, 400);
    assert.equal(server.session().revision, 1);
    assert.equal(await readFile(occupied, "utf8"), "occupied-for-write-failure-test");
    await unlink(occupied);
    const summary = await (await fetch(`${server.url}/summary`)).json();
    assert.equal(summary.review.labelledCount, 1);
    assert.ok(summary.insights.recommendations.some((r: { code: string }) => r.code === "GROUND_CLAIMS"));
    assert.match(await (await fetch(`${server.url}/report`)).text(), /품질 분석과 개선 제안/);
    await server.close();
    server = await startReviewServer(options);
    assert.equal(server.session().revision, 1);
    assert.equal(server.session().events.length, 1);
    assert.match(await (await fetch(server.url)).text(), /aria-pressed="true">위반/);
  } finally { await server.close(); }
});
