"use client";

import { create } from "zustand";
import { fetchWithLoading } from "@/lib/fetchWithLoading";
import { toDatetimeLocal, fromDatetimeLocal } from "@/lib/utils/datetime";
import { useMeStore } from "@/stores/useMeStore";
import { toast } from "@/stores/toastStore";
import { trackGaEvent } from "@/lib/analytics/ga4";
import {
  createPressFlowApiClient,
  PressFlowApiError,
} from "@/lib/press/pressFlowApiClient";
import {
  generateSimplifiedPressFlow,
  normalizeSimplifiedPressFlow,
} from "@/lib/press/pressFlowOrchestration";

const pressFlowApi = createPressFlowApiClient({ fetch: fetchWithLoading });

type ToneOption = "formal" | "neutral" | "friendly";
type Paragraph = { text: string; importance: number };

export type ArticleResult = {
  articleId?: string;
  title: string;
  lead: string;
  fact: string;
  paragraphs: Paragraph[];
  closing: string;
};

type BriefState = {
  serviceName: string;
  announceType: string;
  oneLiner: string;
  points: string[];
  quoteWho: string; // ✅ [추가] 인용 말한 사람
  quoteMessage: string;
  eventAt: string;
  publishAt: string;
};

export type BriefEvidenceCandidate = {
  id: string;
  documentId: string;
  content: string;
  pageStart: number;
  pageEnd: number;
  score: number;
  decision: "PENDING" | "ACCEPTED" | "REJECTED";
  document: { originalName: string };
};

type DraftSummary = {
  articleId: string;
  title: string;
  createdAt: string;
};

export type ArticleUsageSummary = {
  planLimits: {
    perBrief: number;
    perPolish: number;
    unlimited: boolean;
  };
  articleUsage: {
    briefUsed: number;
    briefRemaining: number;
    polishUsed: number;
    polishRemaining: number;
  };
};

const UNWANTED_SENTENCES = ["자세한 사항은 공식 웹사이트에서 확인할 수 있다."];

function stripUnwanted(text: string) {
  if (!text) return "";
  let out = text;
  UNWANTED_SENTENCES.forEach((s) => {
    const re = new RegExp(s.replace(/[-/\\^$*+?.()|[\\]{}]/g, "\\$&"), "gi");
    out = out.replace(re, " ");
  });
  return out.replace(/\s+/g, " ").trim();
}

function sanitizeArticleResult(result: ArticleResult): ArticleResult {
  const cleanLead = stripUnwanted(result.lead);
  const cleanFact = stripUnwanted(result.fact);
  const cleanClosing = stripUnwanted(result.closing);

  const cleanParagraphs: Paragraph[] = [];
  for (const p of result.paragraphs || []) {
    const cleaned = stripUnwanted(p.text);
    if (cleaned) cleanParagraphs.push({ ...p, text: cleaned });
  }

  return {
    ...result,
    lead: cleanLead,
    fact: cleanFact,
    closing: cleanClosing,
    paragraphs: cleanParagraphs.length > 0 ? cleanParagraphs : [],
  };
}

function readLimitMessage(data: any) {
  if (typeof data?.details?.quota?.message === "string") {
    return data.details.quota.message;
  }

  const periodEnd = data?.details?.usage?.periodEnd;
  if (typeof periodEnd === "string" && periodEnd) {
    return `사용 한도에 도달했습니다. ${new Date(
      periodEnd,
    ).toLocaleDateString("ko-KR")} 이후 다시 사용할 수 있습니다.`;
  }

  return null;
}

type View = "input" | "brief" | "preview";
type EditorTab = "input" | "brief";
type PressQuotaMode = "simplified";
type PressAiActionOptions = { quotaMode?: PressQuotaMode };

const initialBrief: BriefState = {
  serviceName: "",
  announceType: "기타",
  oneLiner: "",
  points: [],
  quoteWho: "", // ✅ 초기값
  quoteMessage: "",
  eventAt: "",
  publishAt: "",
};

