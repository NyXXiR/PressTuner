import {
  PRODUCER_CAPABILITIES,
  PRODUCER_PROTOCOL_VERSION,
  OPS_PRODUCER_SDK_VERSION,
  computeWorkflowDefinitionHash,
  WorkflowManifestSchema,
  type WorkflowManifest,
} from "@nyxxir/ops-producer";

import {
  getPressAiProcessDefinition,
  type PressAiProcessId,
  type PressAiProcessNode,
} from "./processRegistry";

const PRODUCER = { id: "press-tuner", sdkVersion: OPS_PRODUCER_SDK_VERSION } as const;

function stageKind(node: PressAiProcessNode): WorkflowManifest["stages"][number]["kind"] {
  if (node.id === "request-intake") return "INTAKE";
  if (node.id === "retrieval-execution" || node.id === "article-initialization") return "TOOL_EXECUTION";
  if (node.id === "evidence-decision") return "DECISION";
  if (node.id === "response-behavior") return "RESPONSE";
  if (node.id === "verification") return "VERIFICATION";
  if (node.id === "fallback") return "FALLBACK";
  if (node.id === "terminal-evaluation") return "TERMINAL";
  return "TRANSFORM";
}

export async function buildPressAiWorkflowManifest(
  processId: PressAiProcessId,
  overrides: { workflowId?: string; workflowVersion?: string } = {},
): Promise<WorkflowManifest> {
  const process = getPressAiProcessDefinition(processId);
  const outgoingCount = new Map<string, number>();
  for (const edge of process.edges) {
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);
  }
  const stages = process.nodes.map((node, ordinal) => {
    const gateIds = [
      ...(node.gate ? [node.gate.id] : []),
      ...process.edges.flatMap((edge) => edge.source === node.id && edge.humanGate ? [edge.humanGate.id] : []),
    ].filter((gateId, index, all) => all.indexOf(gateId) === index);
    return {
      id: node.id,
      label: node.label,
      kind: ordinal === process.nodes.length - 1 ? "TERMINAL" as const : stageKind(node),
      ...(gateIds.length ? { gateIds } : {}),
    };
  });
  const edges = process.edges.map((edge) => ({
    id: edge.id,
    sourceStageId: edge.source,
    targetStageId: edge.target,
    transitionType: edge.humanGate
      ? "GUARD" as const
      : (outgoingCount.get(edge.source) ?? 0) > 1
        ? "BRANCH" as const
        : edge.target === "terminal-evaluation"
          ? "TERMINAL" as const
          : "SEQUENCE" as const,
    label: edge.humanGate?.label ?? `${process.nodes.find((node) => node.id === edge.target)?.label ?? edge.target} 이동`,
  }));
  const draft: WorkflowManifest = {
    schemaVersion: "ops-console/workflow-manifest/v1",
    protocolVersion: PRODUCER_PROTOCOL_VERSION,
    producer: PRODUCER,
    workflow: {
      id: overrides.workflowId ?? `presstuner.${process.id}`,
      version: overrides.workflowVersion ?? process.version,
    },
    topology: "DAG",
    capabilities: [...PRODUCER_CAPABILITIES],
    stages,
    edges,
    definitionHash: `sha256:${"0".repeat(64)}`,
  };
  const definitionHash = await computeWorkflowDefinitionHash(draft);
  return WorkflowManifestSchema.parse({ ...draft, definitionHash });
}
