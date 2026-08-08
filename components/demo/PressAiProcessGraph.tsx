"use client";
import { useMemo } from "react";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
import {
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  layoutPressAiGraph,
} from "./pressAiGraphLayout";
import { NODE_STATE_LABEL, nodeState } from "./pressAiRunProgress";

const VERDICT_LABEL: Record<string, string> = {
  PASS: "통과",
  WARN: "주의",
  BLOCK: "차단",
  PENDING: "대기",
};

/**
 * Boxes and arrows, because the process is a graph: a node may fan out to two
 * targets and a later node may merge several paths, which a single-file rail
 * cannot express. The layout is measured rather than fixed, so the drawing is
 * exactly as tall as the graph needs — the old canvas reserved 420px and left
 * most of it empty — and the page, not the SVG, owns wheel and touch scrolling.
 */
export function PressAiProcessGraph(props: {
  attempt: PressAiCheckpointAttempt | null;
  busy: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onNode: (id: string) => void;
  onEdge: (id: string) => void;
}) {
  const layout = useMemo(() => layoutPressAiGraph(pressCreationProcess), []);
  const activate = (event: React.KeyboardEvent, select: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  };
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width={layout.width}
        height={layout.height}
        role="group"
        aria-label="보도자료 체크포인트 그래프"
        className="max-w-none"
      >
        <defs>
          <marker
            id="checkpoint-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>

        {layout.edges.map(({ edge, path, labelX, labelY }) => {
          const transition = props.attempt?.transitions.find(
            (item) => item.edgeId === edge.id,
          );
          const verdict = transition?.verdict ?? "PENDING";
          const selected = props.selectedEdgeId === edge.id;
          const tone =
            verdict === "BLOCK"
              ? "stroke-rose-500 text-rose-600 dark:text-rose-300"
              : verdict === "WARN"
                ? "stroke-amber-500 text-amber-600 dark:text-amber-300"
                : verdict === "PASS"
                  ? "stroke-emerald-500 text-emerald-600 dark:text-emerald-300"
                  : "stroke-border text-muted-foreground";
          return (
            <g
              key={edge.id}
              role="button"
              tabIndex={0}
              aria-label={`${edge.id} 전이: ${VERDICT_LABEL[verdict]}`}
              onClick={() => props.onEdge(edge.id)}
              onKeyDown={(event) => activate(event, () => props.onEdge(edge.id))}
              className={`cursor-pointer focus-visible:outline-none ${tone}`}
            >
              <path
                d={path}
                fill="none"
                strokeWidth={selected ? 3 : 2}
                strokeDasharray={verdict === "PENDING" ? "5 4" : undefined}
                markerEnd="url(#checkpoint-arrow)"
                className="stroke-[inherit]"
              />
              <rect
                x={labelX - 20}
                y={labelY - 11}
                width="40"
                height="22"
                rx="7"
                className="fill-card stroke-[inherit]"
                strokeWidth={selected ? 2 : 1}
              />
              <text
                x={labelX}
                y={labelY + 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight="800"
                fill="currentColor"
              >
                {VERDICT_LABEL[verdict]}
              </text>
            </g>
          );
        })}

        {layout.nodes.map(({ node, x, y }) => {
          const state = nodeState(props.attempt, node, props.busy);
          const selected = props.selectedNodeId === node.id;
          const running = state === "RUNNING";
          const tone =
            state === "EXECUTED"
              ? "stroke-emerald-500"
              : state === "RESTORED"
                ? "stroke-sky-500"
                : state === "ACTIVE" || running
                  ? "stroke-primary"
                  : "stroke-border";
          return (
            <g
              key={node.id}
              role="button"
              tabIndex={0}
              aria-label={`${node.sequence + 1}. ${node.label}: ${NODE_STATE_LABEL[state]}`}
              onClick={() => props.onNode(node.id)}
              onKeyDown={(event) => activate(event, () => props.onNode(node.id))}
              className="cursor-pointer focus-visible:outline-none"
            >
              <rect
                x={x}
                y={y}
                width={GRAPH_NODE_WIDTH}
                height={GRAPH_NODE_HEIGHT}
                rx="12"
                className={`fill-card ${tone}`}
                strokeWidth={selected ? 3 : state === "WAITING" ? 1.5 : 2}
              />
              {selected ? (
                <rect
                  x={x + 3}
                  y={y + 3}
                  width={GRAPH_NODE_WIDTH - 6}
                  height={GRAPH_NODE_HEIGHT - 6}
                  rx="9"
                  fill="none"
                  className="stroke-primary/40"
                  strokeWidth="1"
                />
              ) : null}
              <text
                x={x + 14}
                y={y + 26}
                fontSize="13"
                fontWeight="800"
                className="fill-foreground"
              >
                {node.sequence + 1}. {node.label}
              </text>
              <text
                x={x + 14}
                y={y + 48}
                fontSize="11"
                className="fill-muted-foreground"
              >
                {NODE_STATE_LABEL[state]}
                {node.gate ? " · 게이트" : ""}
              </text>
              {running ? (
                <circle
                  cx={x + GRAPH_NODE_WIDTH - 18}
                  cy={y + 22}
                  r="7"
                  fill="none"
                  className="stroke-primary"
                  strokeWidth="2.5"
                  strokeDasharray="12 7"
                >
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from={`0 ${x + GRAPH_NODE_WIDTH - 18} ${y + 22}`}
                    to={`360 ${x + GRAPH_NODE_WIDTH - 18} ${y + 22}`}
                    dur="0.9s"
                    repeatCount="indefinite"
                  />
                </circle>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
