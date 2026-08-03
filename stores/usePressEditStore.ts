"use client";
import { create } from "zustand";
import { logBrowserDevEvent, previewText } from "@/lib/debug/browserDevLogger";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type PressQuotaMode = "simplified";
type PressAiActionOptions = {
  quotaMode?: PressQuotaMode;
  userInstruction?: string;
};

export type Note = {
  id: string;
  note: string;
  type: string;
  quote: string;
};

export type Span = {
  id: string;
  start: number;
  end: number;
  note: string;
  type: string;
};

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

export type ArticleUsageSummary = {
  plan: {
    effectivePlanName: string;
    isSubscriptionActive: boolean;
    unlimited: boolean;
  };
  article: {
    unlimited: boolean;
    briefUsed: number;
    briefLimit: number;
    briefRemaining: number;
    polishUsed: number;
    polishLimit: number;
    polishRemaining: number;
  };
};

export type TeamMemberSimple = {
  userId: string;
  role: string;
  user: {
    label: string;
    email?: string | null;
    avatarUrl?: string | null;
  };
};

type HarnessAction = {
  type: "apply_pending_rewrite";
  appliedAt: string;
};

type Store = {
  articleId: string;
  teamId: string | null;
  title: string;
  plain: string;
  spans: Span[];
  notes: Note[];
  selectedNoteIds: string[];
  reviewing: boolean;
  reviewError: string | null;
  saveState: SaveState;
  pendingResult: { title: string; plain: string } | null;
  harnessAction: HarnessAction | null;
  usage: ArticleUsageSummary | null;
  teamMembers: TeamMemberSimple[];

  init: (args: {
    articleId: string;
    teamId: string | null;
    initialTitle: string;
    initialPlain: string;
    initialSpans?: Span[];
    initialNotes?: Note[];
  }) => void;
  setTeamId: (teamId: string | null) => void;
  setTitle: (v: string) => void;
  setPlain: (v: string) => void;
  toggleNoteSelection: (id: string) => void;
  setSelectedNoteIds: (ids: string[]) => void;
  fetchUsage: () => Promise<void>;
  runReview: (options?: PressAiActionOptions) => Promise<boolean>;
  runRePolish: (
    ins?: string,
    options?: PressAiActionOptions,
  ) => Promise<boolean>;
  applyPendingResult: () => Promise<void>;
  setPendingResult: (res: any) => void;
  saveDraft: (opt?: { silent?: boolean; force?: boolean }) => Promise<boolean>;
  completeWriting: () => Promise<boolean>;
  fetchTeamMembers: () => Promise<void>;
  sendApprovalRequest: (
    targetUserId: string,
    message?: string,
  ) => Promise<boolean>;
};

