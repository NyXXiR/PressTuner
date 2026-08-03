import { z } from "zod";

export const pressAgentRuntimePolicySchema = z
  .object({
    version: z.string().min(1),
    maxTurns: z.number().int().positive(),
    totalDeadlineMs: z.number().int().positive(),
    maxInputTokens: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
    maxEstimatedCostMicros: z.number().int().positive(),
  })
  .strict();

export type PressAgentRuntimePolicy = z.infer<typeof pressAgentRuntimePolicySchema>;

export const DEFAULT_PRESS_AGENT_RUNTIME_POLICY: PressAgentRuntimePolicy = {
  version: "press-runtime/v2",
  maxTurns: 12,
  totalDeadlineMs: 120_000,
  maxInputTokens: 60_000,
  maxOutputTokens: 12_000,
  maxEstimatedCostMicros: 100_000,
};

export function assertRuntimeBudget(args: {
  policy: PressAgentRuntimePolicy;
  inputTokens: number;
  outputTokens: number;
  estimatedCostMicros: number;
  now: Date;
  deadlineAt: Date;
}) {
  if (args.now >= args.deadlineAt) throw new Error("PRESS_AGENT_DEADLINE_EXCEEDED");
  if (args.inputTokens >= args.policy.maxInputTokens) throw new Error("PRESS_AGENT_INPUT_TOKEN_BUDGET_EXCEEDED");
  if (args.outputTokens >= args.policy.maxOutputTokens) throw new Error("PRESS_AGENT_OUTPUT_TOKEN_BUDGET_EXCEEDED");
  if (args.estimatedCostMicros >= args.policy.maxEstimatedCostMicros) throw new Error("PRESS_AGENT_COST_BUDGET_EXCEEDED");
}

export function composeAbortSignal(args: {
  userSignal?: AbortSignal;
  deadlineAt: Date;
  now?: number;
}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (args.userSignal?.aborted) abort();
  else args.userSignal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, Math.max(0, args.deadlineAt.getTime() - (args.now ?? Date.now())));
  timeout.unref?.();
  return { signal: controller.signal, dispose: () => clearTimeout(timeout) };
}