type Store = {
  rawText: string;
  tone: ToneOption;

  brief: BriefState;
  briefReviewed: boolean;
  factCandidates: BriefEvidenceCandidate[];
  flowAlert: string | null;
  articleId: string | null;
  normalizeLoading: boolean;
  normalizeError: string | null;

  result: ArticleResult | null;
  loading: boolean;
  previewLoading: boolean;
  error: string | null;

  drafts: DraftSummary[];
  selectedArticleId: string | null;

  view: View;
  editorTab: EditorTab;

  usage: ArticleUsageSummary | null;

  // reset
  reset: () => void;

  // actions
  setRawText: (v: string) => void;
  setTone: (t: ToneOption) => void;

  goToBrief: () => void;
  touchBrief: () => void;
  setEditorTab: (t: EditorTab) => void;
  setView: (v: View) => void;

  fetchUsage: () => Promise<void>;

  normalizeBrief: (options?: PressAiActionOptions) => Promise<void>;
  decideFactCandidate: (
    candidateId: string,
    decision: "ACCEPTED" | "REJECTED",
  ) => Promise<void>;
  submitGenerate: (options?: PressAiActionOptions) => Promise<void>;
  selectDraft: (articleId: string) => Promise<void>;

  setBriefPatch: (patch: Partial<BriefState>) => void;
  addPoint: () => void;
  changePoint: (idx: number, v: string) => void;
  removePoint: (idx: number) => void;
};

function getInitialState(): Omit<
  Store,
  | "reset"
  | "setRawText"
  | "setTone"
  | "goToBrief"
  | "touchBrief"
  | "setEditorTab"
  | "setView"
  | "fetchUsage"
  | "normalizeBrief"
  | "decideFactCandidate"
  | "submitGenerate"
  | "selectDraft"
  | "setBriefPatch"
  | "addPoint"
  | "changePoint"
  | "removePoint"
> {
  return {
    rawText: "",
    tone: "formal",

    brief: initialBrief,
    briefReviewed: false,
    factCandidates: [],
    flowAlert: null,
    articleId: null,
    normalizeLoading: false,
    normalizeError: null,

    result: null,
    loading: false,
    previewLoading: false,
    error: null,

    drafts: [],
    selectedArticleId: null,

    view: "input",
    editorTab: "input",

    usage: null,
  };
}

