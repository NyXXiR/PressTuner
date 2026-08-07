"use client";

type NativeEvent = {
  id: string; event: string; occurredAt: string;
  identity: { userId: string | null; anonymousId: string | null; sessionId: string | null };
  actor: { type: "customer" | "unknown" }; environment: "production";
  page: { url: string | null; path: string | null; title: string | null; referrer: string | null };
  acquisition: { source: string | null; medium: string | null; campaign: string | null; term: string | null; content: string | null };
  device: { language: string | null; timezone: string | null; viewportWidth: number | null; viewportHeight: number | null };
  properties: Record<string, unknown>; context: { sdkVersion: string; library: string; requestId: string | null };
};
const SESSION_KEY = "briefflow:ops-analytics-session";
const ANONYMOUS_KEY = "briefflow:ops-analytics-anonymous";
let sessionStarted = false;
function id() { return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function stored(key: string) { try { return window.localStorage.getItem(key); } catch { return null; } }
function identity() {
  let sessionId = stored(SESSION_KEY); let anonymousId = stored(ANONYMOUS_KEY);
  try {
    if (!sessionId) { sessionId = id(); window.localStorage.setItem(SESSION_KEY, sessionId); }
    if (!anonymousId) { anonymousId = id(); window.localStorage.setItem(ANONYMOUS_KEY, anonymousId); }
  } catch { /* privacy-restricted storage */ }
  return { sessionId, anonymousId };
}
function event(name: string, properties: Record<string, unknown>): NativeEvent {
  const { sessionId, anonymousId } = identity();
  return {
    id: id(), event: name, occurredAt: new Date().toISOString(), identity: { userId: null, anonymousId, sessionId },
    actor: { type: "unknown" }, environment: "production",
    page: { url: window.location.href, path: window.location.pathname, title: document.title, referrer: document.referrer || null },
    acquisition: { source: null, medium: null, campaign: null, term: null, content: null },
    device: { language: navigator.language || null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight },
    properties, context: { sdkVersion: "1.0.0", library: "presstuner-ops-native", requestId: null },
  };
}
export function captureOpsNativePage(pathname: string) {
  if (typeof window === "undefined") return;
  const events = [event("page_viewed", { product_area: "briefflow", pathname })];
  if (!sessionStarted) { sessionStarted = true; events.unshift(event("session_started", { product_area: "briefflow" })); }
  void fetch("/api/analytics/ops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ events }), keepalive: true }).catch(() => undefined);
}
