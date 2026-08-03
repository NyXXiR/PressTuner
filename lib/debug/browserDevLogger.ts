const IS_BROWSER_DEV =
  process.env.NODE_ENV === "development" && typeof window !== "undefined";

type BrowserDevEvent = {
  scope: "press" | "resume";
  stage: string;
  at: string;
  payload: Record<string, unknown>;
};

export function previewText(value: string | null | undefined, limit = 240) {
  const normalized = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!normalized) return "";
  return normalized.length > limit
    ? `${normalized.slice(0, limit)}...`
    : normalized;
}

export const logBrowserDevEvent: (
  scope: "press" | "resume",
  stage: string,
  payload: Record<string, unknown>,
) => void = IS_BROWSER_DEV
  ? (scope, stage, payload) => {
      const stamp = new Date().toISOString();
      const event: BrowserDevEvent = {
        scope,
        stage,
        at: stamp,
        payload,
      };
      const logs = ((window as any).__PT_HANDOFF_LOGS__ ?? []) as BrowserDevEvent[];
      (window as any).__PT_HANDOFF_LOGS__ = [...logs, event];

      console.log(`[${scope}] ${stage}`, event);
      console.groupCollapsed(`[${scope}] ${stage} ${stamp}`);
      console.dir(payload, { depth: null });
      console.groupEnd();
    }
  : () => {};
