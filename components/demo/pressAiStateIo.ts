import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";

export type PressAiWorkbenchSelection =
  | { kind: "node"; nodeId: string }
  | { kind: "edge"; edgeId: string };

type StateIoAttempt = {
  status?: string;
  activeNodeId: string | null;
  checkpoints: Array<{ id?: string; nodeId: string; sequence: number; input?: unknown; output?: unknown }>;
  transitions?: Array<{
    id?: string;
    edgeId?: string;
    sequence?: number;
    sourceNodeId?: string;
    sourceCheckpointId?: string;
    targetNodeId: string;
    targetPayload: unknown;
    advancedAt: string | Date | null;
  }>;
  inputSnapshot?: unknown;
  startNodeId?: string;
};

export function defaultWorkbenchSelection(
  attempt: StateIoAttempt,
): PressAiWorkbenchSelection | null {
  if (
    (attempt.status === "INSPECTING" || attempt.status === "BLOCKED") &&
    attempt.transitions?.length
  ) {
    const transition = [...attempt.transitions].sort(
      (left, right) => (right.sequence ?? -1) - (left.sequence ?? -1),
    )[0];
    if (transition?.edgeId) return { kind: "edge", edgeId: transition.edgeId };
  }
  const nodeId = resolveStateIoNodeId(attempt, null);
  return nodeId ? { kind: "node", nodeId } : null;
}

export function sourceCheckpointForEdge<T extends StateIoAttempt>(
  attempt: T,
  edgeId: string,
) {
  const edge = pressCreationProcess.edges.find((item) => item.id === edgeId);
  if (!edge) return null;
  const transition = [...(attempt.transitions ?? [])]
    .filter((item) => item.edgeId === edgeId)
    .sort((left, right) => (right.sequence ?? -1) - (left.sequence ?? -1))[0];
  if (transition?.sourceCheckpointId) {
    const exact = attempt.checkpoints.find(
      (checkpoint) => checkpoint.id === transition.sourceCheckpointId,
    );
    if (exact) return exact;
  }
  return [...attempt.checkpoints]
    .filter((checkpoint) => checkpoint.nodeId === edge.source)
    .sort((left, right) => right.sequence - left.sequence)[0] ?? null;
}

export function projectSelectedTransition<T extends StateIoAttempt>(
  attempt: T,
  edgeId: string,
) {
  const edge = pressCreationProcess.edges.find((item) => item.id === edgeId);
  if (!edge) return null;
  const transitions = (attempt.transitions ?? []) as NonNullable<T["transitions"]>;
  const transition = [...transitions]
    .filter((item) => item.edgeId === edgeId)
    .sort((left, right) => (right.sequence ?? -1) - (left.sequence ?? -1))[0] ?? null;
  return {
    edge,
    transition,
    sourceCheckpoint: sourceCheckpointForEdge(attempt, edgeId),
  };
}

export function applicableCustomExpectations<T extends { edgeId?: string }>(
  expectations: readonly T[],
  edgeId: string,
) {
  return expectations.filter((item) => !item.edgeId || item.edgeId === edgeId);
}

export function reconcileWorkbenchSelection(
  selection: PressAiWorkbenchSelection | null,
  previous: StateIoAttempt,
  next: StateIoAttempt,
): PressAiWorkbenchSelection | null {
  if (!selection || selection.kind !== "node") return selection;
  const priorIds = new Set((previous.transitions ?? []).map((item) => item.id));
  const created = (next.transitions ?? []).find(
    (transition) =>
      transition.id &&
      !priorIds.has(transition.id) &&
      transition.sourceNodeId === selection.nodeId &&
      transition.edgeId,
  );
  return created?.edgeId ? { kind: "edge", edgeId: created.edgeId } : selection;
}

export function resolveStateIoNodeId(
  attempt: StateIoAttempt,
  selectedNodeId: string | null,
) {
  if (selectedNodeId) return selectedNodeId;
  if (attempt.activeNodeId) return attempt.activeNodeId;
  return [...attempt.checkpoints].sort(
    (left, right) => right.sequence - left.sequence,
  )[0]?.nodeId ?? null;
}

export function resolveStateIoPayload(
  attempt: StateIoAttempt,
  nodeId: string,
) {
  const checkpoint = attempt.checkpoints.find((item) => item.nodeId === nodeId);
  if (checkpoint) {
    return {
      input: checkpoint.input ?? null,
      output: checkpoint.output ?? null,
      inputSource: "저장된 호출 입력",
      outputSource: "저장된 실행 결과",
    } as const;
  }

  const incoming = attempt.transitions
    ?.filter(
      (item) => item.targetNodeId === nodeId && Boolean(item.advancedAt),
    )
    .at(-1);
  const initialInput =
    attempt.startNodeId === nodeId ? (attempt.inputSnapshot ?? null) : null;
  return {
    input: incoming?.targetPayload ?? initialInput,
    output: null,
    inputSource: incoming || initialInput ? "다음 호출에 전달될 입력" : "입력 대기",
    outputSource: "아직 실행 결과 없음",
  } as const;
}
