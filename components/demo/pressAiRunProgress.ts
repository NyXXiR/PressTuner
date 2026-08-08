import {
  pressCreationProcess,
  type PressAiProcessEdge,
  type PressAiProcessNode,
} from "@/domain/press-ai-debugger/processRegistry";
import type { PressAiCheckpointAttempt } from "@/lib/pressAiProcessDebuggerClient";

export type PressAiVerdict = "PASS" | "WARN" | "BLOCK";
export type PressAiNodeState =
  | "RUNNING"
  | "ACTIVE"
  | "EXECUTED"
  | "RESTORED"
  | "WAITING";

type Attempt = PressAiCheckpointAttempt;
type Transition = Attempt["transitions"][number];
type Checkpoint = Attempt["checkpoints"][number];

export const nodeAnchorId = (nodeId: string) => `press-ai-step-${nodeId}`;
export const edgeAnchorId = (edgeId: string) => `press-ai-edge-${edgeId}`;

/** One scroll target per timeline row, so the action bar can always point at the row it acts on. */
export function focusAnchor(anchorId: string) {
  const element = document.getElementById(anchorId);
  if (!element) return;
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.focus({ preventScroll: true });
}

export function nodeState(
  attempt: Attempt | null,
  node: PressAiProcessNode,
  busy: boolean,
): PressAiNodeState {
  const active = attempt?.activeNodeId === node.id;
  if (active && busy) return "RUNNING";
  if (active) return "ACTIVE";
  return (
    attempt?.checkpoints.find((item) => item.nodeId === node.id)?.mode ??
    "WAITING"
  );
}

/** One vocabulary for verdicts across the graph, the timeline and the action bar. */
export const VERDICT_LABEL: Record<PressAiVerdict | "PENDING", string> = {
  PASS: "통과",
  WARN: "주의",
  BLOCK: "차단",
  PENDING: "대기",
};

/** Attempt lifecycle as the operator reads it; the raw enum stays in `title`. */
export const ATTEMPT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "진행 중",
  INSPECTING: "전이 검사 중",
  COMPLETED: "완료",
  BLOCKED: "차단됨",
  FAILED: "실패",
  NOT_STARTED: "시작 전",
};

export const attemptStatusLabel = (status: string) =>
  ATTEMPT_STATUS_LABEL[status] ?? status;

export const NODE_STATE_LABEL: Record<PressAiNodeState, string> = {
  RUNNING: "실행 중",
  ACTIVE: "실행 대기",
  EXECUTED: "실행됨",
  RESTORED: "복원됨",
  WAITING: "대기",
};

/**
 * The one action the operator can take right now.
 * The attempt machine only ever offers a single move: run the active node, inspect the
 * pending edge, or restart from a blocked edge. Deriving it once keeps the primary
 * button in a fixed place instead of scattering it across node, edge and rewrite panels.
 */
export type PressAiNextAction =
  | {
      kind: "execute";
      label: string;
      hint: string;
      nodeId: string;
      anchorId: string;
    }
  | {
      kind: "rewrite";
      label: string;
      hint: string;
      nodeId: string;
      anchorId: string;
    }
  | {
      kind: "advance";
      label: string;
      hint: string;
      edgeId: string;
      anchorId: string;
      verdict: PressAiVerdict;
      needsWarnAck: boolean;
      humanGateLabel: string | null;
    }
  | {
      kind: "retry";
      label: string;
      hint: string;
      edgeId: string;
      nodeId: string;
      anchorId: string;
    }
  | { kind: "idle"; label: string; hint: string };

