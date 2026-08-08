"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
import {
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  layoutPressAiGraph,
} from "./pressAiGraphLayout";
import { NODE_STATE_LABEL, nodeState } from "./pressAiRunProgress";

/** Logical canvas; the SVG scales this to whatever width the card gives it. */
const CANVAS_WIDTH = 1180;
const CANVAS_PADDING = 32;
/**
 * Canvas height follows the graph, with slack left over for panning. A fixed
 * height reserved the same band for a five-node chain as for a wide branching
 * graph, and most of it stayed empty.
 */
const CANVAS_SLACK = 150;
const MIN_CANVAS_HEIGHT = 260;
const MAX_CANVAS_HEIGHT = 420;
const MIN_SCALE = 0.45;
const MAX_SCALE = 1.8;

const VERDICT_LABEL: Record<string, string> = {
  PASS: "통과",
  WARN: "주의",
  BLOCK: "차단",
  PENDING: "대기",
};

const clampScale = (value: number) =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

/**
 * Pannable, zoomable node canvas. Node positions come from the layered layout
 * rather than a hardcoded zigzag, so a node that fans out to two targets keeps
 * both targets in the next column and a merge node stays right of every path
 * feeding it. "화면 맞춤" derives its transform from the measured graph, so the
 * canvas opens centered on the content instead of a fixed offset.
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
  /** A terminal node has nothing to wire onward, so it gets no output port. */
  const hasOutgoing = useMemo(
    () => new Set(layout.edges.map(({ edge }) => edge.source)),
    [layout],
  );
  const canvasHeight = Math.min(
    MAX_CANVAS_HEIGHT,
    Math.max(MIN_CANVAS_HEIGHT, Math.round(layout.height + CANVAS_SLACK)),
  );
  const fit = useMemo(() => {
    const scale = clampScale(
      Math.min(
        (CANVAS_WIDTH - CANVAS_PADDING * 2) / layout.width,
        (canvasHeight - CANVAS_PADDING * 2) / layout.height,
      ),
    );
    return {
      scale,
      x: (CANVAS_WIDTH - layout.width * scale) / 2,
      y: (canvasHeight - layout.height * scale) / 2,
    };
  }, [layout, canvasHeight]);

  const [view, setView] = useState(fit);
  const svgRef = useRef<SVGSVGElement>(null);
  /** Wheel zoom applies only once the canvas is focused, so scrolling past it
   *  still scrolls the page. Read through a ref because the listener is bound
   *  natively and must not be torn down on every focus change. */
  const [engaged, setEngaged] = useState(false);
  const engagedRef = useRef(false);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    ox: number;
    oy: number;
  } | null>(null);

  /** Zoom about the canvas centre so the graph does not drift off-screen. */
  const zoomBy = (delta: number) =>
    setView((current) => {
      const scale = clampScale(current.scale + delta);
      const ratio = scale / current.scale;
      return {
        scale,
        x: CANVAS_WIDTH / 2 - (CANVAS_WIDTH / 2 - current.x) * ratio,
        y: canvasHeight / 2 - (canvasHeight / 2 - current.y) * ratio,
      };
    });

  // React registers `wheel` passively at the root, so preventDefault inside
  // onWheel is ignored and the browser scrolls (or zooms) anyway. Bind natively.
  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!engagedRef.current || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      setView((current) => {
        const scale = clampScale(current.scale + (event.deltaY < 0 ? 0.12 : -0.12));
        const ratio = scale / current.scale;
        return {
          scale,
          x: CANVAS_WIDTH / 2 - (CANVAS_WIDTH / 2 - current.x) * ratio,
          y: canvasHeight / 2 - (canvasHeight / 2 - current.y) * ratio,
        };
      });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [canvasHeight]);

  const setEngagement = (value: boolean) => {
    engagedRef.current = value;
    setEngaged(value);
  };

  const activate = (event: React.KeyboardEvent, select: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  };

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        <button
          type="button"
          onClick={() => zoomBy(0.15)}
          className="min-h-11 rounded border border-border px-3 font-bold hover:bg-muted"
          aria-label="그래프 확대"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => zoomBy(-0.15)}
          className="min-h-11 rounded border border-border px-3 font-bold hover:bg-muted"
          aria-label="그래프 축소"
        >
          －
        </button>
        <button
          type="button"
          onClick={() => setView(fit)}
          className="min-h-11 rounded border border-border px-3 text-sm font-bold hover:bg-muted"
        >
          화면 맞춤
        </button>
        <span className="ml-auto text-xs text-muted-foreground">
          {Math.round(view.scale * 100)}% · 드래그로 이동 ·{" "}
          {engaged ? "휠 또는 +/- 키로 확대" : "캔버스를 클릭하면 휠로 확대"}
        </span>
      </div>

      <svg
        ref={svgRef}
        tabIndex={0}
        viewBox={`0 0 ${CANVAS_WIDTH} ${canvasHeight}`}
        // pan-y keeps vertical page scrolling on touch; horizontal drag pans.
        style={{ height: canvasHeight, touchAction: "pan-y" }}
        className="w-full cursor-grab bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary active:cursor-grabbing"
        role="group"
        aria-label="보도자료 체크포인트 그래프. 클릭하면 휠과 +/- 키로 확대할 수 있습니다."
        onFocus={() => setEngagement(true)}
        onBlur={() => setEngagement(false)}
        onKeyDown={(event) => {
          if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            zoomBy(0.15);
          } else if (event.key === "-" || event.key === "_") {
            event.preventDefault();
            zoomBy(-0.15);
          } else if (event.key === "0") {
            event.preventDefault();
            setView(fit);
          }
        }}
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget) return;
          drag.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            ox: view.x,
            oy: view.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (!state || state.pointerId !== event.pointerId) return;
          // Client pixels are canvas units scaled by the rendered width.
          const rect = event.currentTarget.getBoundingClientRect();
          const unit = rect.width ? CANVAS_WIDTH / rect.width : 1;
          setView((current) => ({
            ...current,
            x: state.ox + (event.clientX - state.x) * unit,
            y: state.oy + (event.clientY - state.y) * unit,
          }));
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId === event.pointerId) drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <defs>
          <marker
            id="checkpoint-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
          <pattern
            id="checkpoint-grid"
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1.5" cy="1.5" r="1.5" className="fill-border/60" />
          </pattern>
        </defs>
        <rect
          width={CANVAS_WIDTH}
          height={canvasHeight}
          fill="url(#checkpoint-grid)"
          pointerEvents="none"
        />

        <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
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
                    : "stroke-muted-foreground/60 text-muted-foreground";
            return (
              <g
                key={edge.id}
                role="button"
                tabIndex={0}
                aria-label={`${edge.id} 전이: ${VERDICT_LABEL[verdict]}`}
                onClick={() => props.onEdge(edge.id)}
                onKeyDown={(event) =>
                  activate(event, () => props.onEdge(edge.id))
                }
                className={`cursor-pointer focus-visible:outline-none ${tone}`}
              >
                <path
                  d={path}
                  fill="none"
                  strokeWidth={selected ? 4 : 2.5}
                  strokeDasharray={verdict === "PENDING" ? "6 5" : undefined}
                  markerEnd="url(#checkpoint-arrow)"
                  className="stroke-[inherit]"
                />
                <rect
                  x={labelX - 21}
                  y={labelY - 32}
                  width="42"
                  height="20"
                  rx="7"
                  className="fill-card stroke-[inherit]"
                  strokeWidth={selected ? 2 : 1.5}
                />
                <text
                  x={labelX}
                  y={labelY - 18}
                  textAnchor="middle"
                  fontSize="10"
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
                onKeyDown={(event) =>
                  activate(event, () => props.onNode(node.id))
                }
                className="cursor-pointer focus-visible:outline-none"
              >
                {selected ? (
                  <rect
                    x={x - 4}
                    y={y - 4}
                    width={GRAPH_NODE_WIDTH + 8}
                    height={GRAPH_NODE_HEIGHT + 8}
                    rx="18"
                    fill="none"
                    className="stroke-primary/50"
                    strokeWidth="2"
                  />
                ) : null}
                <rect
                  x={x}
                  y={y}
                  width={GRAPH_NODE_WIDTH}
                  height={GRAPH_NODE_HEIGHT}
                  rx="14"
                  className={`fill-card ${tone}`}
                  strokeWidth={state === "WAITING" ? 2 : 3}
                />
                {/* Output port only: the arrowhead already marks the input end,
                    and a dot at both ends made the connector read as two-way. */}
                {hasOutgoing.has(node.id) ? (
                  <circle
                    cx={x + GRAPH_NODE_WIDTH}
                    cy={y + GRAPH_NODE_HEIGHT / 2}
                    r="4"
                    className="fill-background stroke-border"
                    strokeWidth="2"
                  />
                ) : null}
                <text
                  x={x + 16}
                  y={y + 32}
                  fontSize="14"
                  fontWeight="800"
                  className="fill-foreground"
                >
                  {node.sequence + 1}. {node.label}
                </text>
                <text
                  x={x + 16}
                  y={y + 56}
                  fontSize="11"
                  className="fill-muted-foreground"
                >
                  {NODE_STATE_LABEL[state]}
                  {node.gate ? " · 게이트" : ""}
                </text>
                {running ? (
                  <circle
                    cx={x + GRAPH_NODE_WIDTH - 20}
                    cy={y + 24}
                    r="8"
                    fill="none"
                    className="stroke-primary"
                    strokeWidth="3"
                    strokeDasharray="14 8"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from={`0 ${x + GRAPH_NODE_WIDTH - 20} ${y + 24}`}
                      to={`360 ${x + GRAPH_NODE_WIDTH - 20} ${y + 24}`}
                      dur="0.9s"
                      repeatCount="indefinite"
                    />
                  </circle>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
