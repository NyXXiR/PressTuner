import type { PressAgentWorkflowEventV1 } from "@/domain/evaluation/pressAgentWorkflowEvents";
import type { EventV1 } from "./contracts";
import type { FactFactory } from "./factEvents";
import { buildRagQueryProcessDefinition } from "./publication";

const definition = buildRagQueryProcessDefinition();

function node(nodeId: string) {
  const result = definition.nodes.find((entry) => entry.nodeId === nodeId);
  if (!result) throw new Error("AI_PROCESS_CONSOLE_RAG_NODE_NOT_FOUND");
  return result;
}

function transition(transitionId: string) {
  const result = definition.transitions.find((entry) => entry.transitionId === transitionId);
  if (!result) throw new Error("AI_PROCESS_CONSOLE_RAG_TRANSITION_NOT_FOUND");
  return result;
}

function isStageTerminal(event: PressAgentWorkflowEventV1, nodeId?: string) {
  return event.type === "stage.state"
    && (nodeId === undefined || event.stage.id === nodeId)
    && ["succeeded", "warning", "failed", "blocked"].includes(event.stage.state);
}

function latestPrior(
  events: readonly PressAgentWorkflowEventV1[],
  predicate: (event: PressAgentWorkflowEventV1) => boolean,
): PressAgentWorkflowEventV1 | undefined {
  return [...events]
    .sort((left, right) => right.sequence - left.sequence)
    .find(predicate);
}

function stageStart(events: readonly PressAgentWorkflowEventV1[], nodeId: string) {
  return latestPrior(events, (event) => event.type === "stage.state" && event.stage.id === nodeId && event.stage.state === "running");
}

function stageCausation(events: readonly PressAgentWorkflowEventV1[], nodeId: string): string | undefined {
  const incomingSelection = latestPrior(events, (event) => event.type === "edge.state"
    && event.edge.target === nodeId
    && (event.edge.state === "taken" || event.edge.state === "taken-with-violation"));
  if (incomingSelection) return incomingSelection.eventId;
  if (definition.entryNodeIds.includes(nodeId)) {
    return latestPrior(events, (event) => event.type === "run.started")?.eventId;
  }
  return undefined;
}

function sourceTerminalCausation(events: readonly PressAgentWorkflowEventV1[], sourceNodeId: string): string | undefined {
  return latestPrior(events, (event) => isStageTerminal(event, sourceNodeId))?.eventId;
}

function terminalCausation(events: readonly PressAgentWorkflowEventV1[]): string | undefined {
  return latestPrior(events, (event) => isStageTerminal(event, "terminal-evaluation"))?.eventId;
}

export function hasPressAgentWorkflowFactProjection(event: PressAgentWorkflowEventV1): boolean {
  if (event.type === "run.started" || event.type === "run.finished") return true;
  if (event.type === "stage.state") return ["running", "succeeded", "warning", "failed", "blocked"].includes(event.stage.state);
  return ["taken", "taken-with-violation", "not-taken"].includes(event.edge.state);
}

export function projectPressAgentWorkflowFact(args: {
  event: PressAgentWorkflowEventV1;
  priorEvents: readonly PressAgentWorkflowEventV1[];
  factory: FactFactory;
  sequence: number;
}): EventV1 | null {
  const { event, priorEvents, factory, sequence } = args;
  const common = { logicalKey: `press-agent-workflow:${event.eventId}`, eventId: event.eventId, sequence, occurredAt: new Date(event.occurredAt) };

  if (event.type === "run.started") {
    return factory.create({ ...common, type: "dev.aiprocess.event.attempt.started.v1", data: { attemptId: event.runId } });
  }

  if (event.type === "stage.state") {
    const publishedNode = node(event.stage.id);
    if (event.stage.state === "running") {
      return factory.create({
        ...common,
        type: "dev.aiprocess.event.node.execution.started.v1",
        causationId: stageCausation(priorEvents, event.stage.id),
        data: { nodeId: event.stage.id, handlerRef: publishedNode.handlerRef },
      });
    }
    if (event.stage.state === "succeeded" || event.stage.state === "warning") {
      const started = stageStart(priorEvents, event.stage.id);
      const durationMs = started ? Date.parse(event.occurredAt) - Date.parse(started.occurredAt) : undefined;
      return factory.create({
        ...common,
        type: "dev.aiprocess.event.node.execution.completed.v1",
        causationId: started?.eventId,
        data: {
          nodeId: event.stage.id,
          handlerRef: publishedNode.handlerRef,
          ...(durationMs !== undefined && durationMs >= 0 ? { durationMs } : {}),
        },
      });
    }
    if (event.stage.state === "failed" || event.stage.state === "blocked") {
      return factory.create({
        ...common,
        type: "dev.aiprocess.event.node.execution.failed.v1",
        causationId: stageStart(priorEvents, event.stage.id)?.eventId,
        data: {
          nodeId: event.stage.id,
          handlerRef: publishedNode.handlerRef,
          errorCode: event.stage.findingCode ?? (event.stage.state === "blocked" ? "NODE_EXECUTION_BLOCKED" : "NODE_EXECUTION_FAILED"),
        },
      });
    }
    return null;
  }

  if (event.type === "edge.state") {
    const publishedTransition = transition(event.edge.id);
    const transitionData = {
      transitionId: event.edge.id,
      sourceNodeId: event.edge.source,
      targetNodeId: event.edge.target,
      decisionRef: publishedTransition.decisionRef,
    };
    if (event.edge.state === "taken" || event.edge.state === "taken-with-violation") {
      return factory.create({
        ...common,
        type: "dev.aiprocess.event.transition.selected.v1",
        causationId: sourceTerminalCausation(priorEvents, event.edge.source),
        data: transitionData,
      });
    }
    if (event.edge.state === "not-taken") {
      return factory.create({
        ...common,
        type: "dev.aiprocess.event.transition.evaluated.v1",
        causationId: sourceTerminalCausation(priorEvents, event.edge.source),
        data: { ...transitionData, matched: false },
      });
    }
    return null;
  }

  const causationId = terminalCausation(priorEvents);
  if (event.run.status === "succeeded" || event.run.status === "warning") {
    return factory.create({ ...common, type: "dev.aiprocess.event.attempt.completed.v1", causationId, data: { attemptId: event.runId } });
  }
  return factory.create({
    ...common,
    type: "dev.aiprocess.event.attempt.failed.v1",
    causationId,
    data: {
      attemptId: event.runId,
      failureCode: event.run.findingCode ?? (event.run.status === "cancelled" ? "ATTEMPT_CANCELLED" : event.run.status === "blocked" ? "ATTEMPT_BLOCKED" : "ATTEMPT_FAILED"),
    },
  });
}
