import type { PressRagGuardrailVerdict } from "@/domain/evaluation/pressRagGuardrails";
import type { PressRagWorkflowStatus, PressRagWorkflowTraversal } from "@/domain/evaluation/pressRagWorkflowView";

export const PRESS_RAG_EDITABLE_FIELD_COPY: Readonly<Record<string, string>> = {
  prompt: "질문", hits: "검색 결과", tools: "도구 실행", responseBranch: "응답 분기",
  finalAnswer: "답변", summary: "요약", citations: "인용", mode: "모드", status: "상태",
  supportedClaims: "지원 주장 수", totalClaims: "전체 주장 수", reason: "안전 사유",
  errorCode: "오류 코드", latencyMs: "지연 시간", costMicros: "비용",
};

/**
 * Shared verdict and stage-status presentation so the header, rail, and lanes never disagree.
 *
 * Verdict chips carry their own solid background rather than a tint plus a `dark:` text
 * colour. A tinted pill has to know the page theme to stay legible, and `dark:` in this app
 * follows the OS setting rather than the `.dark` class — so a tinted chip goes unreadable for
 * anyone whose OS is in light mode. A solid chip is legible against either theme unaided.
 */
export const VERDICT_COPY: Readonly<Record<PressRagGuardrailVerdict, { icon: string; label: string; tone: string; stripe: string; rank: number }>> = {
  VIOLATION: { icon: "×", label: "위반", tone: "border-rose-700 bg-rose-700 text-white", stripe: "bg-rose-600", rank: 0 },
  NOT_EVALUABLE: { icon: "?", label: "평가 불가", tone: "border-amber-700 bg-amber-700 text-white", stripe: "bg-amber-600", rank: 1 },
  PASS: { icon: "✓", label: "지킴", tone: "border-emerald-700 bg-emerald-700 text-white", stripe: "bg-emerald-600", rank: 2 },
  NOT_APPLICABLE: { icon: "–", label: "해당 없음", tone: "border-border bg-muted text-muted-foreground", stripe: "bg-border", rank: 3 },
};

export const STATUS_COPY: Readonly<Record<PressRagWorkflowStatus, { label: string; verdict: PressRagGuardrailVerdict }>> = {
  RECORDED: { label: "기록됨", verdict: "NOT_APPLICABLE" },
  MATCH: { label: "기대와 일치", verdict: "PASS" },
  MISMATCH: { label: "불일치", verdict: "VIOLATION" },
  FAILED: { label: "실패 기록", verdict: "VIOLATION" },
  NOT_EVALUABLE: { label: "평가 불가", verdict: "NOT_EVALUABLE" },
  SKIPPED: { label: "건너뜀", verdict: "NOT_APPLICABLE" },
};

export const TRAVERSAL_COPY: Readonly<Record<PressRagWorkflowTraversal, string>> = {
  TRAVERSED: "실행됨",
  NOT_TRAVERSED: "실행 안 됨",
  UNKNOWN: "확인 불가",
};

export const EDGE_TRAVERSAL_COPY = {
  TAKEN: "이 경로로 진행",
  NOT_TAKEN: "이 경로로 진행 안 함",
  UNKNOWN: "확인 불가",
} as const;

/** A stage counts as broken when the recorded or tested run diverged from the expectation. */
export function isBrokenStatus(status: PressRagWorkflowStatus) {
  return status === "MISMATCH" || status === "FAILED";
}

export function VerdictChip({
  verdict, text, size = "sm",
}: {
  verdict: PressRagGuardrailVerdict;
  text?: string;
  size?: "sm" | "md";
}) {
  const copy = VERDICT_COPY[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-black ${copy.tone} ${size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]"}`}
    >
      <span aria-hidden="true">{copy.icon}</span>
      {text ?? copy.label}
    </span>
  );
}

export function StatusChip({ status, size = "sm" }: { status: PressRagWorkflowStatus; size?: "sm" | "md" }) {
  const copy = STATUS_COPY[status];
  return <VerdictChip verdict={copy.verdict} text={copy.label} size={size} />;
}
