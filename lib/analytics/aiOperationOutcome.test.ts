import assert from "node:assert/strict";
import test from "node:test";

import { aggregationMetadataRegistry } from "@/domain/ai-process-console/v1/vendorMetadataContract";
import { emitAiOperationOutcome } from "./aiOperationOutcome";

const vendorOperationId = `hmac-sha256:${"a".repeat(64)}`;
const operationKey = aggregationMetadataRegistry.operationId.posthog.key!;
const projectKey = aggregationMetadataRegistry.projectId.posthog.key!;
const environmentKey = aggregationMetadataRegistry.environment.posthog.key!;
const serviceKey = aggregationMetadataRegistry.serviceName.posthog.key!;

const outcomeInput = (status: string, overrides: Record<string, unknown> = {}) => ({
  vendorOperationId,
  vendorProjectId: "presstuner",
  vendorEnvironment: "production",
  vendorServiceName: "presstuner",
  status,
  ...overrides,
});

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

test("completed operations emit outcomes using the Console-owned pseudonymous aggregation key once", () => {
  const harness = browserHarness();
  assert.equal(
    emitAiOperationOutcome(
      outcomeInput("COMPLETED"),
      harness.browser,
    ),
    true,
  );
  assert.equal(
    emitAiOperationOutcome(
      outcomeInput("COMPLETED"),
      harness.browser,
    ),
    false,
  );
  assert.deepEqual(harness.posthog, [
    ["ai_operation_outcome", {
      [projectKey]: "presstuner",
      [environmentKey]: "production",
      [serviceKey]: "presstuner",
      [operationKey]: vendorOperationId,
      outcome: "accepted",
    }],
  ]);
  assert.deepEqual(harness.ga4, [
    [
      "event",
      "presstuner_ai_operation_business",
      {
        [projectKey]: "presstuner",
        [environmentKey]: "production",
        [serviceKey]: "presstuner",
        [operationKey]: vendorOperationId,
        outcome: "conversion",
      },
    ],
  ]);
});
test("failed operations emit only the abandoned PostHog outcome", () => {
  const harness = browserHarness();
  assert.equal(
    emitAiOperationOutcome(outcomeInput("FAILED"), harness.browser),
    true,
  );
  assert.deepEqual(harness.posthog, [
    ["ai_operation_outcome", {
      [projectKey]: "presstuner",
      [environmentKey]: "production",
      [serviceKey]: "presstuner",
      [operationKey]: vendorOperationId,
      outcome: "abandoned",
    }],
  ]);
  assert.deepEqual(harness.ga4, []);
});

test("invalid identifiers and statuses are rejected and absent providers are harmless", () => {
  const harness = browserHarness();
  assert.equal(
    emitAiOperationOutcome(
      outcomeInput("COMPLETED", { vendorOperationId: "10000000-0000-4000-8000-000000000001" }),
      harness.browser,
    ),
    false,
  );
  assert.equal(
    emitAiOperationOutcome(
      outcomeInput("RUNNING"),
      harness.browser,
    ),
    false,
  );
  assert.equal(
    emitAiOperationOutcome(
      outcomeInput("FAILED"),
      { sessionStorage: harness.browser.sessionStorage },
    ),
    true,
  );
  assert.equal(
    emitAiOperationOutcome(outcomeInput("COMPLETED", { vendorProjectId: undefined }), harness.browser),
    false,
  );
});
