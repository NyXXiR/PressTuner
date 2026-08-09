import {
  pressCreationProcess,
  type PressAiProcessDefinition,
  type PressAiProcessEdge,
} from "./processRegistry";

export const PRESS_AI_RUN_CONTEXT_FIELDS = Object.freeze([
  "articleId",
  "rawText",
  "tone",
  "userInstruction",
] as const);

export type TransitionCompatibilityResult = Readonly<
  | { compatible: true }
  | { compatible: false; code: string; missingFields?: readonly string[]; missingCapabilities?: readonly string[] }
>;

const AUTHORIZED_CYCLE = new Set(["review-rewrite", "rewrite-review"]);

export function validatePressTransitionCompatibility(
  candidate: Pick<PressAiProcessEdge, "id" | "source" | "target" | "userGateInputFields">,
  process: PressAiProcessDefinition = pressCreationProcess,
): TransitionCompatibilityResult {
  const registered = process.edges.find((edge) => edge.id === candidate.id);
  if (!registered || registered.source !== candidate.source || registered.target !== candidate.target) {
    return { compatible: false, code: "PRESS_AI_EDGE_NOT_REGISTERED" };
  }
  if (candidate.source === candidate.target) return { compatible: false, code: "PRESS_AI_SELF_LOOP_FORBIDDEN" };
  const source = process.nodes.find((node) => node.id === candidate.source);
  const target = process.nodes.find((node) => node.id === candidate.target);
  if (!source?.contract || !target?.contract) return { compatible: false, code: "PRESS_AI_CONTRACT_MISSING" };
  if (!target.contract.allowIncoming) return { compatible: false, code: "PRESS_AI_TARGET_FORBIDS_INCOMING" };

  const supplied = new Set([
    ...source.contract.outputFields,
    ...PRESS_AI_RUN_CONTEXT_FIELDS,
    ...(candidate.userGateInputFields ?? []),
  ]);
  const missingFields = target.contract.requiredInputFields.filter((field) => !supplied.has(field));
  if (missingFields.length) return { compatible: false, code: "PRESS_AI_REQUIRED_FIELDS_MISSING", missingFields };
  const missingCapabilities = target.contract.requires.filter((capability) => !source.contract!.provides.includes(capability));
  if (missingCapabilities.length) return { compatible: false, code: "PRESS_AI_CAPABILITY_MISMATCH", missingCapabilities };
  return { compatible: true };
}

export function validatePressTopologyEdgeIds(edgeIds: readonly string[]): void {
  const unique = new Set(edgeIds);
  if (unique.size !== edgeIds.length) throw new Error("PRESS_AI_TOPOLOGY_DUPLICATE_EDGE");
  for (const id of edgeIds) {
    const edge = pressCreationProcess.edges.find((item) => item.id === id);
    if (!edge) throw new Error("PRESS_AI_EDGE_NOT_REGISTERED");
    const result = validatePressTransitionCompatibility(edge);
    if (!result.compatible) throw new Error(result.code);
  }
  const selected = pressCreationProcess.edges.filter((edge) => unique.has(edge.id));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (nodeId: string, path: string[]): void => {
    if (visiting.has(nodeId)) {
      const cycleEdges = path.slice(path.findIndex((id) => id.startsWith(`${nodeId}:`))).map((id) => id.split(":")[1]);
      if (cycleEdges.length !== 2 || cycleEdges.some((id) => !AUTHORIZED_CYCLE.has(id))) throw new Error("PRESS_AI_TOPOLOGY_CYCLE_FORBIDDEN");
      return;
    }
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const edge of selected.filter((item) => item.source === nodeId)) walk(edge.target, [...path, `${nodeId}:${edge.id}`]);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of pressCreationProcess.nodes) walk(node.id, []);
}
