import assert from "node:assert/strict";
import test from "node:test";
import { ProducerVerificationReportSchema } from "./producerVerification";

const report = {
  schemaVersion: "presstuner/producer-verification/v1",
  manifest: { status: "verified", protocolVersion: "ops-console/producer-protocol/v1", sdkVersion: "1.0.1", workflowId: "presstuner.press-creation", workflowVersion: "2.0.0", definitionHash: `sha256:${"a".repeat(64)}`, storedRegistryHash: "fnv1a32:12345678", registryMatches: true, stageCount: 5, edgeCount: 4, gateCount: 3 },
  canonical: { status: "observed", totalCount: 1, counts: { "run.lifecycle": 1, "span.lifecycle": 0, "transition.evaluation": 0, "human.approval": 0, "edge.traversed": 0, "dataset.item.captured": 0, "replay.started": 0, "experiment.outcome": 0, "regression.outcome": 0 } },
  facts: { status: "ready", factCount: 1, batchCount: 1, counts: { "node.lifecycle": 1, "edge.traversal": 0, "human.review": 0 }, deterministicIds: true, replaySafe: true },
  otlp: { status: "ready", contentFree: true, spanCount: 1, requestCount: 1 },
  delivery: { operationConfiguration: "disabled", otlpConfiguration: "disabled", operationLinkage: "disabled", factDelivery: "disabled", otlpDelivery: "disabled", completionDelivery: "disabled" },
  replay: { canonicalCount: 1, uniqueDeterministicFactCount: 1, aggregateSpanCount: 1, replaySafe: true },
} as const;

test("producer verification contract accepts only the fixed allowlist", () => {
  assert.deepEqual(ProducerVerificationReportSchema.parse(report), report);
  for (const [section, field] of [["manifest", "operationId"], ["canonical", "events"], ["facts", "attributes"], ["otlp", "requests"], ["delivery", "errorText"]] as const) {
    assert.throws(() => ProducerVerificationReportSchema.parse({ ...report, [section]: { ...report[section], [field]: "secret" } }));
  }
  assert.throws(() => ProducerVerificationReportSchema.parse({ ...report, arbitrary: {} }));
});

test("producer verification contract rejects arbitrary count keys", () => {
  assert.throws(() => ProducerVerificationReportSchema.parse({ ...report, canonical: { ...report.canonical, counts: { ...report.canonical.counts, prompt: 1 } } }));
  assert.throws(() => ProducerVerificationReportSchema.parse({ ...report, facts: { ...report.facts, counts: { ...report.facts.counts, credential: 1 } } }));
});

test("producer verification contract rejects content-bearing identity substitutions", () => {
  for (const manifest of [
    { ...report.manifest, storedRegistryHash: "https://user:password@example.test" },
    { ...report.manifest, workflowId: "Bearer secret-token" },
    { ...report.manifest, sdkVersion: "raw database error" },
  ]) assert.throws(() => ProducerVerificationReportSchema.parse({ ...report, manifest }));
});
