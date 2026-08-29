export const REORDER_AUTO_SCROLL_EDGE_PX = 80;
export const REORDER_AUTO_SCROLL_MAX_PX_PER_FRAME = 20;

export function reorderAutoScrollVelocity(
  pointerY: number,
  bounds: Pick<DOMRect, "top" | "bottom">,
  edgeSize = REORDER_AUTO_SCROLL_EDGE_PX,
  maxSpeed = REORDER_AUTO_SCROLL_MAX_PX_PER_FRAME,
) {
  if (edgeSize <= 0 || maxSpeed <= 0) return 0;
  if (pointerY < bounds.top + edgeSize) {
    const proximity = Math.min(1, Math.max(0, (bounds.top + edgeSize - pointerY) / edgeSize));
    return -maxSpeed * proximity * proximity;
  }
  if (pointerY > bounds.bottom - edgeSize) {
    const proximity = Math.min(1, Math.max(0, (pointerY - (bounds.bottom - edgeSize)) / edgeSize));
    return maxSpeed * proximity * proximity;
  }
  return 0;
}

export function nextReorderScrollTop(current: number, velocity: number, maximum: number) {
  return Math.min(Math.max(0, current + velocity), Math.max(0, maximum));
}
