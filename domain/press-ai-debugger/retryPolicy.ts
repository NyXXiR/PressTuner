import { pressCreationProcess } from "./processRegistry";

type RetryCheckpoint = Readonly<{
  id: string;
  nodeId: string;
  sequence: number;
  mode: "EXECUTED" | "RESTORED";
}>;

type RetryAttempt = Readonly<{
  checkpoints: readonly RetryCheckpoint[];
}>;

export type RetryCheckpointChoice = Readonly<{
  checkpointId: string;
  nodeId: string;
  sequence: number;
  label: string;
  mode: RetryCheckpoint["mode"];
}>;

/** Registry order, rather than persisted order, is the canonical experiment order. */
export function getCompletedRetryCheckpoints(
  attempt: RetryAttempt,
): RetryCheckpointChoice[] {
  const firstByNode = new Map<string, RetryCheckpoint>();
  for (const checkpoint of attempt.checkpoints) {
    if (!firstByNode.has(checkpoint.nodeId)) {
      firstByNode.set(checkpoint.nodeId, checkpoint);
    }
  }

  return pressCreationProcess.nodes.flatMap((node) => {
    const checkpoint = firstByNode.get(node.id);
    return checkpoint
      ? [{
          checkpointId: checkpoint.id,
          nodeId: node.id,
          sequence: node.sequence,
          label: node.label,
          mode: checkpoint.mode,
        }]
      : [];
  });
}

/**
 * A rerun begins at the earliest persisted checkpoint. A truly blank attempt is
 * the only case that may use the registry's first node without a checkpoint.
 */
export function getBeginningRetryNodeId(attempt: RetryAttempt): string | null {
  const firstCompleted = getCompletedRetryCheckpoints(attempt)[0];
  if (firstCompleted) return firstCompleted.nodeId;
  return attempt.checkpoints.length === 0
    ? (pressCreationProcess.nodes[0]?.id ?? null)
    : null;
}

export function isRetryNodeValid(
  attempt: RetryAttempt,
  retryNodeId: string,
): boolean {
  if (
    getCompletedRetryCheckpoints(attempt).some(
      (choice) => choice.nodeId === retryNodeId,
    )
  ) {
    return true;
  }
  return (
    attempt.checkpoints.length === 0 &&
    retryNodeId === pressCreationProcess.nodes[0]?.id
  );
}
