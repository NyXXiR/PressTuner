import { parseCanonicalAiTelemetryEvent, AI_TELEMETRY_SCHEMA_VERSION, type CanonicalAiTelemetryEvent } from "@/domain/ai-telemetry/contracts";
import { deriveCanonicalEventId, deriveCanonicalSpanId, normalizeCanonicalTraceId } from "@/domain/ai-telemetry/identifiers";
import { mapTransitionEvaluation } from "@/domain/ai-telemetry/pressMapper";
import { evaluatePressTransitionGuardrails } from "@/domain/press-ai-debugger/transitionGuardrails";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import { getProcessRegistryHash } from "@/domain/press-ai-debugger/processRegistryHash";
import { evaluateRegressionGate, type RegressionMetricDescriptor } from "./regressionGate";
import { parsePressTransitionCiDataset, PressTransitionCiBaselineSchema, type PressTransitionCiBaseline } from "./pressTransitionCiContracts";

const descriptors: readonly RegressionMetricDescriptor[] = [
  { id: "expectedVerdictAccuracy", mandatory: true, direction: "higher", threshold: 1 },
  { id: "metadataExclusionRate", mandatory: true, direction: "higher", threshold: 1 },
  { id: "evidenceBoundCompliance", mandatory: true, direction: "higher", threshold: 1 },
  { id: "requiredEdgeCoverage", mandatory: true, direction: "higher", threshold: 1 },
];

function outcomeEvent(args: { kind: "experiment.outcome" | "regression.outcome"; dataset: ReturnType<typeof parsePressTransitionCiDataset>; baseline: PressTransitionCiBaseline; traceId: string; sequence: number; disposition: "PROMOTE" | "REJECT" | "NOT_EVALUABLE"; checks: ReturnType<typeof evaluateRegressionGate>["checks"] }) {
  const common = { schemaVersion: AI_TELEMETRY_SCHEMA_VERSION, eventId: deriveCanonicalEventId("ci", args.dataset.contentHash, args.kind), traceId: args.traceId, spanId: deriveCanonicalSpanId(args.traceId, args.kind), parentSpanId: deriveCanonicalSpanId(args.traceId, "run"), sequence: args.sequence, occurredAt: args.dataset.createdAt, scope: { teamId: "ci", runId: `ci_${args.dataset.contentHash.slice(0, 16)}`, processId: args.dataset.processId, processVersion: args.dataset.processVersion, registryHash: args.dataset.registryHash, attemptId: `ci_${args.dataset.version}`, parentAttemptId: null, caseId: null }, executionMode: "DETERMINISTIC", status: args.disposition === "PROMOTE" ? "PASS" : args.disposition === "REJECT" ? "FAILED" : "NOT_EVALUABLE", attributes: { "evaluation.fixture": true }, eventKind: args.kind, payload: args.kind === "experiment.outcome" ? { datasetId: args.dataset.processId, datasetVersion: args.dataset.version, configurationId: "guardrails-current", disposition: args.disposition, checks: args.checks.map((check) => ({ id: check.metricId, status: check.status, value: check.candidate, reasonCode: check.reason.replaceAll(" ", "_").toUpperCase().slice(0, 100) })) } : { datasetId: args.dataset.processId, datasetVersion: args.dataset.version, baselineConfigurationId: "guardrails-baseline", candidateConfigurationId: "guardrails-current", disposition: args.disposition, checks: args.checks.map((check) => ({ id: check.metricId, status: check.status, value: check.candidate, reasonCode: check.reason.replaceAll(" ", "_").toUpperCase().slice(0, 100) })) } };
  return parseCanonicalAiTelemetryEvent(common);
}

