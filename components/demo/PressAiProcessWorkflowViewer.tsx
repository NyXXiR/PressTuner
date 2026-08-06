"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

import {
  getPressAiProcessDefinition,
  type PressAiProcessId,
} from "@/domain/press-ai-debugger/processRegistry";
import { PressAiProcessNodeDetail } from "./PressAiProcessNodeDetail";
import type { ReturnTypeOfProjection } from "./pressAiProcessTypes";

const edgeTone = {
  moving: "bg-primary animate-pulse",
  taken: "bg-emerald-500",
  "taken-with-violation": "bg-amber-500",
  blocked: "bg-rose-500",
  pending: "bg-border",
  "not-taken": "bg-muted",
} as const;

export function PressAiProcessWorkflowViewer(props: {
  processId: PressAiProcessId;
  projection: ReturnTypeOfProjection;
  runId: string | null;
}) {
  const process = getPressAiProcessDefinition(props.processId);
  const failing = process.nodes.find(
    (node) => props.projection.nodes[node.id]?.state === "failed",
  );
  const [selected, setSelected] = useState(process.nodes[0].id);

  useEffect(() => {
    setSelected(process.nodes[0].id);
  }, [process]);
  useEffect(() => {
    if (failing) setSelected(failing.id);
  }, [failing]);

  const node =
    process.nodes.find((entry) => entry.id === selected) ?? process.nodes[0];

  return (
    <div className="mt-6">
      <div
        className="max-w-full overflow-x-auto pb-3"
        aria-label={`${process.label} 워크플로`}
      >
        <div className="flex min-w-max items-center gap-2">
          {process.nodes.map((entry, index) => {
            const state = props.projection.nodes[entry.id]?.state ?? "waiting";
            const previous = index > 0 ? process.nodes[index - 1] : null;
            const edge = previous
              ? process.edges.find(
                  (candidate) =>
                    candidate.source === previous.id &&
                    candidate.target === entry.id,
                )
              : null;
            const edgeState = edge
              ? props.projection.edges[edge.id]?.state ?? "pending"
              : "pending";

            return (
              <div key={entry.id} className="contents">
                {index ? (
                  <span
                    aria-label={`${previous?.label}에서 ${entry.label}: ${edgeState}`}
                    className={`h-1 w-8 rounded ${edgeTone[edgeState]}`}
                  />
                ) : null}
                <button
                  type="button"
                  aria-pressed={selected === entry.id}
                  onClick={() => setSelected(entry.id)}
                  className={`min-h-24 w-36 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    selected === entry.id
                      ? "border-primary bg-primary/10"
                      : "border-border"
                  } ${state === "running" ? "animate-pulse" : ""}`}
                >
                  <strong className="flex items-center gap-2 text-sm">
                    {state === "running" ? (
                      <LoaderCircle
                        aria-hidden="true"
                        className="size-4 animate-spin"
                      />
                    ) : null}
                    {entry.label}
                  </strong>
                  <span className="mt-2 block text-xs text-muted-foreground">
                    {state}
                  </span>
                  {entry.gate ? (
                    <span className="mt-2 block text-xs font-bold text-amber-700">
                      확인 단계
                    </span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <ol className="grid gap-2 text-sm sm:grid-cols-2">
        {process.edges.map((edge) => (
          <li key={edge.id} className="rounded-lg border border-border p-3">
            <strong>
              {process.nodes.find((node) => node.id === edge.source)?.label} →{" "}
              {process.nodes.find((node) => node.id === edge.target)?.label}
            </strong>
            <span className="mt-1 block text-xs text-muted-foreground">
              전달: {edge.payload.join(", ")}
            </span>
            <span className="mt-1 block text-xs">
              상태: {props.projection.edges[edge.id]?.state ?? "pending"}
            </span>
          </li>
        ))}
      </ol>

      <ol className="sr-only">
        {process.nodes.map((entry, index) => (
          <li key={entry.id}>
            {index + 1}. {entry.label}: {entry.description}
          </li>
        ))}
      </ol>
      <PressAiProcessNodeDetail runId={props.runId} node={node} />
    </div>
  );
}
