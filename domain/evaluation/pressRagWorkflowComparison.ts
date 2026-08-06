import type { PressRagGuardrailVerdict } from "./pressRagGuardrails";
import type { PressRagSandboxProjection } from "./pressRagWorkflowSandbox";
import type {
  PressRagWorkflowNode,
  PressRagWorkflowNodeId,
  PressRagWorkflowStatus,
  PressRagWorkflowTraversal,
} from "./pressRagWorkflowView";

export type PressRagComparisonSection = "input" | "evidence" | "decisions" | "output";

export type PressRagStageSnapshot = Readonly<{
  id: PressRagWorkflowNodeId;
  status: PressRagWorkflowStatus;
  traversal: PressRagWorkflowTraversal;
  statusReason: string;
  reasonCode: string | null;
  reasonText: string | null;
}>;

export type PressRagWorkflowChange = Readonly<{
  kind: "status" | "traversal" | "reason" | "inspection";
  identity: string;
  label: string;
  recorded: string;
  tested: string;
  section: PressRagComparisonSection | null;
}>;

export type PressRagTransitionSnapshot = Readonly<{
  traversal: "TAKEN" | "NOT_TAKEN" | "UNKNOWN";
  gateVerdict: PressRagGuardrailVerdict;
}>;

export type PressRagTransitionComparison = Readonly<{
  id: string;
  source: PressRagWorkflowNodeId;
  target: PressRagWorkflowNodeId;
  condition: string;
  recorded: PressRagTransitionSnapshot;
  tested: PressRagTransitionSnapshot | null;
}>;

export type PressRagWorkflowComparison = Readonly<{
  recorded: PressRagStageSnapshot;
  tested: PressRagStageSnapshot | null;
  changes: readonly PressRagWorkflowChange[];
  transitions: readonly PressRagTransitionComparison[];
  exactParity: boolean | null;
}>;

const SECTIONS: readonly PressRagComparisonSection[] = ["input", "evidence", "decisions", "output"];

function snapshot(node: PressRagWorkflowNode): PressRagStageSnapshot {
  return {
    id: node.id,
    status: node.status,
    traversal: node.traversal,
    statusReason: node.statusReason,
    reasonCode: node.reasonCode,
    reasonText: node.reasonText,
  };
}

function reason(node: PressRagWorkflowNode) {
  return [node.statusReason, node.reasonCode, node.reasonText].filter(Boolean).join(" · ");
}

function gateVerdict(projection: PressRagSandboxProjection, edgeId: string): PressRagGuardrailVerdict {
  return projection.guardrails.byEdge[edgeId]?.find(({ gate }) => gate)?.verdict ?? "NOT_EVALUABLE";
}

/**
 * Projects one selected stage into an immutable recorded/test comparison. Inspection row
 * identity is section + key, which preserves domain order while allowing repeated keys in
 * different sections. Outgoing transitions remain owned by their source stage.
 */
export function projectPressRagWorkflowComparison(
  recorded: PressRagSandboxProjection,
  tested: PressRagSandboxProjection | null,
  selectedStageId: PressRagWorkflowNodeId,
): PressRagWorkflowComparison {
  const recordedNode = recorded.workflow.nodes.find(({ id }) => id === selectedStageId);
  if (!recordedNode) throw new Error(`PRESS_RAG_COMPARISON_STAGE_NOT_FOUND:${selectedStageId}`);
  const testedNode = tested?.workflow.nodes.find(({ id }) => id === selectedStageId) ?? null;
  const changes: PressRagWorkflowChange[] = [];

  if (testedNode) {
    if (recordedNode.status !== testedNode.status) changes.push({
      kind: "status", identity: "status", label: "단계 상태", recorded: recordedNode.status,
      tested: testedNode.status, section: null,
    });
    if (recordedNode.traversal !== testedNode.traversal) changes.push({
      kind: "traversal", identity: "traversal", label: "단계 통과", recorded: recordedNode.traversal,
      tested: testedNode.traversal, section: null,
    });
    if (reason(recordedNode) !== reason(testedNode)) changes.push({
      kind: "reason", identity: "reason", label: "판정 이유", recorded: reason(recordedNode),
      tested: reason(testedNode), section: null,
    });

    for (const section of SECTIONS) {
      const testedRows = new Map(testedNode.inspection[section].map((row) => [row.key, row]));
      const recordedKeys = new Set<string>();
      for (const row of recordedNode.inspection[section]) {
        recordedKeys.add(row.key);
        const next = testedRows.get(row.key);
        const nextValue = next?.value ?? "—";
        if (row.value !== nextValue) changes.push({
          kind: "inspection", identity: `${section}:${row.key}`, label: row.label,
          recorded: row.value, tested: nextValue, section,
        });
      }
      for (const row of testedNode.inspection[section]) {
        if (!recordedKeys.has(row.key)) changes.push({
          kind: "inspection", identity: `${section}:${row.key}`, label: row.label,
          recorded: "—", tested: row.value, section,
        });
      }
    }
  }

  const transitions = recorded.workflow.edges
    .filter(({ source }) => source === selectedStageId)
    .map((edge): PressRagTransitionComparison => {
      const testedEdge = tested?.workflow.edges.find(({ id }) => id === edge.id) ?? null;
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        condition: edge.decisionLabel,
        recorded: { traversal: edge.state, gateVerdict: gateVerdict(recorded, edge.id) },
        tested: testedEdge && tested
          ? { traversal: testedEdge.state, gateVerdict: gateVerdict(tested, testedEdge.id) }
          : null,
      };
    });

  return {
    recorded: snapshot(recordedNode),
    tested: testedNode ? snapshot(testedNode) : null,
    changes,
    transitions,
    exactParity: testedNode ? changes.length === 0 && transitions.every(({ recorded: left, tested: right }) =>
      right !== null && left.traversal === right.traversal && left.gateVerdict === right.gateVerdict) : null,
  };
}
