export type AgentTokenRates = {
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  outputUsdPerMillion: number;
};

export function estimateAgentCostMicros(args: {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  rates: AgentTokenRates;
}) {
  const cachedInputTokens = Math.min(
    Math.max(0, args.cachedInputTokens),
    Math.max(0, args.inputTokens),
  );
  const uncachedInputTokens = Math.max(0, args.inputTokens) - cachedInputTokens;
  return Math.round(
    uncachedInputTokens * args.rates.inputUsdPerMillion +
      cachedInputTokens * args.rates.cachedInputUsdPerMillion +
      Math.max(0, args.outputTokens) * args.rates.outputUsdPerMillion,
  );
}

export function extractCachedInputTokens(
  details: readonly Record<string, number>[],
) {
  return details.reduce(
    (sum, detail) =>
      sum +
      Number(
        detail.cached_tokens ??
          detail.cachedTokens ??
          detail.cached_input_tokens ??
          0,
      ),
    0,
  );
}

export function normalizeAgentError(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error || "UNKNOWN_ERROR");
  return {
    code: (message.split(":")[0] || "UNKNOWN_ERROR").slice(0, 100),
    message: message.slice(0, 2_000),
  };
}