export function nextAction(attempt: Attempt | null): PressAiNextAction {
  if (!attempt)
    return {
      kind: "idle",
      label: "시도 없음",
      hint: "시도를 만들면 첫 노드가 활성화됩니다.",
    };
  const pending = attempt.transitions
    .filter((item) => !item.advancedAt)
    .sort((left, right) => left.sequence - right.sequence)[0];
  if (pending) {
    const edge = findEdge(pending.edgeId);
    const target = edge ? findNode(edge.target) : null;
    if (pending.verdict === "BLOCK")
      return {
        kind: "retry",
        label: "차단 지점부터 다시 실행",
        hint: `${pending.edgeId} 전이가 BLOCK 판정입니다. 재정의할 수 없습니다.`,
        edgeId: pending.edgeId,
        nodeId: pending.sourceNodeId,
        anchorId: edgeAnchorId(pending.edgeId),
      };
    return {
      kind: "advance",
      label: target
        ? `${target.sequence + 1}. ${target.label} 활성화`
        : "다음 노드 활성화",
      hint: `${pending.edgeId} 전이 판정: ${pending.verdict}`,
      edgeId: pending.edgeId,
      anchorId: edgeAnchorId(pending.edgeId),
      verdict: pending.verdict,
      needsWarnAck: pending.verdict === "WARN" && !pending.warnAcknowledgedAt,
      humanGateLabel:
        edge?.humanGate && !pending.humanGateAcknowledgedAt
          ? edge.humanGate.label
          : null,
    };
  }
  const active = attempt.activeNodeId ? findNode(attempt.activeNodeId) : null;
  if (active)
    return {
      kind: active.id === "selected-rewrite" ? "rewrite" : "execute",
      label: `${active.sequence + 1}. ${active.label} 실행`,
      hint:
        active.id === "selected-rewrite"
          ? "반영할 리뷰 노트를 고른 뒤 실행합니다."
          : active.description,
      nodeId: active.id,
      anchorId: nodeAnchorId(active.id),
    };
  return {
    kind: "idle",
    label: "남은 단계 없음",
    hint:
      attempt.status === "COMPLETED"
        ? "모든 노드를 실행하고 전이를 통과했습니다."
        : "실행할 활성 노드도, 검사 대기 중인 전이도 없습니다.",
  };
}

/** Node rows and edge rows in a single execution order, so lineage reads top to bottom. */
export type PressAiTimelineRow =
  | {
      kind: "node";
      key: string;
      node: PressAiProcessNode;
      checkpoint: Checkpoint | null;
      state: PressAiNodeState;
    }
  | {
      kind: "edge";
      key: string;
      edge: PressAiProcessEdge;
      transition: Transition | null;
    };

export function timelineRows(
  attempt: Attempt | null,
  busy: boolean,
): PressAiTimelineRow[] {
  const rows: PressAiTimelineRow[] = [];
  for (const node of [...pressCreationProcess.nodes].sort(
    (left, right) => left.sequence - right.sequence,
  )) {
    rows.push({
      kind: "node",
      key: `node:${node.id}`,
      node,
      checkpoint:
        attempt?.checkpoints.find((item) => item.nodeId === node.id) ?? null,
      state: nodeState(attempt, node, busy),
    });
    for (const edge of pressCreationProcess.edges
      .filter((item) => item.source === node.id)
      .sort((left, right) => left.sequence - right.sequence))
      rows.push({
        kind: "edge",
        key: `edge:${edge.id}`,
        edge,
        transition:
          attempt?.transitions.find((item) => item.edgeId === edge.id) ?? null,
      });
  }
  return rows;
}

export function findNode(nodeId: string) {
  return pressCreationProcess.nodes.find((item) => item.id === nodeId) ?? null;
}
export function findEdge(edgeId: string) {
  return pressCreationProcess.edges.find((item) => item.id === edgeId) ?? null;
}

/** Field-level preview of a checkpoint payload, so lineage is readable without opening raw JSON. */
export function payloadFields(value: unknown): { key: string; preview: string }[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== "object" || Array.isArray(value))
    return [{ key: "값", preview: previewValue(value) }];
  return Object.entries(value as Record<string, unknown>).map(
    ([key, item]) => ({ key, preview: previewValue(item) }),
  );
}

export function previewValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string")
    return value.length > 72 ? `${value.slice(0, 72)}…` : value || '""';
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) return `${value.length}개 항목`;
  return `${Object.keys(value as Record<string, unknown>).length}개 필드`;
}
