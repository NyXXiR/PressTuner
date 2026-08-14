"use client";

import { capturePostHogEvent } from "@/lib/posthog";
import { aggregationMetadataRegistry } from "@/domain/ai-process-console/v1/vendorMetadataContract";

type TerminalAgentStatus = "COMPLETED" | "FAILED";
type OutcomeInput = {
  vendorOperationId: string | null | undefined;
  vendorProjectId: string | null | undefined;
  vendorEnvironment: string | null | undefined;
  vendorServiceName: string | null | undefined;
  status: string;
};
type OutcomeBrowser = {
  capturePostHogEvent?: typeof capturePostHogEvent;
  gtag?: (...args: unknown[]) => void;
  sessionStorage?: Pick<Storage, "getItem" | "setItem">;
};

const PSEUDONYMOUS_OPERATION_PATTERN = /^hmac-sha256:[a-f0-9]{64}$/;
const SAFE_DIMENSION_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
const DEFAULT_POSTHOG_EVENT = "ai_operation_outcome";
const DEFAULT_GA4_EVENT = "presstuner_ai_operation_business";

function safeEventName(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized && EVENT_NAME_PATTERN.test(normalized)
    ? normalized
    : fallback;
}

function defaultBrowser(): OutcomeBrowser {
  if (typeof window === "undefined") return {};
  let storage: Storage | undefined;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = undefined;
  }
  return {
    capturePostHogEvent,
    gtag: window.gtag,
    sessionStorage: storage,
  };
}

export function emitAiOperationOutcome(
  input: OutcomeInput,
  browser: OutcomeBrowser = defaultBrowser(),
): boolean {
  if (!input.vendorOperationId || !PSEUDONYMOUS_OPERATION_PATTERN.test(input.vendorOperationId)) return false;
  if (!input.vendorProjectId || !SAFE_DIMENSION_PATTERN.test(input.vendorProjectId)) return false;
  if (!input.vendorEnvironment || !SAFE_DIMENSION_PATTERN.test(input.vendorEnvironment)) return false;
  if (!input.vendorServiceName || !SAFE_DIMENSION_PATTERN.test(input.vendorServiceName)) return false;
  if (!(["COMPLETED", "FAILED"] as string[]).includes(input.status)) return false;

  const status = input.status as TerminalAgentStatus;
  const productOutcome = status === "COMPLETED" ? "accepted" : "abandoned";
  const storageKey = `presstuner:ai-operation-outcome:${input.vendorOperationId}:${productOutcome}`;
  try {
    if (browser.sessionStorage?.getItem(storageKey)) return false;
    browser.sessionStorage?.setItem(storageKey, "1");
  } catch {
    // Analytics storage is best effort; provider emission may still proceed.
  }

  const postHogEvent = safeEventName(
    process.env.NEXT_PUBLIC_OPS_CONSOLE_POSTHOG_OUTCOME_EVENT,
    DEFAULT_POSTHOG_EVENT,
  );
  const ga4Event = safeEventName(
    process.env.NEXT_PUBLIC_OPS_CONSOLE_GA4_BUSINESS_EVENT,
    DEFAULT_GA4_EVENT,
  );
  const operationKey = aggregationMetadataRegistry.operationId.posthog.key;
  const projectKey = aggregationMetadataRegistry.projectId.posthog.key;
  const environmentKey = aggregationMetadataRegistry.environment.posthog.key;
  const serviceKey = aggregationMetadataRegistry.serviceName.posthog.key;
  if (!operationKey || !projectKey || !environmentKey || !serviceKey) return false;
  const properties = {
    [projectKey]: input.vendorProjectId,
    [environmentKey]: input.vendorEnvironment,
    [serviceKey]: input.vendorServiceName,
    [operationKey]: input.vendorOperationId,
  };
  try {
    browser.capturePostHogEvent?.(postHogEvent, {
      ...properties,
      outcome: productOutcome,
    });
  } catch {
    // A browser analytics provider must never affect the Press Agent result.
  }

  if (status === "COMPLETED") {
    try {
      browser.gtag?.("event", ga4Event, {
        ...properties,
        outcome: "conversion",
      });
    } catch {
      // A browser analytics provider must never affect the Press Agent result.
    }
  }
  return true;
}
