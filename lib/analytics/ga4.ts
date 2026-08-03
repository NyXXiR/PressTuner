import { capturePostHogEvent } from "@/lib/posthog";

export type GaEventParams = Record<
  string,
  string | number | boolean | null | undefined
>;

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

export function trackGaEvent(name: string, params?: GaEventParams) {
  capturePostHogEvent(name, params);

  if (typeof window === "undefined") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, params ?? {});
}
