import type {
  PressAiProcessDefinition,
  PressAiProcessEdge,
  PressAiProcessNode,
} from "@/domain/press-ai-debugger/processRegistry";

export const GRAPH_NODE_WIDTH = 150;
export const GRAPH_NODE_HEIGHT = 80;
/** Wide enough that the connector shows a real line and arrowhead, not just a chip. */
const COLUMN_GAP = 88;
const ROW_GAP = 36;
const PADDING = 16;

export type GraphNodePlacement = {
  node: PressAiProcessNode;
  x: number;
  y: number;
};

export type GraphEdgePlacement = {
  edge: PressAiProcessEdge;
  path: string;
  labelX: number;
  labelY: number;
};

export type GraphLayout = {
  nodes: GraphNodePlacement[];
  edges: GraphEdgePlacement[];
  width: number;
  height: number;
};

/**
 * Layered left-to-right layout. Columns come from the longest path to a node, so
 * a node that several branches reach still sits to the right of all of them, and
 * a node that fans out to two targets keeps both targets in the next column.
 * Sizing is derived from the placed content, so the drawing never leaves a band
 * of empty canvas the way a fixed viewBox did.
 */
export function layoutPressAiGraph(
  process: PressAiProcessDefinition,
): GraphLayout {
  const nodes = [...process.nodes].sort(
    (left, right) => left.sequence - right.sequence,
  );
  const incoming = new Map<string, PressAiProcessEdge[]>();
  for (const edge of process.edges.filter((item) => item.kind !== "ITERATION")) {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  }

  const depths = new Map<string, number>();
  const depthOf = (nodeId: string, seen: ReadonlySet<string>): number => {
    const cached = depths.get(nodeId);
    if (cached !== undefined) return cached;
    // A cycle would otherwise recurse forever; treat the revisit as depth 0.
    if (seen.has(nodeId)) return 0;
    const parents = incoming.get(nodeId) ?? [];
    const guard = new Set(seen).add(nodeId);
    const depth = parents.length
      ? Math.max(...parents.map((edge) => depthOf(edge.source, guard) + 1))
      : 0;
    depths.set(nodeId, depth);
    return depth;
  };
  for (const node of nodes) depthOf(node.id, new Set());

  const columns = new Map<number, PressAiProcessNode[]>();
  for (const node of nodes) {
    const depth = depths.get(node.id) ?? 0;
    columns.set(depth, [...(columns.get(depth) ?? []), node]);
  }

  const tallestColumn = Math.max(
    ...[...columns.values()].map((column) => column.length),
  );
  const contentHeight =
    tallestColumn * GRAPH_NODE_HEIGHT + (tallestColumn - 1) * ROW_GAP;

  const placements = new Map<string, GraphNodePlacement>();
  for (const [depth, column] of columns) {
    const columnHeight =
      column.length * GRAPH_NODE_HEIGHT + (column.length - 1) * ROW_GAP;
    const top = PADDING + (contentHeight - columnHeight) / 2;
    column.forEach((node, index) => {
      placements.set(node.id, {
        node,
        x: PADDING + depth * (GRAPH_NODE_WIDTH + COLUMN_GAP),
        y: top + index * (GRAPH_NODE_HEIGHT + ROW_GAP),
      });
    });
  }

  const edges: GraphEdgePlacement[] = [];
  for (const edge of [...process.edges].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    const source = placements.get(edge.source);
    const target = placements.get(edge.target);
    if (!source || !target) continue;
    const x1 = source.x + GRAPH_NODE_WIDTH;
    const y1 = source.y + GRAPH_NODE_HEIGHT / 2;
    const x2 = target.x;
    const y2 = target.y + GRAPH_NODE_HEIGHT / 2;
    if (edge.kind === "ITERATION") {
      const bottom = PADDING + contentHeight + 40;
      edges.push({ edge, path: `M ${x1} ${y1} C ${x1 + 40} ${bottom}, ${x2 - 40} ${bottom}, ${x2} ${y2}`, labelX: (x1 + x2) / 2, labelY: bottom });
      continue;
    }
    const bend = Math.max(24, (x2 - x1) / 2);
    edges.push({
      edge,
      path: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
      labelX: (x1 + x2) / 2,
      labelY: (y1 + y2) / 2,
    });
  }

  const maxDepth = Math.max(...depths.values(), 0);
  return {
    nodes: [...placements.values()],
    edges,
    width:
      PADDING * 2 + (maxDepth + 1) * GRAPH_NODE_WIDTH + maxDepth * COLUMN_GAP,
    height: PADDING * 2 + contentHeight + (process.edges.some((edge) => edge.kind === "ITERATION") ? 56 : 0),
  };
}
