export type PressDemoTone = "formal" | "neutral" | "friendly";

export type PressDemoBrief = {
  serviceName: string;
  announceType: string;
  oneLiner: string;
  points: string[];
  quoteWho: string;
  quoteMessage: string;
  eventAt: string;
  publishAt: string;
};

export type PressDemoDraft = {
  rawText: string;
  tone: PressDemoTone;
  brief: PressDemoBrief;
  createdAt?: string;
  view?: "input" | "brief";
};

export const PRESS_DEMO_DRAFT_KEY = "press-demo-draft:v1";

const DEFAULT_ANNOUNCE_TYPE = "신제품 출시";
const ALLOWED_TONES: PressDemoTone[] = ["formal", "neutral", "friendly"];

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function sanitizeBrief(value: unknown): PressDemoBrief {
  if (!isObject(value)) {
    return {
      serviceName: "",
      announceType: DEFAULT_ANNOUNCE_TYPE,
      oneLiner: "",
      points: [],
      quoteWho: "",
      quoteMessage: "",
      eventAt: "",
      publishAt: "",
    };
  }

  const points = Array.isArray(value.points)
    ? value.points.filter((item) => typeof item === "string")
    : [];

  return {
    serviceName: typeof value.serviceName === "string" ? value.serviceName : "",
    announceType:
      typeof value.announceType === "string" && value.announceType.trim()
        ? value.announceType
        : DEFAULT_ANNOUNCE_TYPE,
    oneLiner: typeof value.oneLiner === "string" ? value.oneLiner : "",
    points,
    quoteWho: typeof value.quoteWho === "string" ? value.quoteWho : "",
    quoteMessage:
      typeof value.quoteMessage === "string" ? value.quoteMessage : "",
    eventAt: typeof value.eventAt === "string" ? value.eventAt : "",
    publishAt: typeof value.publishAt === "string" ? value.publishAt : "",
  };
}

export function savePressDemoDraft(draft: PressDemoDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRESS_DEMO_DRAFT_KEY, JSON.stringify(draft));
}

export function loadPressDemoDraft(): PressDemoDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PRESS_DEMO_DRAFT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!isObject(parsed)) return null;

    const rawText =
      typeof parsed.rawText === "string" ? parsed.rawText : "";
    const tone = ALLOWED_TONES.includes(parsed.tone as PressDemoTone)
      ? (parsed.tone as PressDemoTone)
      : "formal";
    const brief = sanitizeBrief(parsed.brief);
    const createdAt =
      typeof parsed.createdAt === "string" ? parsed.createdAt : undefined;
    const view =
      parsed.view === "input" || parsed.view === "brief"
        ? parsed.view
        : undefined;

    if (!rawText.trim()) return null;

    return { rawText, tone, brief, createdAt, view };
  } catch {
    return null;
  }
}

export function clearPressDemoDraft() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PRESS_DEMO_DRAFT_KEY);
}