export const usePressEditStore = create<Store>()((set, get) => ({
  articleId: "",
  teamId: null,
  title: "",
  plain: "",
  spans: [],
  notes: [],
  selectedNoteIds: [],
  reviewing: false,
  reviewError: null,
  saveState: "idle",
  pendingResult: null,
  harnessAction: null,
  usage: null,
  teamMembers: [],

  init: ({
    articleId,
    teamId,
    initialTitle,
    initialPlain,
    initialSpans = [],
    initialNotes = [],
  }) => {
    set({
      articleId,
      teamId,
      title: initialTitle,
      plain: initialPlain,
      spans: initialSpans,
      notes: initialNotes,
      saveState: "idle",
      reviewError: null,
      selectedNoteIds: [],
      pendingResult: null,
      harnessAction: null,
    });
  },
  setTeamId: (teamId) => set({ teamId, teamMembers: [] }),

  setTitle: (title) => set({ title, saveState: "dirty" }),
  setPlain: (plain) => set({ plain, saveState: "dirty" }),

  toggleNoteSelection: (id) =>
    set((s) => ({
      selectedNoteIds:
        id === ""
          ? []
          : s.selectedNoteIds.includes(id)
            ? s.selectedNoteIds.filter((i) => i !== id)
            : [...s.selectedNoteIds, id],
    })),
  setSelectedNoteIds: (ids) => set({ selectedNoteIds: ids }),

  fetchUsage: async () => {
    const { articleId } = get();
    if (!articleId) return;
    try {
      const res = await fetch(`/api/articles/${articleId}/usage`, {
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        set({ usage: data });
      }
    } catch (e) {
      console.error("Usage fetch failed:", e);
    }
  },

  runReview: async (options) => {
    const { articleId, plain, title, fetchUsage } = get();
    const userInstruction = options?.userInstruction?.trim() || undefined;
    set({ reviewing: true, reviewError: null });
    try {
      logBrowserDevEvent("press", "review_request", {
        articleId,
        titlePreview: previewText(title, 120),
        plainPreview: previewText(plain),
        plainLength: plain.length,
        userInstruction: previewText(userInstruction, 200),
      });
      const res = await fetch(`/api/articles/${articleId}/polish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plain,
          title,
          quotaMode: options?.quotaMode,
          userInstruction,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        logBrowserDevEvent("press", "review_response", {
          articleId,
          notesCount: Array.isArray(data.notes) ? data.notes.length : 0,
          notesPreview: Array.isArray(data.notes)
            ? data.notes.slice(0, 5).map((note: Note) => ({
                id: note.id,
                quote: previewText(note.quote, 80),
                note: previewText(note.note, 120),
                type: note.type,
              }))
            : [],
        });
        // [수정] 서비스가 내려준 notes, spans를 그대로 스토어에 반영
        set({
          spans: data.spans || [],
          notes: data.notes || [],
        });
        await fetchUsage();
        return true;
      } else {
        const quotaMessage = readLimitMessage(data);
        throw new Error(
          quotaMessage ??
            data?.message ??
            data?.error ??
            "분석 중 오류가 발생했습니다.",
        );
      }
    } catch (e: any) {
      console.error("Review failed:", e);
      set({ reviewError: e?.message ?? "분석 중 오류가 발생했습니다." });
      return false;
    } finally {
      set({ reviewing: false });
    }
  },

  runRePolish: async (userInstruction, options) => {
    const { articleId, selectedNoteIds, notes, reviewing, fetchUsage } = get();
    if (reviewing || !selectedNoteIds.length) return false;
    set({ reviewing: true, reviewError: null });

    try {
      const selectedNotes = notes.filter((note) => selectedNoteIds.includes(note.id));
      logBrowserDevEvent("press", "repolish_request", {
        articleId,
        userInstruction: previewText(userInstruction, 200),
        selectedNoteIds,
        selectedNotes: selectedNotes.map((note) => ({
          id: note.id,
          quote: previewText(note.quote, 80),
          note: previewText(note.note, 120),
          type: note.type,
        })),
      });
      const res = await fetch(`/api/articles/${articleId}/re-polish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedNoteIds,
          userInstruction,
          quotaMode: options?.quotaMode,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const quotaMessage = readLimitMessage(data);
        throw new Error(
          quotaMessage ??
            data?.message ??
            data?.error ??
            "재작성 요청 중 오류가 발생했습니다.",
        );
      }

      const newTitle = data.revisedTitle || data.title || "";
      const newPlain = data.revisedPlain || data.plain || "";

      if (!newPlain) {
        throw new Error("AI가 빈 결과를 반환했습니다.");
      }

      logBrowserDevEvent("press", "repolish_response", {
        articleId,
        revisedTitlePreview: previewText(newTitle, 120),
        revisedPlainPreview: previewText(newPlain),
        revisedPlainLength: newPlain.length,
      });
      set({
        pendingResult: {
          title: newTitle,
          plain: newPlain,
        },
      });

      await fetchUsage();
      return true;
    } catch (e: any) {
      console.error("Re-polish failed:", e);
      set({
        pendingResult: null,
        reviewError: e?.message ?? "재작성 요청 중 오류가 발생했습니다.",
      });
      return false;
    } finally {
      set({ reviewing: false });
    }
  },

  applyPendingResult: async () => {
    const { pendingResult, saveDraft } = get();
    if (pendingResult) {
      logBrowserDevEvent("press", "apply_pending_result", {
        titlePreview: previewText(pendingResult.title, 120),
        plainPreview: previewText(pendingResult.plain),
        plainLength: pendingResult.plain.length,
      });
      set({
        title: pendingResult.title,
        plain: pendingResult.plain,
        pendingResult: null,
        harnessAction: {
          type: "apply_pending_rewrite",
          appliedAt: new Date().toISOString(),
        },
        selectedNoteIds: [],
        spans: [],
        notes: [], // 기존 분석 내용은 더 이상 유효하지 않으므로 초기화
        saveState: "dirty",
      });

      try {
        const saved = await saveDraft({ force: true });
        if (saved) {
          const { articleId, teamId } = get();
          const verificationResponse = await fetch(
            `/api/articles/${articleId}/verification`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ teamId }),
            },
          );
          if (!verificationResponse.ok) {
            const body = await verificationResponse.json().catch(() => null);
            set({
              reviewError:
                body?.message ??
                "개선안은 저장했지만 자동 검증을 완료하지 못했습니다.",
            });
          }
        }
      } catch (e) {
        console.error("반영 후 자동 저장 실패:", e);
      }
    }
  },

  setPendingResult: (res) => set({ pendingResult: res }),

  saveDraft: async (opt) => {
    const { articleId, title, plain, saveState, harnessAction } = get();

    if (saveState !== "dirty" && !opt?.force) return false;

    set({ saveState: "saving" });
    try {
      const requestBody = {
        title,
        plain,
        ...(harnessAction ? { harnessAction } : {}),
      };
      logBrowserDevEvent("press", "save_request", {
        articleId,
        titlePreview: previewText(title, 120),
        plainPreview: previewText(plain),
        plainLength: plain.length,
        harnessAction,
        force: Boolean(opt?.force),
        silent: Boolean(opt?.silent),
      });
      const res = await fetch(`/api/articles/${articleId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (res.ok) {
        logBrowserDevEvent("press", "save_response", {
          articleId,
          ok: true,
          harnessAction,
        });
        set({ saveState: "saved", harnessAction: null });
        return true;
      }
      throw new Error();
    } catch {
      set({ saveState: "error" });
      return false;
    }
  },

  completeWriting: async () => {
    const { articleId, saveDraft } = get();
    if (!articleId) return false;

    const saved = await saveDraft({ force: true });
    if (!saved) return false;

    try {
      const res = await fetch(`/api/articles/${articleId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "FINAL" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.message ?? data?.error ?? "상태 변경 실패");
      }

      return true;
    } catch (e: any) {
      console.error("Completion failed:", e);
      return false;
    }
  },

  fetchTeamMembers: async () => {
    try {
      const { teamId } = get();
      const url = teamId
        ? `/api/team/members?teamId=${encodeURIComponent(teamId)}`
        : "/api/team/members";
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok && data.ok && Array.isArray(data.members)) {
        set({ teamMembers: data.members });
      }
    } catch (e) {
      console.error("Failed to fetch team members", e);
    }
  },

  sendApprovalRequest: async (targetUserId, message) => {
    const { articleId } = get();
    if (!articleId) return false;

    try {
      const res = await fetch(`/api/articles/${articleId}/approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, message }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.message ?? data?.error ?? "요청 실패");
      }
      return true;
    } catch (e) {
      console.error("Approval request failed:", e);
      alert("결재 요청 중 오류가 발생했습니다.");
      return false;
    }
  },
}));
