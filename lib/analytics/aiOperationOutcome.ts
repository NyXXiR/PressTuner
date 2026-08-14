"use client";

import { capturePostHogEvent } from "@/lib/posthog";
import { aggregationMetadataRegistry } from "@/domain/ai-process-console/v1/vendorMetadataContract";

type TerminalAgentStatus = "COMPLETED" | "FAILED";
type OutcomeInput = {
  vendorOperationId: string | null | undefined;
  status: string;
};
type OutcomeBrowser = {
  capturePostHogEvent?: typeof capturePostHogEvent;
  gtag?: (...args: unknown[]) => void;
  sessionStorage?: Pick<Storage, "getItem" | "setItem">;
};

const PSEUDONYMOUS_OPERATION_PATTERN = /^hmac-sha256:[a-f0-9]{64}$/;
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
  if (!operationKey) return false;
  try {
    browser.capturePostHogEvent?.(postHogEvent, {
      [operationKey]: input.vendorOperationId,
      outcome: productOutcome,
    });
  } catch {
    // A browser analytics provider must never affect the Press Agent result.
  }

  if (status === "COMPLETED") {
    try {
      browser.gtag?.("event", ga4Event, {
        [operationKey]: input.vendorOperationId,
        outcome: "conversion",
      });
    } catch {
      // A browser analytics provider must never affect the Press Agent result.
    }
  }
  return true;
}
