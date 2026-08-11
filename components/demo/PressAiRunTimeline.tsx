"use client";

import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";
import { pressCreationProcess, type PressAiProcessDefinition } from "@/domain/press-ai-debugger/processRegistry";
import { PressAiEdgeInspector } from "./PressAiEdgeInspector";
import {
  GuardrailChip,
  NodeStateBadge,
  PendingGuardrailChip,
  VerdictBadge,
} from "./PressAiVerdictBadge";
import {
  edgeAnchorId,
  findNode,
  nodeAnchorId,
  payloadFields,
  timelineRows,
} from "./pressAiRunProgress";

function FieldList(props: {
  title: string;
  value: unknown;
  empty: string;
}) {
  const fields = payloadFields(props.value);
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
        {props.title}
      </p>
      {fields.length === 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">{props.empty}</p>
      ) : (
        <dl className="mt-1 space-y-0.5">
          {fields.map((field) => (
            <div key={field.key} className="flex min-w-0 gap-2 text-xs">
              <dt className="shrink-0 font-bold text-foreground">
                {field.key}
              </dt>
              <dd className="min-w-0 flex-1 truncate text-muted-foreground">
                {field.preview}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function RawJson(props: { label: string; value: unknown }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {props.label}
      </summary>
      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">
        {JSON.stringify(props.value ?? null, null, 2)}
      </pre>
    </details>
  );
}

/**
 * Nodes and edges in one execution-ordered list: what each node produced, what the edge
 * carried forward, and which guardrails judged it — all visible without jumping between
 * a graph, an outline and a separate inspector panel.
 */
export function PressAiRunTimeline(props: {
  attempt: PressAiCheckpointAttempt;
  busy: boolean;
  /** Row the action bar points at: expanded unless the operator collapsed it. */
  defaultOpenKey?: string | null;
  open: Record<string, boolean>;
  onOpenChange: (open: Record<string, boolean>) => void;
  process?: PressAiProcessDefinition;
}) {
  const process = props.process ?? pressCreationProcess;
  const rows = timelineRows(props.attempt, props.busy, process);
  const open = props.open;
  const isOpen = (key: string) => open[key] ?? key === props.defaultOpenKey;
  const toggle = (key: string) =>
    props.onOpenChange({ ...open, [key]: !isOpen(key) });
  const expandable = rows.filter(
    (row) => row.kind === "node" || Boolean(row.transition),
  );
  const allOpen = expandable.every((row) => isOpen(row.key));

  return (
    <section
      className="min-w-0 rounded-xl border border-border"
      aria-label="보이는 순서형 실행 타임라인"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h3 className="font-black">실행 타임라인</h3>
        <button
          type="button"
          onClick={() =>
            props.onOpenChange(
              Object.fromEntries(expandable.map((row) => [row.key, !allOpen])),
            )
          }
          className="min-h-9 rounded border border-border px-3 text-xs font-bold"
        >
          {allOpen ? "모두 접기" : "모두 펼치기"}
        </button>
      </div>
      <ol className="divide-y divide-border">
        {rows.map((row) => {
          const expanded = isOpen(row.key);
          if (row.kind === "node") {
            const { node, checkpoint } = row;
            return (
              <li
                key={row.key}
                id={nodeAnchorId(node.id)}
                tabIndex={-1}
                className="min-w-0 scroll-mt-24 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <button
                  type="button"
                  onClick={() => toggle(row.key)}
                  aria-expanded={expanded}
                  className="flex w-full min-w-0 items-center gap-2 text-left"
                >
                  <span className="size-6 shrink-0 rounded-full border border-border text-center text-xs font-black leading-6">
                    {node.sequence + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {node.label}
                  </span>
                  <NodeStateBadge state={row.state} />
                  <span
                    aria-hidden="true"
                    className="text-xs text-muted-foreground"
                  >
                    {expanded ? "▾" : "▸"}
                  </span>
                </button>
                {expanded ? (
                  <div className="mt-3 min-w-0 space-y-3 pl-8">
                    <p className="text-xs text-muted-foreground">
                      {node.description}
                    </p>
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      <FieldList
                        title="입력"
                        value={checkpoint?.input}
                        empty="아직 실행되지 않았습니다."
                      />
                      <FieldList
                        title="출력"
                        value={checkpoint?.output}
                        empty="아직 결과가 없습니다."
                      />
                    </div>
                    {checkpoint ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          체크포인트 {checkpoint.mode} · 사용 할당량{" "}
                          {checkpoint.quotaUnits}
                        </p>
                        <RawJson
                          label="원본 입력·출력 JSON"
                          value={{
                            input: checkpoint.input,
                            output: checkpoint.output,
                          }}
                        />
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        확인 사항: {node.troubleshooting}
                      </p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          }
          const { edge, transition } = row;
          const observed = new Set(
            transition?.observations.map((item) => item.guardrailId) ?? [],
          );
          // Nothing has been judged yet, so expanding would only show `null`
          // and a placeholder sentence. Offer a one-line note instead.
          const evaluated = Boolean(transition);
          return (
            <li
              key={row.key}
              id={edgeAnchorId(edge.id)}
              tabIndex={-1}
              className="min-w-0 scroll-mt-24 bg-muted/30 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <button
                type="button"
                onClick={() => (evaluated ? toggle(row.key) : undefined)}
                aria-expanded={evaluated ? expanded : undefined}
                aria-disabled={evaluated ? undefined : true}
                className={`flex w-full min-w-0 items-center gap-2 text-left ${evaluated ? "" : "cursor-default"}`}
              >
                <span
                  aria-hidden="true"
                  className="w-6 shrink-0 text-center text-muted-foreground"
                >
                  ↓
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">
                  {findNode(edge.source, process)?.label ?? edge.source} →{" "}
                  {findNode(edge.target, process)?.label ?? edge.target}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {edge.id}
                  </span>
                </span>
                <VerdictBadge
                  verdict={transition?.verdict ?? "PENDING"}
                  advanced={Boolean(transition?.advancedAt)}
                />
                <span
                  aria-hidden="true"
                  className="text-xs text-muted-foreground"
                >
                  {evaluated ? (expanded ? "▾" : "▸") : ""}
                </span>
              </button>
              <div className="mt-2 flex flex-wrap items-center gap-1 pl-8">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                  전달
                </span>
                {edge.payload.map((key) => (
                  <span
                    key={key}
                    className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-bold"
                  >
                    {key}
                  </span>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-8">
                <span className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                  가드레일
                </span>
                {transition?.observations.map((item) => (
                  <GuardrailChip
                    key={item.id}
                    guardrailId={item.guardrailId}
                    verdict={item.verdict}
                    origin={item.origin}
                  />
                ))}
                {edge.mandatoryGuardrailIds
                  .filter((id) => !observed.has(id))
                  .map((id) => (
                    <PendingGuardrailChip key={id} guardrailId={id} />
                  ))}
              </div>
              {!evaluated ? (
                <p className="mt-2 pl-8 text-xs text-muted-foreground">
                  소스 노드를 실행하면 이 전이가 평가됩니다.
                </p>
              ) : null}
              {evaluated && expanded ? (
                <div className="mt-3 pl-8">
                  <PressAiEdgeInspector
                    attempt={props.attempt}
                    edgeId={edge.id}
                    process={process}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
