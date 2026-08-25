import type { Prisma } from "@prisma/client";
import type { CheckpointLifecycleHooks } from "@/lib/services/press-ai-debugger/checkpointDebuggerService";
import { enqueueNextAiProcessFact } from "@/lib/services/ai-process-console/factOutbox";
import { AI_PROCESS_CONSOLE_SOURCE } from "../v1/publication";
import { buildV2OutputReference, type V2FactFactory } from "./factEvents";
import { componentRevisionForNode, componentRevisionForRequirement, componentRevisionForTransition } from "./publication";

export const v2FactLogicalKey = Object.freeze({
  attemptStarted: "attempt:started",
  attemptCompleted: "attempt:completed",
  attemptFailed: "attempt:failed",
  nodeStarted: (nodeId: string, nodeExecutionId: string) => `node:${nodeId}:${nodeExecutionId}:started`,
  nodeCompleted: (checkpointId: string) => `checkpoint:${checkpointId}:node-completed`,
  nodeFailed: (nodeId: string, nodeExecutionId: string) => `node:${nodeId}:${nodeExecutionId}:failed`,
  transitionEvaluated: (transitionEvaluationId: string) => `transition:${transitionEvaluationId}:evaluated`,
  transitionSelected: (transitionEvaluationId: string) => `transition:${transitionEvaluationId}:selected`,
  requirementObserved: (requirementId: string, occurrenceId: string) => `requirement:${requirementId}:${occurrenceId}`,
});

export function evaluateFinalOutputQuality(output: unknown): { verdict: "PASS" | "BLOCK"; reasonCodes: string[] } {
  const value = output && typeof output === "object" && !Array.isArray(output) ? output as Record<string, unknown> : {};
  const valid = typeof value.title === "string" && value.title.trim().length > 0 && typeof value.plain === "string" && value.plain.trim().length > 0;
  return valid ? { verdict: "PASS", reasonCodes: [] } : { verdict: "BLOCK", reasonCodes: ["EMPTY_FINAL_OUTPUT"] };
}

export function transitionRequirementReasonCodes(observation: { guardrailId: string; verdict: "PASS" | "WARN" | "BLOCK"; origin: "MANDATORY" | "CASE_EXPECTATION" }): string[] {
  if (observation.verdict === "PASS") return [];
  if (observation.guardrailId === "critical-fact-preservation" && observation.verdict === "BLOCK") return ["ALL_AUTHORED_FACTS_MISSING"];
  if (observation.guardrailId === "memo-brief-grounding" || observation.guardrailId === "critical-fact-preservation") return ["FACT_MISSING"];
  return [observation.origin === "MANDATORY" ? "MANDATORY_GUARDRAIL_FAILED" : "CASE_EXPECTATION_FAILED"];
}

