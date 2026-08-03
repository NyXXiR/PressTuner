export const AGENT_FAILURE_CATEGORIES = [
  "RETRIEVAL_MISS",
  "UNSUPPORTED_CITATION",
  "UNGROUNDED_CLAIM",
  "TOOL_SELECTION",
  "INVALID_ARGUMENTS",
  "TOOL_TIMEOUT",
  "DEADLINE_EXCEEDED",
  "TOKEN_BUDGET_EXCEEDED",
  "COST_BUDGET_EXCEEDED",
  "APPROVAL_REJECTED",
  "TENANT_SCOPE_VIOLATION",
  "PROMPT_INJECTION",
  "PROVIDER_FAILURE",
  "COMPLETION_VERIFICATION",
  "CANCELED",
  "UNKNOWN",
] as const;

export type AgentFailureCategory = (typeof AGENT_FAILURE_CATEGORIES)[number];

export function classifyAgentFailure(value: unknown): AgentFailureCategory {
  const code = value instanceof Error ? value.message : String(value ?? "");
  if (/CANCEL/i.test(code)) return "CANCELED";
  if (/DEADLINE/i.test(code)) return "DEADLINE_EXCEEDED";
  if (/TOOL.*TIMEOUT|TIMEOUT.*TOOL/i.test(code)) return "TOOL_TIMEOUT";
  if (/TOKEN.*BUDGET/i.test(code)) return "TOKEN_BUDGET_EXCEEDED";
  if (/COST.*BUDGET/i.test(code)) return "COST_BUDGET_EXCEEDED";
  if (/TENANT|SCOPE_MISMATCH/i.test(code)) return "TENANT_SCOPE_VIOLATION";
  if (/INJECTION/i.test(code)) return "PROMPT_INJECTION";
  if (/APPROVAL.*REJECT/i.test(code)) return "APPROVAL_REJECTED";
  if (/ARGUMENT|SCHEMA/i.test(code)) return "INVALID_ARGUMENTS";
  if (/CITATION/i.test(code)) return "UNSUPPORTED_CITATION";
  if (/GROUND/i.test(code)) return "UNGROUNDED_CLAIM";
  if (/VERIFY|COMPLETION/i.test(code)) return "COMPLETION_VERIFICATION";
  if (/PROVIDER|RATE_LIMIT|MODEL/i.test(code)) return "PROVIDER_FAILURE";
  return "UNKNOWN";
}
