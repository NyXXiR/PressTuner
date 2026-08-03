import { PRESS_AGENT_TOOLS, type PressAgentToolName } from "./runPolicy";

export const PRESS_AGENT_TOOL_POLICIES = {
  search_knowledge: { timeoutMs: 15_000, fallback: "RETURN_EMPTY" },
  compare_sources: { timeoutMs: 10_000, fallback: "FAIL" },
  draft_press_release: { timeoutMs: 10_000, fallback: "FAIL" },
  verify_claims: { timeoutMs: 10_000, fallback: "FAIL" },
  apply_press_release: { timeoutMs: 20_000, fallback: "FAIL" },
} as const satisfies Record<PressAgentToolName, { timeoutMs: number; fallback: "FAIL" | "RETURN_EMPTY" }>;

export function assertToolPolicy(args: {
  toolName: string;
  approved: boolean;
  teamId: string;
  contextTeamId: string;
}) {
  const tool = PRESS_AGENT_TOOLS.find(({ name }) => name === args.toolName);
  if (!tool) throw new Error("PRESS_AGENT_UNKNOWN_TOOL");
  if (args.teamId !== args.contextTeamId) throw new Error("PRESS_AGENT_TENANT_SCOPE_MISMATCH");
  if (tool.effect === "WRITE" && (!tool.requiresApproval || !args.approved)) {
    throw new Error("PRESS_AGENT_MUTATION_REQUIRES_APPROVAL");
  }
  return { ...tool, ...PRESS_AGENT_TOOL_POLICIES[tool.name] };
}