export function evaluatePressTransitionDataset(datasetInput: unknown, baselineInput: unknown) {
  const dataset = parsePressTransitionCiDataset(datasetInput); const baseline = PressTransitionCiBaselineSchema.parse(baselineInput);
  const registryHash = getProcessRegistryHash(pressCreationProcess);
  if (dataset.processVersion !== pressCreationProcess.version || dataset.registryHash !== registryHash) throw new Error("PRESS_TRANSITION_DATASET_TOPOLOGY_MISMATCH");
  if (baseline.datasetVersion !== dataset.version || baseline.datasetHash !== dataset.contentHash) throw new Error("PRESS_TRANSITION_BASELINE_MISMATCH");
  const traceId = normalizeCanonicalTraceId(null, "ci", dataset.contentHash); const events: CanonicalAiTelemetryEvent[] = []; const covered = new Set<string>();
  let correct = 0; let excluded = 0; let exclusionTotal = 0; let bounded = 0; let observationTotal = 0;
  const cases = dataset.cases.map((entry) => {
    const edge = pressCreationProcess.edges.find(({ id }) => id === entry.edgeId); if (!edge) throw new Error(`PRESS_TRANSITION_DATASET_EDGE_INVALID:${entry.edgeId}`); covered.add(edge.id);
    const attempt = { teamId: "ci", articleId: entry.article?.id ?? "article-ci" };
    const result = evaluatePressTransitionGuardrails({ edgeId: entry.edgeId, sourceInput: entry.sourceInput, sourceOutput: entry.sourceOutput, targetPayload: entry.targetPayload, attempt, article: entry.article, expectations: entry.expectations });
    if (result.verdict === entry.expectedVerdict) correct += 1;
    const serialized = JSON.stringify(result.observations);
    for (const token of entry.forbiddenMetadataTokens) { exclusionTotal += 1; if (!serialized.includes(token)) excluded += 1; }
    for (const observation of result.observations) {
      observationTotal += 1; const evidence = observation.evidence as { checked?: unknown[] } | null;
      if ((evidence?.checked?.length ?? 0) <= 32 && observation.expected.length <= 4000 && observation.observed.length <= 4000) bounded += 1;
      events.push(mapTransitionEvaluation({ teamId: "ci", runId: `ci_${dataset.contentHash.slice(0, 16)}`, traceId, attemptId: entry.id, processId: dataset.processId, processVersion: dataset.processVersion, registryHash: dataset.registryHash, executionMode: "DETERMINISTIC", occurredAt: dataset.createdAt }, { transitionId: entry.id, edgeId: entry.edgeId, sourceNodeId: edge.source, evaluator: { id: observation.guardrailId, version: dataset.processVersion }, verdict: observation.verdict, expected: observation.expected, observed: observation.observed, reasonCode: observation.origin, evidence: observation.evidence }));
    }
    return { id: entry.id, edgeId: entry.edgeId, expectedVerdict: entry.expectedVerdict, actualVerdict: result.verdict, passed: result.verdict === entry.expectedVerdict };
  });
  const metrics = { expectedVerdictAccuracy: correct / dataset.cases.length, metadataExclusionRate: exclusionTotal ? excluded / exclusionTotal : 1, evidenceBoundCompliance: observationTotal ? bounded / observationTotal : 1, requiredEdgeCoverage: dataset.requiredEdgeIds.filter((id) => covered.has(id)).length / dataset.requiredEdgeIds.length };
  const gateMetrics = Object.fromEntries(descriptors.map((descriptor) => [descriptor.id, { baseline: { evidenceClass: "synthetic" as const, value: baseline.metrics[descriptor.id] ?? 1 }, candidate: { evidenceClass: "synthetic" as const, value: metrics[descriptor.id as keyof typeof metrics] } }]));
  const gate = evaluateRegressionGate({ descriptors: descriptors.map((descriptor) => ({ ...descriptor, threshold: baseline.thresholds[descriptor.id] ?? descriptor.threshold })), metrics: gateMetrics, humanReview: "APPROVED" });
  events.forEach((event, index) => { events[index] = parseCanonicalAiTelemetryEvent({ ...event, sequence: index + 1 }); });
  events.push(outcomeEvent({ kind: "experiment.outcome", dataset, baseline, traceId, sequence: events.length + 1, disposition: gate.disposition, checks: gate.checks }));
  events.push(outcomeEvent({ kind: "regression.outcome", dataset, baseline, traceId, sequence: events.length + 1, disposition: gate.disposition, checks: gate.checks }));
  return { schemaVersion: "press-transition-evaluation/v1", deterministic: true, dataset: { version: dataset.version, contentHash: dataset.contentHash, processVersion: dataset.processVersion, registryHash: dataset.registryHash }, metrics, checks: gate.checks, disposition: gate.disposition, releaseBlockingPassed: gate.disposition === "PROMOTE", cases, events };
}