export function createV2CheckpointFactHooks(factory: V2FactFactory): CheckpointLifecycleHooks {
  const emit = (tx: Prisma.TransactionClient, build: Parameters<typeof enqueueNextAiProcessFact>[1]["build"]) => enqueueNextAiProcessFact(tx, { source: AI_PROCESS_CONSOLE_SOURCE, attemptId: factory.identity.attemptId, build });
  return {
    onAttemptCreated: async (tx, event) => {
      await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.attempt.started.v2", logicalKey: v2FactLogicalKey.attemptStarted, sequence, occurredAt: event.occurredAt, data: {} }));
    },
    onNodeStarted: async (tx, event) => {
      const enteredBy = event.incomingTransitionId
        ? { kind: "TRANSITION" as const, transitionSelectionEventId: factory.eventIdFor(v2FactLogicalKey.transitionSelected(event.incomingTransitionId)) }
        : { kind: "ENTRY" as const };
      await emit(tx, (sequence) => factory.create({
        type: "dev.aiprocess.event.node.execution.started.v2", logicalKey: v2FactLogicalKey.nodeStarted(event.nodeId, event.commandId), sequence, occurredAt: event.occurredAt,
        ...(enteredBy.kind === "TRANSITION" ? { causationId: enteredBy.transitionSelectionEventId } : {}),
        data: { nodeExecutionId: event.commandId, nodeId: event.nodeId, handler: componentRevisionForNode(event.nodeId), enteredBy },
      }));
    },
    onNodeCompleted: async (tx, event) => {
      const startedEventId = factory.eventIdFor(v2FactLogicalKey.nodeStarted(event.nodeId, event.commandId));
      const completedEvent = factory.create({
        type: "dev.aiprocess.event.node.execution.completed.v2", logicalKey: v2FactLogicalKey.nodeCompleted(event.checkpointId), sequence: 0,
        occurredAt: event.occurredAt, causationId: startedEventId,
        data: { nodeExecutionId: event.commandId, nodeId: event.nodeId, startedEventId, handler: componentRevisionForNode(event.nodeId), durationMs: event.durationMs, outputArtifact: buildV2OutputReference({ checkpointId: event.checkpointId, output: event.output }) },
      });
      await emit(tx, (sequence) => factory.create({ ...completedEvent, logicalKey: v2FactLogicalKey.nodeCompleted(event.checkpointId), sequence }));
      if (event.nodeId === "selected-rewrite") {
        const outcome = evaluateFinalOutputQuality(event.output);
        await emit(tx, (sequence) => factory.create({
          type: "dev.aiprocess.event.requirement.observed.v2", logicalKey: v2FactLogicalKey.requirementObserved("final-output-quality", event.commandId), sequence,
          occurredAt: event.occurredAt, causationId: completedEvent.id,
          data: { requirementId: "final-output-quality", requirementVersion: "1.0.0", evaluator: componentRevisionForRequirement("final-output-quality"), location: { kind: "NODE", nodeId: event.nodeId }, occurrence: { kind: "NODE", nodeId: event.nodeId, nodeExecutionId: event.commandId }, observedForEventId: completedEvent.id, outcome: { state: "EVALUATED", ...outcome } },
        }));
      }
    },
    onNodeFailed: async (tx, event) => {
      const startedEventId = factory.eventIdFor(v2FactLogicalKey.nodeStarted(event.nodeId, event.commandId));
      await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.node.execution.failed.v2", logicalKey: v2FactLogicalKey.nodeFailed(event.nodeId, event.commandId), sequence, occurredAt: event.occurredAt, causationId: startedEventId, data: { nodeExecutionId: event.commandId, nodeId: event.nodeId, startedEventId, handler: componentRevisionForNode(event.nodeId), errorCode: /^[A-Z][A-Z0-9_]{0,99}$/.test(event.errorCode) ? event.errorCode : "NODE_EXECUTION_FAILED" } }));
    },
    onTransitionEvaluated: async (tx, event) => {
      const sourceNodeTerminalEventId = factory.eventIdFor(v2FactLogicalKey.nodeCompleted(event.sourceCheckpointId));
      const evaluationEventId = factory.eventIdFor(v2FactLogicalKey.transitionEvaluated(event.transitionId));
      await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.transition.evaluated.v2", logicalKey: v2FactLogicalKey.transitionEvaluated(event.transitionId), sequence, occurredAt: event.occurredAt, causationId: sourceNodeTerminalEventId, data: { transitionEvaluationId: event.transitionId, transitionId: event.edgeId, sourceNodeId: event.sourceNodeId, targetNodeId: event.targetNodeId, sourceNodeExecutionId: event.sourceNodeExecutionId, sourceNodeTerminalEventId, decision: componentRevisionForTransition(event.edgeId), matched: event.matched } }));
      for (const observation of event.observations) {
        await emit(tx, (sequence) => factory.create({
          type: "dev.aiprocess.event.requirement.observed.v2", logicalKey: v2FactLogicalKey.requirementObserved(observation.guardrailId, event.transitionId), sequence,
          occurredAt: event.occurredAt, causationId: evaluationEventId,
          data: { requirementId: observation.guardrailId, requirementVersion: "1.0.0", evaluator: componentRevisionForRequirement(observation.guardrailId), location: { kind: "TRANSITION", transitionId: event.edgeId, stageId: event.sourceNodeId }, occurrence: { kind: "TRANSITION", transitionId: event.edgeId, transitionEvaluationId: event.transitionId }, observedForEventId: evaluationEventId, outcome: { state: "EVALUATED", verdict: observation.verdict, reasonCodes: transitionRequirementReasonCodes(observation) } },
        }));
      }
    },
    onTransitionSelected: async (tx, event) => {
      const evaluationEventId = factory.eventIdFor(v2FactLogicalKey.transitionEvaluated(event.transitionId));
      await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.transition.selected.v2", logicalKey: v2FactLogicalKey.transitionSelected(event.transitionId), sequence, occurredAt: event.occurredAt, causationId: evaluationEventId, data: { transitionEvaluationId: event.transitionId, transitionId: event.edgeId, sourceNodeId: event.sourceNodeId, targetNodeId: event.targetNodeId, evaluationEventId, decision: componentRevisionForTransition(event.edgeId) } }));
    },
    onAttemptTerminal: async (tx, event) => {
      if (event.status === "COMPLETED" && event.cause.kind === "NODE_COMPLETED") {
        const cause = event.cause;
        const terminalNodeEventId = factory.eventIdFor(v2FactLogicalKey.nodeCompleted(cause.checkpointId));
        await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.attempt.completed.v2", logicalKey: v2FactLogicalKey.attemptCompleted, sequence, occurredAt: event.occurredAt, causationId: terminalNodeEventId, data: { terminalNodeId: cause.nodeId, terminalNodeExecutionId: cause.commandId, terminalNodeEventId, resultArtifact: buildV2OutputReference({ checkpointId: cause.checkpointId, output: cause.output }) } }));
        return;
      }
      const failedEventId = event.cause.kind === "NODE_FAILED"
        ? factory.eventIdFor(v2FactLogicalKey.nodeFailed(event.cause.nodeId, event.cause.commandId))
        : event.cause.kind === "TRANSITION_EVALUATED"
          ? factory.eventIdFor(v2FactLogicalKey.transitionEvaluated(event.cause.transitionId))
          : event.cause.kind === "EVIDENCE_EVALUATED"
            ? factory.eventIdFor(v2FactLogicalKey.transitionEvaluated(event.cause.evidenceEvaluationId))
            : undefined;
      await emit(tx, (sequence) => factory.create({ type: "dev.aiprocess.event.attempt.failed.v2", logicalKey: v2FactLogicalKey.attemptFailed, sequence, occurredAt: event.occurredAt, ...(failedEventId ? { causationId: failedEventId } : {}), data: { failureCode: (event.failureCode ?? (event.status === "BLOCKED" ? "TRANSITION_GUARDRAIL_BLOCK" : "ATTEMPT_FAILED")).replace(/[^A-Za-z0-9._:/+-]/g, "_").slice(0, 128), ...(failedEventId ? { failedEventId } : {}) } }));
    },
  };
}
