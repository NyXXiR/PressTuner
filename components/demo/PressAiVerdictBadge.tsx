import { guardrailLabelKo } from "@/domain/press-ai-debugger/guardrailLabels";
import type { PressAiNodeState, PressAiVerdict } from "./pressAiRunProgress";
import { NODE_STATE_LABEL } from "./pressAiRunProgress";

const VERDICT_TONE: Record<PressAiVerdict | "PENDING", string> = {
  PASS: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  WARN: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  BLOCK: "border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  PENDING: "border-border bg-muted text-muted-foreground",
};

const VERDICT_MARK: Record<PressAiVerdict | "PENDING", string> = {
  PASS: "✓",
  WARN: "!",
  BLOCK: "✕",
  PENDING: "·",
};

const NODE_TONE: Record<PressAiNodeState, string> = {
  RUNNING: "border-primary/50 bg-primary/10 text-primary",
  ACTIVE: "border-primary/50 bg-primary/10 text-primary",
  EXECUTED:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  RESTORED: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  WAITING: "border-border bg-muted text-muted-foreground",
};

export function VerdictBadge(props: {
  verdict: PressAiVerdict | "PENDING";
  advanced?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-black tracking-tight ${VERDICT_TONE[props.verdict]}`}
    >
      <span aria-hidden="true">{VERDICT_MARK[props.verdict]}</span>
      {props.verdict}
      {props.advanced ? <span className="font-bold">· 통과</span> : null}
    </span>
  );
}

/** One guardrail, one chip: the whole guardrail set stays visible without opening a panel. */
export function GuardrailChip(props: {
  guardrailId: string;
  verdict: PressAiVerdict;
  origin?: "MANDATORY" | "CASE_EXPECTATION";
}) {
  return (
    <span
      title={props.guardrailId}
      className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-bold ${VERDICT_TONE[props.verdict]}`}
    >
      <span aria-hidden="true">{VERDICT_MARK[props.verdict]}</span>
      <span className="truncate">{guardrailLabelKo(props.guardrailId)}</span>
      {props.origin === "CASE_EXPECTATION" ? (
        <span className="font-normal opacity-70">케이스</span>
      ) : null}
    </span>
  );
}

export function PendingGuardrailChip(props: { guardrailId: string }) {
  return (
    <span
      title={props.guardrailId}
      className="inline-flex max-w-full items-center gap-1 rounded border border-dashed border-border px-1.5 py-0.5 text-[11px] font-bold text-muted-foreground"
    >
      <span aria-hidden="true">·</span>
      <span className="truncate">{guardrailLabelKo(props.guardrailId)}</span>
    </span>
  );
}

export function NodeStateBadge(props: { state: PressAiNodeState }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-black ${NODE_TONE[props.state]}`}
    >
      {props.state === "RUNNING" ? (
        <span
          aria-hidden="true"
          className="inline-block size-2.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {NODE_STATE_LABEL[props.state]}
    </span>
  );
}