export const usePressGeneratorStore = create<Store>()((set, get) => ({
  ...getInitialState(),

  reset: () => set(() => ({ ...getInitialState() })),

  setRawText: (v) =>
    set({
      rawText: v,
      briefReviewed: false,
      flowAlert: null,
    }),

  setTone: (t) =>
    set({
      tone: t,
      briefReviewed: false,
      flowAlert: null,
    }),

  goToBrief: () => set({ view: "brief", editorTab: "brief", flowAlert: null }),

  touchBrief: () => set({ briefReviewed: true, flowAlert: null }),

  setEditorTab: (t) => set({ editorTab: t }),

  setView: (v) => set({ view: v }),

  setBriefPatch: (patch) => {
    set((s) => ({
      brief: { ...s.brief, ...patch },
      briefReviewed: true,
      flowAlert: null,
    }));
  },

  addPoint: () =>
    set((s) => ({
      brief: { ...s.brief, points: [...s.brief.points, ""] },
      briefReviewed: true,
    })),

  changePoint: (idx, v) =>
    set((s) => {
      const next = [...s.brief.points];
      next[idx] = v;
      return { brief: { ...s.brief, points: next }, briefReviewed: true };
    }),

  removePoint: (idx) =>
    set((s) => {
      const next = [...s.brief.points];
      next.splice(idx, 1);
      return { brief: { ...s.brief, points: next }, briefReviewed: true };
    }),

  fetchUsage: async () => {
    const { articleId } = get();
    const url = articleId
      ? `/api/articles/${articleId}/usage`
      : `/api/articles/usage`;

    try {
      const res = await fetchWithLoading(url, { credentials: "include" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return;

      // ✅ [수정] API 응답 구조 매핑 (plan/article -> planLimits/articleUsage)
      if (data.plan && data.article) {
        const mappedUsage: ArticleUsageSummary = {
          planLimits: {
            perBrief: data.plan.perBrief ?? 0,
            perPolish: data.plan.perPolish ?? 0,
            unlimited: data.plan.unlimited === true,
          },
          articleUsage: {
            briefUsed: data.article.briefUsed ?? 0,
            briefRemaining: data.article.briefRemaining ?? 0,
            polishUsed: data.article.polishUsed ?? 0,
            polishRemaining: data.article.polishRemaining ?? 0,
          },
        };
        set({ usage: mappedUsage });
        return;
      }

      // 기존 호환
      if (data?.planLimits && data?.articleUsage) {
        set({ usage: data as ArticleUsageSummary });
        return;
      }
    } catch (err) {
      console.error("Usage fetch failed", err);
    }
  },

  normalizeBrief: async (options) => {
    const { rawText, tone, articleId } = get();
    if (!rawText.trim()) return;

    set({ normalizeLoading: true, normalizeError: null });

    try {
      let id = articleId;

      let data: Record<string, any>;
      try {
        if (options?.quotaMode === "simplified") {
          const orchestrated = await normalizeSimplifiedPressFlow({
            api: pressFlowApi,
            articleId: id,
            brief: { rawText, tone },
          });
          id = orchestrated.articleId;
          data = orchestrated.result;
        } else {
          if (!id) {
            const initData = await pressFlowApi.initializeArticle({
              type: "PRESS_RELEASE",
            });
            id = initData.articleId;
          }
          data = await pressFlowApi.normalizeBrief(id, { rawText, tone });
        }
        if (id !== articleId) {
          set({ articleId: id });
          await get().fetchUsage();
        }
      } catch (cause) {
        if (!(cause instanceof PressFlowApiError)) throw cause;
        await get().fetchUsage();
        const quotaMessage = readLimitMessage(cause.response);
        const err = new Error(
          quotaMessage ??
            cause.message ??
            "브리프 정리에 실패했습니다.",
        ) as any;
        err.status = cause.status;
        throw err;
      }

      const nextBrief: BriefState = {
        serviceName:
          typeof data?.serviceName === "string" ? data.serviceName : "",
        announceType:
          typeof data?.announceType === "string" && data.announceType.trim()
            ? data.announceType
            : "기타",
        oneLiner: typeof data?.oneLiner === "string" ? data.oneLiner : "",
        points: Array.isArray(data?.points)
          ? data.points.filter((x: any) => typeof x === "string")
          : [],

        // ✅ [수정] quoteWho 매핑 추가
        quoteWho: typeof data?.quoteWho === "string" ? data.quoteWho : "",
        quoteMessage:
          typeof data?.quoteMessage === "string" ? data.quoteMessage : "",

        eventAt:
          typeof data?.eventAt === "string" && data.eventAt.trim()
            ? toDatetimeLocal(data.eventAt)
            : "",
        publishAt:
          typeof data?.publishAt === "string" && data.publishAt.trim()
            ? toDatetimeLocal(data.publishAt)
            : "",
      };

      set({
        brief: nextBrief,
        factCandidates: Array.isArray(data?.factCandidates)
          ? data.factCandidates
          : [],
        briefReviewed: true,
        view: "brief",
        editorTab: "brief",
        flowAlert: null,
        normalizeError: null,
      });

      await get().fetchUsage();
    } catch (e: any) {
      set({ normalizeError: e?.message ?? "알 수 없는 오류" });
      throw e;
    } finally {
      set({ normalizeLoading: false });
    }
  },

  decideFactCandidate: async (candidateId, decision) => {
    const articleId = get().articleId;
    if (!articleId) return;
    await pressFlowApi.decideGroundingCandidate(
      articleId,
      candidateId,
      decision,
    );
    set((state) => ({
      factCandidates: state.factCandidates.map((candidate) =>
        candidate.id === candidateId
          ? { ...candidate, decision }
          : candidate,
      ),
    }));
  },

  submitGenerate: async (options) => {
    const { briefReviewed, brief, tone, rawText, articleId } = get();

    if (!briefReviewed) {
      set({
        flowAlert: "브리프를 확인한 뒤 생성할 수 있어요.",
        view: "brief",
        editorTab: "brief",
      });
      return;
    }

    const meState = useMeStore.getState();
    const remaining = meState.me?.usageArticleRemaining;

    if (typeof remaining === "number" && remaining <= 0) {
      const periodEnd = meState.me?.usagePeriodEnd;
      toast.error(
        periodEnd
          ? `사용 한도에 도달했습니다. ${new Date(
              periodEnd,
            ).toLocaleDateString("ko-KR")} 이후 다시 사용할 수 있습니다.`
          : "사용 한도에 도달했습니다.",
        undefined,
        "top-center",
      );
      return;
    }

    set({
      flowAlert: null,
      loading: true,
      error: null,
      result: null,
      usage: null,
    });

    try {
      let id = articleId;

      // ✅ [수정] quoteWho 포함 전송
      let data: Record<string, any>;
      try {
        const draft = {
          serviceName: brief.serviceName,
          announceType: brief.announceType,
          oneLiner: brief.oneLiner,
          points: brief.points,
          quoteWho: brief.quoteWho,
          quoteMessage: brief.quoteMessage,
          tone,
          rawText,
          eventAt: fromDatetimeLocal(brief.eventAt),
          publishAt: fromDatetimeLocal(brief.publishAt),
        };
        if (options?.quotaMode === "simplified") {
          const orchestrated = await generateSimplifiedPressFlow({
            api: pressFlowApi,
            articleId: id,
            draft,
          });
          id = orchestrated.articleId;
          data = orchestrated.result;
        } else {
          if (!id) {
            const initData = await pressFlowApi.initializeArticle({
              type: "PRESS_RELEASE",
            });
            id = initData.articleId;
          }
          data = await pressFlowApi.generateArticle(id, draft);
        }
        if (id !== articleId) set({ articleId: id });
      } catch (cause) {
        if (!(cause instanceof PressFlowApiError)) throw cause;
        const quotaMessage = readLimitMessage(cause.response);
        const err = new Error(
          quotaMessage ??
            cause.message ??
            "생성에 실패했습니다.",
        ) as any;
        err.status = cause.status;
        throw err;
      }

      const safeParagraphs: Paragraph[] = Array.isArray(data.paragraphs)
        ? data.paragraphs.filter(
            (p: any) =>
              p &&
              typeof p.text === "string" &&
              typeof p.importance === "number",
          )
        : [];

      const nextResult: ArticleResult = {
        articleId: data.articleId ?? id ?? undefined,
        title: data.title ?? "",
        lead: data.lead ?? "",
        fact: data.fact ?? "",
        paragraphs: safeParagraphs,
        closing: data.closing ?? "",
      };

      trackGaEvent("draft_generated", {
        article_id: data.articleId ?? id ?? "",
        tone,
        points_count: brief.points.length,
      });

      const sanitized = sanitizeArticleResult(nextResult);
      let drafts = get().drafts;
      const draftId = (data.articleId ?? id) as string | undefined;
      if (draftId) {
        const summary: DraftSummary = {
          articleId: draftId,
          title: data.title || "제목 없음 초안",
          createdAt: new Date().toISOString(),
        };
        drafts = [
          summary,
          ...drafts.filter((d) => d.articleId !== summary.articleId),
        ];
      }

      // 사용량 응답 처리 (백엔드 구조에 따라 다를 수 있으나, 보통 generate 응답에도 usage 포함됨)
      let nextUsage = get().usage;
      if (data.plan && data.article) {
        nextUsage = {
          planLimits: {
            perBrief: data.plan.perBrief ?? 0,
            perPolish: data.plan.perPolish ?? 0,
            unlimited: data.plan.unlimited === true,
          },
          articleUsage: {
            briefUsed: data.article.briefUsed ?? 0,
            briefRemaining: data.article.briefRemaining ?? 0,
            polishUsed: data.article.polishUsed ?? 0,
            polishRemaining: data.article.polishRemaining ?? 0,
          },
        };
      } else if (data.usage?.planLimits) {
        nextUsage = data.usage;
      }

      set({
        result: sanitized,
        drafts,
        selectedArticleId: draftId ?? null,
        view: "preview",
        usage: nextUsage,
      });
    } catch (e: any) {
      set({ error: e?.message ?? "알 수 없는 오류가 발생했습니다." });
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  selectDraft: async (articleId: string) => {
    const current = get().result?.articleId;
    if (articleId === current) {
      set({ selectedArticleId: articleId });
      return;
    }
    set({ previewLoading: true, error: null });
    try {
      const res = await fetchWithLoading(`/api/articles/${articleId}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        throw new Error(data?.message ?? data?.error ?? "초안을 불러오는 데 실패했습니다.");
      }

      const article = data.article as any;
      const bodyJson = article.bodyJson ?? {};
      const paragraphsRaw = Array.isArray(bodyJson.paragraphs)
        ? bodyJson.paragraphs
        : [];
      const safeParagraphs: Paragraph[] = paragraphsRaw.filter(
        (p: any): p is Paragraph =>
          p && typeof p.text === "string" && typeof p.importance === "number",
      );

      const sanitized = sanitizeArticleResult({
        articleId: article.id,
        title: article.title ?? "",
        lead: article.pressExtra?.lead ?? "",
        fact: article.pressExtra?.fact ?? bodyJson.fact ?? "",
        paragraphs: safeParagraphs,
        closing: bodyJson.closing ?? "",
      });

      set({
        result: sanitized,
        selectedArticleId: articleId,
        view: "preview",
        usage: data?.usage ?? get().usage,
      });
    } catch (e: any) {
      set({ error: e?.message ?? "초안을 불러오는 데 실패했습니다." });
    } finally {
      set({ previewLoading: false });
    }
  },
}));
