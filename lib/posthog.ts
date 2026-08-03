"use client";

import {
  registerAcquisitionAttribution,
  type PostHogAcquisitionApi,
} from "@/lib/analytics/acquisition-attribution";

type EventProperties = Record<string, unknown>;

type PostHogGlobal = PostHogAcquisitionApi & {
  __SV?: number;
  _i?: unknown[][];
  init?: (token: string, config: Record<string, unknown>, name?: string) => void;
  capture?: (eventName: string, properties?: Record<string, unknown>) => void;
  toString?: (debug?: number | boolean) => string;
  [key: string]: unknown;
};

declare global {
  interface Window {
    posthog?: PostHogGlobal;
  }
}

const PRODUCT_AREA = "briefflow";
const ORIGIN_PROJECT = "briefflow";
const ENVIRONMENT =
  process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "development";

export function capturePostHogEvent(
  eventName: string,
  properties?: EventProperties,
) {
  if (typeof window === "undefined") {
    return;
  }

  registerAcquisitionAttribution(window.posthog, {
    href: window.location.href,
    referrer: document.referrer,
  });

  window.posthog?.capture?.(eventName, {
    product_area: PRODUCT_AREA,
    origin_project: ORIGIN_PROJECT,
    environment: ENVIRONMENT,
    ...properties,
  });
}
