import assert from "node:assert/strict";
import test from "node:test";

import { emitAiOperationOutcome } from "./aiOperationOutcome";

const operationId = "10000000-0000-4000-8000-000000000001";

function browserHarness() {
  const posthog: Array<[string, Record<string, unknown> | undefined]> = [];
  const ga4: unknown[][] = [];
  const values = new Map<string, string>();
  return {
    posthog,
    ga4,
    browser: {
      capturePostHogEvent: (name: string, properties?: Record<string, unknown>) =>
        posthog.push([name, properties]),
      gtag: (...args: unknown[]) => ga4.push(args),
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
      },
    },
  };
}

test("completed operations emit provider-specific outcomes with the same UUID once", () => {
  const harness = browserHarness();
  assert.equal(
    emitAiOperationOutcome(
      { operationId, status: "COMPLETED" },
      harness.browser,
    ),
    true,
  );
  assert.equal(
    emitAiOperationOutcome(
      { operationId, status: "COMPLETED" },
      harness.browser,
    ),
    false,
  );
  assert.deepEqual(harness.posthog, [
    ["ai_operation_outcome", { operation_id: operationId, outcome: "accepted" }],
  ]);
  assert.deepEqual(harness.ga4, [
    [
      "event",
      "presstuner_ai_operation_business",
      { operation_id: operationId, outcome: "conversion" },
    ],
  ]);
});
test("failed operations emit only the abandoned PostHog outcome", () => {
  const harness = browserHarness();
  assert.equal(
    emitAiOperationOutcome({ operationId, status: "FAILED" }, harness.browser),
    true,
  );
  assert.deepEqual(harness.posthog, [
    ["ai_operation_outcome", { operation_id: operationId, outcome: "abandoned" }],
  ]);
  assert.deepEqual(harness.ga4, []);
});

test("invalid identifiers and statuses are rejected and absent providers are harmless", () => {
  const harness = browserHarness();
  assert.equal(
    emitAiOperationOutcome(
      { operationId: "not-a-uuid", status: "COMPLETED" },
      harness.browser,
    ),
    false,
  );
  assert.equal(
    emitAiOperationOutcome(
      { operationId, status: "RUNNING" },
      harness.browser,
    ),
    false,
  );
  assert.equal(
    emitAiOperationOutcome(
      { operationId, status: "FAILED" },
      { sessionStorage: harness.browser.sessionStorage },
    ),
    true,
  );
});
