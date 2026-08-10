import { getPressAiProcessDefinition, type PressAiProcessId, type PressAiProcessNode } from "./processRegistry";
import { computeOpsConsoleWorkflowDefinitionHash, OpsConsoleWorkflowManifestSchema, OPS_CONSOLE_PRODUCER, OPS_CONSOLE_PROTOCOL_VERSION, OPS_CONSOLE_WORKFLOW_MANIFEST_VERSION, type OpsConsoleWorkflowManifest } from "@/domain/ai-telemetry/opsConsoleProducerContracts";

const identities = {
  "rag-query": { id: "presstuner.press-agent", version: "press-agent-v2", topology: "DAG" },
  "press-creation": { id: "presstuner.press-creation", version: "2.0.0", topology: "STATE_MACHINE" },
} as const;

function stageKind(processId: PressAiProcessId, node: PressAiProcessNode): OpsConsoleWorkflowManifest["stages"][number]["kind"] {
  if (node.id.includes("intake") || node.id.includes("initialization")) return "INTAKE";
  if (node.id.includes("retrieval")) return "TOOL_EXECUTION";
  if (node.id.includes("decision")) return "DECISION";
  if (node.id.includes("response") || node.id.includes("generation") || node.id.includes("rewrite")) return "RESPONSE";
  if (node.id.includes("verification")) return "VERIFICATION";
  if (node.id.includes("fallback")) return "FALLBACK";
  if (node.id.includes("terminal")) return "TERMINAL";
  return processId === "press-creation" ? "TRANSFORM" : "TOOL_EXECUTION";
}

export function buildOpsConsoleWorkflowManifest(processId: PressAiProcessId): OpsConsoleWorkflowManifest {
  const process = getPressAiProcessDefinition(processId);
  const identity = identities[processId];
  const nodes = [...process.nodes].sort((a, b) => a.sequence - b.sequence);
  const edges = [...process.edges].sort((a, b) => a.sequence - b.sequence);
  const base = {
    schemaVersion: OPS_CONSOLE_WORKFLOW_MANIFEST_VERSION,
    protocolVersion: OPS_CONSOLE_PROTOCOL_VERSION,
    producer: OPS_CONSOLE_PRODUCER,
    workflow: { id: identity.id, version: identity.version },
    topology: identity.topology,
    capabilities: ["workflow.manifest.v2", "execution.traversal.v1", "human.review.v1", "quality.guardrail.v1", "transition.evaluation.v2"] as OpsConsoleWorkflowManifest["capabilities"],
    stages: nodes.map((node) => {
      const outgoing = edges.filter((edge) => edge.source === node.id);
      const gateIds = [...new Set([...(node.gate ? [node.gate.id] : []), ...outgoing.flatMap((edge) => edge.humanGate ? [edge.humanGate.id] : [])])];
      const guardrailIds = [...new Set(outgoing.flatMap((edge) => edge.mandatoryGuardrailIds))];
      return { id: node.id, label: node.label, kind: stageKind(processId, node), description: node.description, ...(gateIds.length ? { gateIds } : {}), ...(guardrailIds.length ? { guardrailIds } : {}) };
    }),
    edges: edges.map((edge) => {
      const source = nodes.find((node) => node.id === edge.source)!;
      const target = nodes.find((node) => node.id === edge.target)!;
      const transitionType: OpsConsoleWorkflowManifest["edges"][number]["transitionType"] = edge.humanGate ? "GUARD" : edge.target.includes("fallback") ? "FALLBACK" : edge.target.includes("terminal") ? "TERMINAL" : "SEQUENCE";
      return { id: edge.id, sourceStageId: edge.source, targetStageId: edge.target, transitionType, label: `${source.label} - ${target.label}`, description: `${source.label} to ${target.label}`, ...(edge.mandatoryGuardrailIds.length ? { guardrailIds: [...edge.mandatoryGuardrailIds] } : {}) };
    }),
  };
  return OpsConsoleWorkflowManifestSchema.parse({ ...base, definitionHash: computeOpsConsoleWorkflowDefinitionHash(base) });
}
