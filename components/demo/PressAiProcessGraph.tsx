"use client";
import { useMemo, useRef, useState } from "react";
import { pressCreationProcess } from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";

const WIDTH = 1180;
const HEIGHT = 420;
export function PressAiProcessGraph(props: {
  attempt: PressAiCheckpointAttempt | null;
  busy: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onNode: (id: string) => void;
  onEdge: (id: string) => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 20, y: 60 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const positions = useMemo(
    () =>
      Object.fromEntries(
        pressCreationProcess.nodes.map((node) => [
          node.id,
          { x: node.sequence * 220 + 20, y: node.sequence % 2 ? 190 : 70 },
        ]),
      ),
    [],
  );
  const zoom = (delta: number) =>
    setScale((value) => Math.min(1.8, Math.max(0.45, value + delta)));
  const key = (event: React.KeyboardEvent, select: () => void) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      select();
    }
  };
  return (
    <section
      className="min-w-0 rounded-xl border border-border"
      aria-label="보도자료 체크포인트 그래프"
    >
      <div className="flex flex-wrap gap-2 border-b p-2">
        <button
          type="button"
          onClick={() => zoom(0.15)}
          className="min-h-11 rounded border px-3"
          aria-label="그래프 확대"
        >
          ＋
        </button>
        <button
          type="button"
          onClick={() => zoom(-0.15)}
          className="min-h-11 rounded border px-3"
          aria-label="그래프 축소"
        >
          －
        </button>
        <button
          type="button"
          onClick={() => {
            setScale(1);
            setOffset({ x: 20, y: 60 });
          }}
          className="min-h-11 rounded border px-3"
        >
          화면 맞춤
        </button>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-[420px] w-full touch-none bg-muted/20"
        onWheel={(event) => {
          event.preventDefault();
          zoom(event.deltaY < 0 ? 0.1 : -0.1);
        }}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) {
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              ox: offset.x,
              oy: offset.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }
        }}
        onPointerMove={(event) => {
          if (drag.current)
            setOffset({
              x: drag.current.ox + event.clientX - drag.current.x,
              y: drag.current.oy + event.clientY - drag.current.y,
            });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <defs>
          <marker
            id="checkpoint-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
          </marker>
        </defs>
        <g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>
          {pressCreationProcess.edges.map((edge) => {
            const source = positions[edge.source];
            const target = positions[edge.target];
            const transition = props.attempt?.transitions.find(
              (item) => item.edgeId === edge.id,
            );
            const color =
              transition?.verdict === "BLOCK"
                ? "#e11d48"
                : transition?.verdict === "WARN"
                  ? "#d97706"
                  : transition?.verdict === "PASS"
                    ? "#059669"
                    : "#64748b";
            const x1 = source.x + 180;
            const y1 = source.y + 40;
            const x2 = target.x;
            const y2 = target.y + 40;
            return (
              <g
                key={edge.id}
                role="button"
                tabIndex={0}
                aria-label={`${edge.id}: ${transition?.verdict ?? "PENDING"}`}
                onClick={() => props.onEdge(edge.id)}
                onKeyDown={(event) => key(event, () => props.onEdge(edge.id))}
                className="cursor-pointer focus:outline-none"
              >
                <path
                  d={`M ${x1} ${y1} C ${x1 + 55} ${y1}, ${x2 - 55} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={props.selectedEdgeId === edge.id ? 5 : 3}
                  markerEnd="url(#checkpoint-arrow)"
                />
                <rect
                  x={(x1 + x2) / 2 - 42}
                  y={(y1 + y2) / 2 - 15}
                  width="84"
                  height="26"
                  rx="8"
                  fill="white"
                  stroke={color}
                />
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 + 3}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={color}
                >
                  {transition?.verdict ?? "PENDING"}
                </text>
              </g>
            );
          })}
          {pressCreationProcess.nodes.map((node) => {
            const point = positions[node.id];
            const checkpoint = props.attempt?.checkpoints.find(
              (item) => item.nodeId === node.id,
            );
            const active = props.attempt?.activeNodeId === node.id;
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`${node.label}: ${active && props.busy ? "RUNNING" : active ? "ACTIVE" : (checkpoint?.mode ?? "WAITING")}`}
                onClick={() => props.onNode(node.id)}
                onKeyDown={(event) => key(event, () => props.onNode(node.id))}
                className="cursor-pointer focus:outline-none"
              >
                <rect
                  x={point.x}
                  y={point.y}
                  width="180"
                  height="80"
                  rx="14"
                  fill="white"
                  stroke={
                    props.selectedNodeId === node.id || active
                      ? "#2563eb"
                      : "#94a3b8"
                  }
                  strokeWidth={
                    active ? 4 : props.selectedNodeId === node.id ? 3 : 2
                  }
                />
                <text
                  x={point.x + 14}
                  y={point.y + 30}
                  fontSize="14"
                  fontWeight="800"
                >
                  {node.label}
                </text>
                <text
                  x={point.x + 14}
                  y={point.y + 55}
                  fontSize="11"
                  fill="#475569"
                >
                  {active && props.busy
                    ? "RUNNING"
                    : active
                      ? "ACTIVE"
                      : (checkpoint?.mode ?? "WAITING")}
                  {node.gate ? " · GATE" : ""}
                </text>
                {active && props.busy ? (
                  <circle
                    cx={point.x + 160}
                    cy={point.y + 22}
                    r="8"
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="3"
                    strokeDasharray="14 8"
                  >
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from={`0 ${point.x + 160} ${point.y + 22}`}
                      to={`360 ${point.x + 160} ${point.y + 22}`}
                      dur="0.8s"
                      repeatCount="indefinite"
                    />
                  </circle>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
    </section>
  );
}
