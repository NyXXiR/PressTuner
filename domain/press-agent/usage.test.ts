import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateAgentCostMicros,
  extractCachedInputTokens,
  normalizeAgentError,
} from "./usage";

test("cost estimation separates cached and uncached input tokens", () => {
  assert.equal(
    estimateAgentCostMicros({
      inputTokens: 1_000,
      cachedInputTokens: 200,
      outputTokens: 500,
      rates: {
        inputUsdPerMillion: 0.4,
        cachedInputUsdPerMillion: 0.1,
        outputUsdPerMillion: 1.6,
      },
    }),
    1_140,
  );
});

test("cached token extraction accepts SDK usage detail variants", () => {
  assert.equal(
    extractCachedInputTokens([
      { cached_tokens: 120 },
      { cachedTokens: 30 },
      { cached_input_tokens: 10 },
    ]),
    160,
  );
});

test("agent errors are bounded and receive a stable code", () => {
  assert.deepEqual(normalizeAgentError(new Error("TOOL_TIMEOUT: search")), {
    code: "TOOL_TIMEOUT",
    message: "TOOL_TIMEOUT: search",
  });
  assert.equal(
    normalizeAgentError(new Error(`LONG:${"x".repeat(3_000)}`)).message.length,
    2_000,
  );
});
