import type { GuardrailVerdict } from "./transitionGuardrails";

export const PRESS_AI_DEBUG_ERROR_CODES = {
  stale: "PRESS_AI_DEBUG_COMMAND_STALE", nodeNotActive: "PRESS_AI_DEBUG_NODE_NOT_ACTIVE", blocked: "PRESS_AI_DEBUG_EDGE_BLOCKED",
  warnAckRequired: "PRESS_AI_DEBUG_WARN_ACK_REQUIRED", humanAckRequired: "PRESS_AI_DEBUG_HUMAN_ACK_REQUIRED", reuse: "PRESS_AI_DEBUG_COMMAND_REUSE_CONFLICT", terminal: "PRESS_AI_DEBUG_ATTEMPT_TERMINAL",
  iterationLimit: "PRESS_AI_DEBUG_ITERATION_LIMIT_REACHED",
} as const;

export type AttemptMachineState = Readonly<{ activeNodeId: string | null; phase: "READY" | "INSPECTING" | "TERMINAL"; revision: number; pendingEdgeIds: readonly string[]; notTakenEdgeIds: readonly string[] }>;
export class AttemptMachineError extends Error { constructor(readonly code: string) { super(code); } }

export function createAttemptMachine(startNodeId: string): AttemptMachineState { return { activeNodeId: startNodeId, phase: "READY", revision: 0, pendingEdgeIds: [], notTakenEdgeIds: [] }; }
function revision(state: AttemptMachineState, expected: number) { if (state.revision !== expected) throw new AttemptMachineError(PRESS_AI_DEBUG_ERROR_CODES.stale); if (state.phase === "TERMINAL") throw new AttemptMachineError(PRESS_AI_DEBUG_ERROR_CODES.terminal); }

export function completeActiveNode(state: AttemptMachineState, args: { nodeId: string; expectedRevision: number; outgoingEdgeIds: readonly string[] }): AttemptMachineState {
  revision(state, args.expectedRevision); if (state.phase !== "READY" || state.activeNodeId !== args.nodeId) throw new AttemptMachineError(PRESS_AI_DEBUG_ERROR_CODES.nodeNotActive);
  return args.outgoingEdgeIds.length ? { ...state, activeNodeId: null, phase: "INSPECTING", revision: state.revision + 1, pendingEdgeIds: [...args.outgoingEdgeIds] } : { ...state, activeNodeId: null, phase: "TERMINAL", revision: state.revision + 1, pendingEdgeIds: [] };
}

export function advanceEdge(state: AttemptMachineState, args: { edgeId: string; targetNodeId: string; verdict: GuardrailVerdict; expectedRevision: number; warnAcknowledged: boolean; humanGateRequired?: boolean; humanGateAcknowledged?: boolean }): AttemptMachineState {
  revision(state, args.expectedRevision); if (state.phase !== "INSPECTING" || !state.pendingEdgeIds.includes(args.edgeId)) throw new AttemptMachineError(PRESS_AI_DEBUG_ERROR_CODES.nodeNotActive);
  if (args.verdict === "BLOCK" || args.verdict === "NOT_EVALUABLE") throw new AttemptMachineError(PRESS_AI_DEBUG_ERROR_CODES.blocked);
  if (args.verdict === "WARN" && !args.warnAcknowledged) throw new AttemptMachineError(PRESS_AI_DEBUG_ERROR_CODES.warnAckRequired);
  if (args.humanGateRequired && !args.humanGateAcknowledged) throw new AttemptMachineError(PRESS_AI_DEBUG_ERROR_CODES.humanAckRequired);
  return { activeNodeId: args.targetNodeId, phase: "READY", revision: state.revision + 1, pendingEdgeIds: [], notTakenEdgeIds: [...state.notTakenEdgeIds, ...state.pendingEdgeIds.filter((id) => id !== args.edgeId)] };
}
