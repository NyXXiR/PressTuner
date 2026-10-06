import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, parseArgs } from "./dual-eval";
import { datasetSchema, evaluationBundleSchema } from "../../domain/press-workflow/evaluation/contracts";
import { reviewPacket } from "../../domain/press-workflow/evaluation/report";
import { freezePolicy, validateFrozenPolicy } from "../../domain/press-workflow/evaluation/policy-freeze";

test("live commands require explicit spend and all bounds are checked", () => {
  assert.throws(() => parseArgs(["generate", "--mode", "live", "--out", "unused"]), /allow-model-spend/);
  for (const args of [["--limit", "0"], ["--repeats", "11"], ["--unknown", "x"]]) assert.throws(() => parseArgs(["generate", "--out", "unused", ...args]));
});
test("mock generation and saved-output evaluation preserve identity without inventing improvement", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dual-eval-")), drafts = join(dir, "drafts.json"), evaluations = join(dir, "evaluations.json");
  await main(["generate", "--limit", "1", "--out", drafts]);
  const saved = JSON.parse(await readFile(drafts, "utf8"));
  assert.equal(saved.attempts.length, 2);
  assert.ok(saved.attempts.every((a: { draft: { provenance?: unknown } }) => a.draft.provenance));
  assert.equal(saved.attempts[0].draft.outputHash, saved.attempts[1].draft.outputHash);
  await main(["evaluate", "--input", drafts, "--out", evaluations]);
  const evaluated = JSON.parse(await readFile(evaluations, "utf8"));
  assert.equal(evaluated.evaluations.length, 2);
  assert.ok(evaluated.evaluations.every((r: { evaluationMode: string }) => r.evaluationMode === "MOCK"));
  await assert.rejects(main(["generate", "--limit", "1", "--out", drafts]), /EEXIST/);
  await writeFile(join(dir, "invalid.json"), "{}");
  await assert.rejects(main(["evaluate", "--input", join(dir, "invalid.json"), "--out", join(dir, "bad.json")]));
});

test("holdout generation refuses unfrozen policy before reserving output", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dual-holdout-")), out = join(dir, "holdout.json");
  await assert.rejects(main(["generate", "--partition", "holdout", "--out", out]), /FROZEN_POLICY_REQUIRED/);
  await assert.rejects(readFile(out), /ENOENT/);
});

test("policy freezing requires human-reviewed development provenance and rejects recipe changes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dual-freeze-"));
  await main(["generate", "--limit", "1", "--out", join(dir, "drafts.json")]);
  await main(["evaluate", "--input", join(dir, "drafts.json"), "--out", join(dir, "eval.json")]);
  const dataset = datasetSchema.parse(JSON.parse(await readFile("evals/press-workflow/dual/v1/dataset.json", "utf8")));
  const batch = evaluationBundleSchema.parse(JSON.parse(await readFile(join(dir, "eval.json"), "utf8")));
  const sourceHash = batch.evaluations[0].draft.provenance!.implementationHash;
  assert.throws(() => freezePolicy(dataset, batch, reviewPacket(dataset, batch), sourceHash), /FREEZE_REQUIRES/);
  // Test-only simulated recorded evidence; never exported as an experimental result.
  for (const e of batch.evaluations) {
    e.evaluationMode = "LIVE"; e.draft.evidenceClass = "MEASURED_TEST"; e.draft.model = e.draft.provenance!.request.model;
    batch.generation.attempts.find(a => a.variant === e.draft.variant)!.draft = e.draft;
  }
  const packet = reviewPacket(dataset, batch);
  const review = { ...packet, reviewer: { type: "HUMAN", id: "unit-test-only", reviewedAt: new Date().toISOString(), attestation: "I reviewed the blinded outputs myself" },
    entries: packet.entries.map(e => ({ ...e, labels: e.labels.map(l => ({ ...l, judgment: "PASS", reason: "Unit test fixture" })) })) };
  const frozen = freezePolicy(dataset, batch, review, sourceHash);
  const expected = { datasetHash: frozen.datasetHash, implementationHash: sourceHash, generatorModel: frozen.generatorModel, judgeModel: frozen.judgeModel, promptHash: frozen.promptHash };
  assert.equal(validateFrozenPolicy(frozen, expected).reviewedOutputs, 2);
  assert.throws(() => validateFrozenPolicy(frozen, { ...expected, implementationHash: "f".repeat(64) }), /MISMATCH/);
  assert.throws(() => validateFrozenPolicy(frozen, { ...expected, judgeModel: "changed-model" }), /MISMATCH/);
  assert.throws(() => freezePolicy(dataset, batch, review, "e".repeat(64)), /FREEZE_REQUIRES/);
  review.entries[0].labels[0].judgment = "FAIL";
  assert.throws(() => freezePolicy(dataset, batch, review, sourceHash), /RESOLVE_EVALUATOR_DISAGREEMENTS/);
});
