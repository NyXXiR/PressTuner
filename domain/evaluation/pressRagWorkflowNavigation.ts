export function resolvePressRagWorkflowNavigationIndex(
  key: string,
  currentIndex: number,
  nodeCount: number,
): number {
  if (!Number.isInteger(currentIndex) || !Number.isInteger(nodeCount) || nodeCount <= 0) {
    return currentIndex;
  }
  const normalized = Math.min(Math.max(currentIndex, 0), nodeCount - 1);
  if (key === "Home") return 0;
  if (key === "End") return nodeCount - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (normalized + 1) % nodeCount;
  if (key === "ArrowLeft" || key === "ArrowUp") return (normalized - 1 + nodeCount) % nodeCount;
  return currentIndex;
}
