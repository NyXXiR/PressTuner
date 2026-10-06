import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../../../scripts/press-workflow/dual-eval";
import { datasetSchema, evaluationBundleSchema, type Dataset, type EvaluationBundle } from "./contracts";
import { buildReport, reviewPacket } from "./report";

async function fixture(): Promise<{ dataset: Dataset; batch: EvaluationBundle }> {
  const dir = await mkdtemp(join(tmpdir(), "dual-review-"));
  await main(["challenges", "--limit", "1", "--out", join(dir, "drafts.json")]);
  await main(["evaluate", "--input", join(dir, "drafts.json"), "--out", join(dir, "eval.json")]);
  return { dataset: datasetSchema.parse(JSON.parse(await readFile("evals/press-workflow/dual/v1/dataset.json", "utf8"))), batch: evaluationBundleSchema.parse(JSON.parse(await readFile(join(dir, "eval.json"), "utf8"))) };
}
test("blind packets contain no automatic scores or variant identity; missing human labels never calibrate", async () => {
  const { dataset, batch } = await fixture();
  const packet = reviewPacket(dataset, batch);
  const text = JSON.stringify(packet);
  assert.ok(!text.includes("BASELINE") && !text.includes("CANDIDATE") && !text.includes('"score"'));
  assert.equal(packet.reviewer, null);
  const report = buildReport(dataset, batch);
  assert.equal(report.review.state, "PENDING"); assert.equal(report.review.agreement, null);
  assert.equal(report.decision, "NOT_EVALUABLE");
  assert.ok(!JSON.stringify(report.summary).includes(batch.evaluations[0].draft.text));
});
test("reviews reject wrong artifact, duplicated outputs and AI reviewer claims", async () => {
  const { dataset, batch } = await fixture();
  const packet = reviewPacket(dataset, batch);
  assert.throws(() => buildReport(dataset, batch, { ...packet, artifactHash: "0".repeat(64) }));
  assert.throws(() => buildReport(dataset, batch, { ...packet, entries: [packet.entries[0], packet.entries[0]] }));
  assert.throws(() => buildReport(dataset, batch, { ...packet, reviewer: { type: "AI", id: "agent", reviewedAt: new Date().toISOString(), attestation: "I reviewed the blinded outputs myself" } }));
});

test("human-known defects include evaluator failures in recall denominator", async () => {
  const { dataset, batch } = await fixture();
  batch.evaluations[0].domain = { state: "NOT_EVALUABLE", verdict: null, checks: [], reasonCode: "TIMEOUT", elapsedMs: 1, usage: null };
  const packet = reviewPacket(dataset, batch);
  const reviewed = { ...packet, reviewer: { type: "HUMAN", id: "test-only-review-fixture", reviewedAt: new Date().toISOString(), attestation: "I reviewed the blinded outputs myself" },
    entries: packet.entries.map(e => ({ ...e, labels: e.labels.map(l => ({ ...l, judgment: "FAIL", reason: "Test-only labelled defect" })) })) };
  const report = buildReport(dataset, batch, reviewed);
  assert.equal(report.review.defectCount, 10);
  assert.equal(report.review.comparableCount, 5);
  assert.equal(report.review.defectRecall, 0.1);
});
