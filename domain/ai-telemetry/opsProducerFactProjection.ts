import { createHash } from "node:crypto";

import {
  EXECUTION_FACTS_VERSION,
  EXECUTION_FACT_VERSION,
  ExecutionFactBatchSchema,
  PRODUCER_PROTOCOL_LIMITS,
  PRODUCER_PROTOCOL_VERSION,
  WorkflowManifestSchema,
  type ExecutionFact,
  type ExecutionFactBatch,
  type WorkflowManifest,
} from "@nyxxir/ops-producer";

import type { CanonicalAiTelemetryEvent } from "./contracts";

export class OpsProducerFactProjectionError extends Error {
  constructor(readonly code: "OPS_PRODUCER_FACT_REFERENCE_INVALID") {
    super(code);
    this.name = "OpsProducerFactProjectionError";
  }
}

function deterministicUuid(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function stableReasonCode(value: string | null): string | null {
  if (value === null) return null;
  return /^[A-Z0-9_.-]{1,120}$/.test(value) ? value : "UNSPECIFIED_REASON";
}

function commonFact(
  event: CanonicalAiTelemetryEvent,
  operationId: string,
  manifest: WorkflowManifest,
) {
  return {
    schemaVersion: EXECUTION_FACT_VERSION,
    protocolVersion: PRODUCER_PROTOCOL_VERSION,
    factId: deterministicUuid(`fact:${operationId}:${event.eventId}`),
    operationId,
    workflow: {
      id: manifest.workflow.id,
      version: manifest.workflow.version,
      definitionHash: manifest.definitionHash,
    },
    sequence: event.sequence,
    occurredAt: event.occurredAt,
  } as const;
}

function occurrenceId(operationId: string, attemptId: string, stageId: string): string {
  return deterministicUuid(`occurrence:${operationId}:${attemptId}:${stageId}`);
}

function projectEvent(
  event: CanonicalAiTelemetryEvent,
  operationId: string,
  manifest: WorkflowManifest,
  stageIds: ReadonlySet<string>,
  gateIds: ReadonlySet<string>,
): ExecutionFact | null {
  const common = commonFact(event, operationId, manifest);

  if (event.eventKind === "run.lifecycle") {
    const lifecycleStage = event.payload.phase === "STARTED"
      ? manifest.stages.at(0)
      : manifest.stages.find((stage) => stage.kind === "TERMINAL") ?? manifest.stages.at(-1);
    if (!lifecycleStage || !stageIds.has(lifecycleStage.id)) {
      throw new OpsProducerFactProjectionError("OPS_PRODUCER_FACT_REFERENCE_INVALID");
    }
    const state = event.payload.phase === "BLOCKED" ? "FAILED" : event.payload.phase;
    return {
      ...common,
      kind: "node.lifecycle",
      occurrenceId: occurrenceId(operationId, event.scope.attemptId, lifecycleStage.id),
      stageId: lifecycleStage.id,
      state,
      reasonCode: stableReasonCode(event.payload.reasonCode),
    };
  }

  if (event.eventKind === "span.lifecycle") {
    const stageId = event.payload.nodeId;
    if (stageId === null) return null;
    if (!stageIds.has(stageId)) throw new OpsProducerFactProjectionError("OPS_PRODUCER_FACT_REFERENCE_INVALID");
    return {
      ...common,
      kind: "node.lifecycle",
      occurrenceId: occurrenceId(operationId, event.scope.attemptId, stageId),
      stageId,
      state: event.payload.phase,
      reasonCode: stableReasonCode(event.payload.reasonCode),
    };
  }

  if (event.eventKind === "edge.traversed") {
    const edge = manifest.edges.find(({ id }) => id === event.payload.edgeId);
    if (!edge
      || edge.sourceStageId !== event.payload.sourceNodeId
      || edge.targetStageId !== event.payload.targetNodeId
      || !stageIds.has(event.payload.sourceNodeId)
      || !stageIds.has(event.payload.targetNodeId)) {
      throw new OpsProducerFactProjectionError("OPS_PRODUCER_FACT_REFERENCE_INVALID");
    }
    return {
      ...common,
      kind: "edge.traversal",
      edgeId: event.payload.edgeId,
      sourceOccurrenceId: occurrenceId(operationId, event.scope.attemptId, event.payload.sourceNodeId),
      targetOccurrenceId: occurrenceId(operationId, event.scope.attemptId, event.payload.targetNodeId),
      state: "TAKEN",
      reasonCode: event.payload.verdict === "WARN" ? "GUARDRAIL_WARN" : null,
      evidenceRefIds: [],
    };
  }

  if (event.eventKind === "human.approval") {
    if (!gateIds.has(event.payload.gateId)) {
      throw new OpsProducerFactProjectionError("OPS_PRODUCER_FACT_REFERENCE_INVALID");
    }
    const state = event.payload.phase === "REQUESTED" || event.payload.decision === "PENDING"
      ? "REQUESTED"
      : event.payload.decision === "REJECTED"
        ? "REJECTED"
        : "APPROVED";
    return {
      ...common,
      kind: "human.review",
      gateId: event.payload.gateId,
      occurrenceId: deterministicUuid(`gate:${operationId}:${event.scope.attemptId}:${event.payload.gateId}`),
      state,
    };
  }

  return null;
}

export function projectCanonicalEventsToExecutionFactBatches(input: {
  operationId: string;
  manifest: WorkflowManifest;
  events: readonly CanonicalAiTelemetryEvent[];
}): ExecutionFactBatch[] {
  const manifest = WorkflowManifestSchema.parse(input.manifest);
  const stageIds = new Set(manifest.stages.map(({ id }) => id));
  const gateIds = new Set(manifest.stages.flatMap(({ gateIds: stageGateIds }) => stageGateIds ?? []));
  const expectedProcessId = manifest.workflow.id.replace(/^presstuner\./, "");

  const facts = [...input.events]
    .sort((left, right) => left.sequence - right.sequence)
    .map((event) => {
      if (event.scope.processId !== expectedProcessId || event.scope.processVersion !== manifest.workflow.version) {
        throw new OpsProducerFactProjectionError("OPS_PRODUCER_FACT_REFERENCE_INVALID");
      }
      return projectEvent(event, input.operationId, manifest, stageIds, gateIds);
    })
    .filter((fact): fact is ExecutionFact => fact !== null);

  const batches: ExecutionFactBatch[] = [];
  const maximum = PRODUCER_PROTOCOL_LIMITS.executionFactsBatch.maxFacts;
  for (let index = 0; index < facts.length; index += maximum) {
    batches.push(ExecutionFactBatchSchema.parse({
      schemaVersion: EXECUTION_FACTS_VERSION,
      producer: manifest.producer,
      facts: facts.slice(index, index + maximum),
    }));
  }
  return batches;
}
