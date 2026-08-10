import { createHash } from "node:crypto";
import { parseCanonicalAiTelemetryEvent, type CanonicalAiTelemetryEvent } from "./contracts";
import { assertOpsConsoleRequestSize, OPS_CONSOLE_EXECUTION_FACTS_BATCH_VERSION, OPS_CONSOLE_EXECUTION_FACT_VERSION, OPS_CONSOLE_MAX_CANONICAL_EVENTS, OPS_CONSOLE_MAX_FACT_BATCHES, OPS_CONSOLE_MAX_FACTS_PER_BATCH, OPS_CONSOLE_PRODUCER, OPS_CONSOLE_PROTOCOL_VERSION, OpsConsoleExecutionFactBatchSchema, OpsConsoleExecutionFactSchema, OpsConsoleWorkflowManifestSchema, type OpsConsoleExecutionFact, type OpsConsoleExecutionFactBatch, type OpsConsoleWorkflowManifest } from "./opsConsoleProducerContracts";

function deterministicUuid(...parts: string[]): string {
  const hex = createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
}

function safeReason(value: string | null | undefined, fallback: string | null = null): string | null {
  if (!value) return fallback;
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/.test(value) ? value : fallback;
}

export function projectOpsConsoleExecutionFacts(args: { operationId: string; manifest: OpsConsoleWorkflowManifest; events: readonly CanonicalAiTelemetryEvent[] }): OpsConsoleExecutionFact[] {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args.operationId)) throw new Error("OPS_CONSOLE_INVALID_OPERATION_ID");
  const manifest = OpsConsoleWorkflowManifestSchema.parse(args.manifest);
  if (args.events.length > OPS_CONSOLE_MAX_CANONICAL_EVENTS) throw new Error("OPS_CONSOLE_CANONICAL_EVENT_LIMIT");
  const stages = new Set(manifest.stages.map((item) => item.id));
  const edges = new Map(manifest.edges.map((item) => [item.id, item]));
  const gates = new Set(manifest.stages.flatMap((item) => item.gateIds ?? []));
  const workflow = { ...manifest.workflow, definitionHash: manifest.definitionHash };
  const facts: OpsConsoleExecutionFact[] = [];
  const occurrence = (attemptId: string, stageId: string) => deterministicUuid(args.operationId, attemptId, stageId);
  const ordered = args.events.map(parseCanonicalAiTelemetryEvent).sort((a, b) => a.sequence - b.sequence || a.eventId.localeCompare(b.eventId));
  for (const event of ordered) {
    const expectedProcessId = manifest.workflow.id === "presstuner.press-agent" ? "rag-query" : manifest.workflow.id === "presstuner.press-creation" ? "press-creation" : null;
    if (!expectedProcessId || event.scope.processId !== expectedProcessId) throw new Error("OPS_CONSOLE_WORKFLOW_REFERENCE_INVALID");
    const common = { schemaVersion: OPS_CONSOLE_EXECUTION_FACT_VERSION, protocolVersion: OPS_CONSOLE_PROTOCOL_VERSION, operationId: args.operationId, workflow, sequence: event.sequence, occurredAt: event.occurredAt } as const;
    let fact: OpsConsoleExecutionFact | null = null;
    if (event.eventKind === "span.lifecycle" && event.payload.nodeId) {
      if (!stages.has(event.payload.nodeId)) throw new Error("OPS_CONSOLE_STAGE_REFERENCE_INVALID");
      fact = { ...common, factId: deterministicUuid(args.operationId, event.eventId, "node.lifecycle"), kind: "node.lifecycle", occurrenceId: occurrence(event.scope.attemptId, event.payload.nodeId), stageId: event.payload.nodeId, state: event.payload.phase, reasonCode: safeReason(event.payload.reasonCode) };
    } else if (event.eventKind === "edge.traversed") {
      const edge = edges.get(event.payload.edgeId);
      if (!edge || edge.sourceStageId !== event.payload.sourceNodeId || edge.targetStageId !== event.payload.targetNodeId) throw new Error("OPS_CONSOLE_EDGE_REFERENCE_INVALID");
      fact = { ...common, factId: deterministicUuid(args.operationId, event.eventId, "edge.traversal"), kind: "edge.traversal", edgeId: edge.id, sourceOccurrenceId: occurrence(event.scope.attemptId, edge.sourceStageId), targetOccurrenceId: event.payload.traversalState === "TAKEN" ? occurrence(event.scope.attemptId, edge.targetStageId) : null, state: event.payload.traversalState, reasonCode: safeReason(event.payload.reasonCode), evidenceRefIds: [] };
    } else if (event.eventKind === "transition.evaluation") {
      const edge = edges.get(event.payload.edgeId);
      if (!edge) throw new Error("OPS_CONSOLE_EDGE_REFERENCE_INVALID");
      const decision = event.payload.verdict === "PASS" || event.payload.verdict === "WARN" ? "ALLOW" : event.payload.verdict === "BLOCK" ? "BLOCK" : "UNKNOWN";
      fact = { ...common, factId: deterministicUuid(args.operationId, event.eventId, "transition.evaluation"), kind: "transition.evaluation", edgeId: edge.id, sourceOccurrenceId: occurrence(event.scope.attemptId, edge.sourceStageId), targetOccurrenceId: occurrence(event.scope.attemptId, edge.targetStageId), decision, reasonCode: safeReason(event.payload.reasonCode, "NOT_EVALUABLE")! };
    } else if (event.eventKind === "human.approval") {
      if (!gates.has(event.payload.gateId)) throw new Error("OPS_CONSOLE_GATE_REFERENCE_INVALID");
      const state = event.payload.phase === "REQUESTED" ? "REQUESTED" : event.payload.decision === "APPROVED" || event.payload.decision === "ACKNOWLEDGED" ? "APPROVED" : event.payload.decision === "REJECTED" ? "REJECTED" : "CANCELLED";
      fact = { ...common, factId: deterministicUuid(args.operationId, event.eventId, "human.review"), kind: "human.review", gateId: event.payload.gateId, occurrenceId: deterministicUuid(args.operationId, event.scope.attemptId, event.payload.gateId), state };
    }
    if (fact) facts.push(OpsConsoleExecutionFactSchema.parse(fact));
  }
  return facts;
}

export function batchOpsConsoleExecutionFacts(facts: readonly OpsConsoleExecutionFact[]): OpsConsoleExecutionFactBatch[] {
  const batches: OpsConsoleExecutionFactBatch[] = [];
  for (let offset = 0; offset < facts.length;) {
    let size = Math.min(OPS_CONSOLE_MAX_FACTS_PER_BATCH, facts.length - offset);
    let batch: OpsConsoleExecutionFactBatch | null = null;
    while (size > 0) {
      const candidate = OpsConsoleExecutionFactBatchSchema.parse({ schemaVersion: OPS_CONSOLE_EXECUTION_FACTS_BATCH_VERSION, producer: OPS_CONSOLE_PRODUCER, facts: facts.slice(offset, offset + size) });
      try { assertOpsConsoleRequestSize(candidate); batch = candidate; break; } catch { size -= 1; }
    }
    if (!batch) throw new Error("OPS_CONSOLE_FACT_TOO_LARGE");
    batches.push(batch); offset += batch.facts.length;
    if (batches.length > OPS_CONSOLE_MAX_FACT_BATCHES) throw new Error("OPS_CONSOLE_FACT_BATCH_LIMIT");
  }
  return batches;
}
