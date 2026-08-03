"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  PenLine,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";

import LoadingButton from "@/components/ui/LoadingButton";
import { RightPanel } from "@/components/layout/RightPanel";
import { PressSimplifiedDevSwitcher } from "@/components/press/PressSimplifiedDevSwitcher";
import {
  PressVerificationPanel,
  type PressVerificationState,
} from "@/components/press/PressVerificationPanel";
import {
  PressSimplifiedBottomBar,
  PressSimplifiedWorkspace,
} from "@/components/press/PressSimplifiedWorkspace";
import { toast } from "@/stores/toastStore";
import { useMeStore } from "@/stores/useMeStore";
import { usePressEditStore } from "@/stores/usePressEditStore";
import { buildCanonicalArticlePlain } from "@/domain/article/articleCanonicalContent";
import { useTeamStore } from "@/stores/useTeamStore";

type ArticlePayload = {
  id: string;
  title: string;
  bodyJson: any | null;
  rawInput: string | null;
  teamId?: string | null;
  pressExtra?: { lead: string | null; fact: string | null } | null;
  lastPolishResult?: any | null;
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function buildPlainFromArticle(article: ArticlePayload) {
  const body = article.bodyJson || {};
  return buildCanonicalArticlePlain({
    lead: body.lead || article.pressExtra?.lead,
    fact: body.fact || article.pressExtra?.fact,
    paragraphs: body.paragraphs,
    closing: body.closing,
    rawInput: article.rawInput,
  });
}

function splitParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const REVIEW_REQUIREMENT_PRESETS = [
  "사실관계와 누락 위험을 먼저 봐줘",
  "과장 표현을 엄격하게 봐줘",
  "더 공식적인 문체로 봐줘",
];

export function SimplifiedPressReviewFlow() {
  const router = useRouter();
  const params = useParams() as { id?: string | string[] };
  const rawId = params?.id;
  const articleId = Array.isArray(rawId) ? rawId[0] : rawId;
  const initializedArticleIdRef = useRef<string | null>(null);
  const comparisonRef = useRef<HTMLElement | null>(null);
  const hadPendingResultRef = useRef(false);

  const me = useMeStore((state) => state.me);
  const fetchMe = useMeStore((state) => state.fetchMe);
  const selectedTeamId = useTeamStore((state) => state.selectedTeamId);
  const hydrateFromStorage = useTeamStore((state) => state.hydrateFromStorage);

  const {
    title,
    plain,
    notes,
    selectedNoteIds,
    reviewing,
    saveState,
    pendingResult,
    init,
    setTitle,
    setPlain,
    toggleNoteSelection,
    runReview,
    runRePolish,
    applyPendingResult,
    setPendingResult,
    saveDraft,
    completeWriting,
  } = usePressEditStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [article, setArticle] = useState<ArticlePayload | null>(null);
  const [instruction, setInstruction] = useState("");
  const [completing, setCompleting] = useState(false);
  const [verificationState, setVerificationState] =
    useState<PressVerificationState | null>(null);
  const [verificationRefreshKey, setVerificationRefreshKey] = useState(0);

  useEffect(() => {
    hydrateFromStorage();
    if (!me) void fetchMe();
  }, [fetchMe, hydrateFromStorage, me]);

  useEffect(() => {
    if (!articleId) {
      setError("잘못된 주소입니다.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const teamId = selectedTeamId || me?.teamId;
        const url = teamId
          ? `/api/articles/${articleId}?teamId=${encodeURIComponent(teamId)}`
          : `/api/articles/${articleId}`;
        const res = await fetch(url, {
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          throw new Error(
            data?.message ?? data?.error ?? "보도자료를 불러오지 못했습니다.",
          );
        }

        const loaded = data.article as ArticlePayload;
        setArticle(loaded);
        if (initializedArticleIdRef.current !== loaded.id) {
          initializedArticleIdRef.current = loaded.id;
          init({
            articleId: loaded.id,
            teamId: loaded.teamId ?? null,
            initialTitle: loaded.title || "제목 미정",
            initialPlain: buildPlainFromArticle(loaded),
            initialSpans: loaded.lastPolishResult?.spans || [],
            initialNotes: loaded.lastPolishResult?.notes || [],
          });
        }
      } catch (err: any) {
        setError(err?.message ?? "네트워크 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    })();
  }, [articleId, init, me?.teamId, selectedTeamId]);

  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = window.setTimeout(() => {
      void saveDraft({ silent: true });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [plain, saveDraft, saveState, title]);

  useEffect(() => {
    if (!pendingResult) {
      hadPendingResultRef.current = false;
      return;
    }

    if (hadPendingResultRef.current) return;
    hadPendingResultRef.current = true;

    toast.success(
      "개선안이 준비되었습니다. 변경 비교를 확인해주세요.",
      undefined,
      "top-center",
    );

    window.setTimeout(() => {
      comparisonRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
  }, [pendingResult]);

  const paragraphs = useMemo(() => splitParagraphs(plain), [plain]);
  const pendingParagraphs = useMemo(
    () => splitParagraphs(pendingResult?.plain ?? ""),
    [pendingResult?.plain],
  );
  const selectedCount = selectedNoteIds.length;
  const hasReview = notes.length > 0;
  const verificationFinalizable =
    (saveState === "idle" || saveState === "saved") &&
    verificationState?.freshness === "CURRENT" &&
    verificationState.verification?.result !== "BLOCK";

  const handleReview = async () => {
    const reviewInstruction = instruction.trim();
    const ok = await runReview({
      quotaMode: "simplified",
      userInstruction: reviewInstruction || undefined,
    });
    if (!ok) {
      toast.error(
        usePressEditStore.getState().reviewError ??
          "첨삭을 진행하지 못했습니다.",
        undefined,
        "top-center",
      );
      return;
    }
    if (reviewInstruction) {
      setInstruction("");
    }
    const nextNotes = usePressEditStore.getState().notes;
    if (nextNotes.length === 0) {
      toast.success("큰 수정 제안 없이 읽기 좋은 초안입니다.", undefined, "top-center");
    }
  };

  const handleRewrite = async () => {
    if (selectedCount === 0) {
      toast.error("반영할 제안을 선택해주세요.", undefined, "top-center");
      return;
    }
    const ok = await runRePolish(instruction.trim() || undefined, {
      quotaMode: "simplified",
    });
    if (!ok) {
      toast.error(
        usePressEditStore.getState().reviewError ??
          "선택한 제안을 반영하지 못했습니다.",
        undefined,
        "top-center",
      );
      return;
    }
    setInstruction("");
  };

  const handleApply = async () => {
    await applyPendingResult();
    setVerificationRefreshKey((value) => value + 1);
    setInstruction("");
    toast.success("제안을 반영했습니다.", undefined, "top-center");
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const ok = await completeWriting();
      if (!ok) {
        toast.error("완료 처리에 실패했습니다.", undefined, "top-center");
        return;
      }
      router.push(`/press/${articleId}/final`);
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm font-semibold text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
        초안을 불러오는 중입니다.
      </div>
    );
  }

  if (error || !article || !articleId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-sm text-muted-foreground">
        <p>{error ?? "보도자료를 찾을 수 없습니다."}</p>
        <Link
          href="/press/new"
          className="bg-primary px-4 py-2 font-bold text-primary-foreground"
        >
          새로 만들기
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PressSimplifiedWorkspace paddingClassName="pb-32 pt-6 sm:pt-8">
        <div className="mb-6 border-b border-border/70 pb-5">
          <Link
            href="/press/new"
            className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            새 초안
          </Link>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
            brieFFlow Press
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            초안 첨삭하기
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            초안을 읽고, 필요한 제안만 선택해서 반영하세요.
          </p>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="min-w-0 space-y-5">
            {pendingResult && (
              <section
                ref={comparisonRef}
                className="scroll-mt-24 overflow-hidden border border-ai/40 bg-card ring-1 ring-ai/15"
              >
                <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <h2 className="text-lg font-bold">개선안 작성 완료</h2>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      현재 초안은 아직 바뀌지 않았습니다. 오른쪽 개선안을 확인한 뒤 적용하세요.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <LoadingButton
                      type="button"
                      onClick={handleApply}
                      loading={reviewing}
                      loadingText="적용 중"
                      className="h-10 bg-ai px-4 text-sm font-bold text-ai-foreground transition hover:bg-ai/90"
                    >
                      개선안 적용
                      <ChevronRight className="h-4 w-4" />
                    </LoadingButton>
                    <button
                      type="button"
                      onClick={() => setPendingResult(null)}
                      className="inline-flex h-10 items-center justify-center gap-2 border border-border px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                      취소
                    </button>
                  </div>
                </div>

                <div className="grid gap-4 p-4 lg:grid-cols-2 sm:p-5">
                  <div className="min-w-0 border border-border bg-background p-4">
                    <p className="mb-3 text-xs font-bold text-muted-foreground">
                      현재 초안
                    </p>
                    <h3 className="text-base font-bold leading-6">
                      {title || "제목 없음"}
                    </h3>
                    <div className="mt-3 max-h-[340px] space-y-3 overflow-auto pr-1 text-sm leading-7 text-muted-foreground">
                      {paragraphs.map((paragraph, index) => (
                        <p key={`${paragraph.slice(0, 24)}-${index}`}>
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="min-w-0 border border-ai/30 bg-ai/10 p-4">
                    <p className="mb-3 text-xs font-bold text-ai">개선안</p>
                    <h3 className="text-base font-bold leading-6">
                      {pendingResult.title || "제목 없음"}
                    </h3>
                    <div className="mt-3 max-h-[340px] space-y-3 overflow-auto pr-1 text-sm leading-7">
                      {pendingParagraphs.map((paragraph, index) => {
                        const changed = paragraph !== paragraphs[index];
                        return (
                          <p
                            key={`${paragraph.slice(0, 24)}-${index}`}
                            className={cx(
                              changed && "bg-background/70 px-2 py-1",
                            )}
                          >
                            {paragraph}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </section>
            )}

            <section className="overflow-hidden border border-border bg-card">
              <div className="border-b border-border px-4 py-4 sm:px-5">
                <div className="flex items-center gap-2">
                  <PenLine className="h-4 w-4 text-primary" />
                  <h2 className="text-lg font-bold">초안</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  직접 수정해도 됩니다. 변경 내용은 자동 저장됩니다.
                </p>
              </div>
              <div className="space-y-4 px-4 py-4 sm:px-5">
                <label className="block space-y-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    제목
                  </span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="h-11 w-full border border-input bg-background px-3 text-base font-bold outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/15"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    본문
                  </span>
                  <textarea
                    value={plain}
                    onChange={(event) => setPlain(event.target.value)}
                    className="h-[52vh] min-h-[340px] max-h-[620px] w-full resize-y border border-input bg-background p-4 text-sm leading-7 outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/15"
                  />
                </label>
              </div>
            </section>
          </div>

          <aside className="space-y-5 xl:sticky xl:top-20">
          <section className="overflow-hidden border border-border bg-card">
            <div className="border-b border-border px-4 py-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-ai" />
                <h2 className="text-lg font-bold">첨삭 제안</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasReview
                  ? "반영할 제안만 선택하세요."
                  : "중점 관점을 정하고 첨삭을 시작하세요."}
              </p>
            </div>

            <div className="max-h-[430px] space-y-3 overflow-auto px-4 py-4">
              {pendingResult && (
                <div className="border border-success/30 bg-success/10 p-3 text-sm leading-6">
                  <div className="flex items-center gap-2 font-bold text-success">
                    <CheckCircle2 className="h-4 w-4" />
                    개선안 작성 완료
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    왼쪽 변경 비교에서 내용을 확인하고 적용하세요.
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      comparisonRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    }
                    className="mt-3 inline-flex h-9 items-center justify-center border border-success/30 px-3 text-xs font-bold text-success transition-colors hover:bg-success/10"
                  >
                    비교 보기
                  </button>
                </div>
              )}

              {!hasReview && (
                <div className="border border-ai/25 bg-ai/5 p-3">
                  <label className="block space-y-2">
                    <span className="text-xs font-bold text-ai">
                      첨삭 요구사항
                    </span>
                    <textarea
                      value={instruction}
                      onChange={(event) => setInstruction(event.target.value)}
                      rows={4}
                      className="w-full resize-none border border-ai/25 bg-background p-3 text-sm leading-6 outline-none transition focus:border-ai/50 focus:ring-4 focus:ring-ai/15"
                      placeholder="예: 사실관계와 과장 표현을 먼저 점검해줘"
                    />
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {REVIEW_REQUIREMENT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setInstruction(preset)}
                        className="border border-ai/25 bg-background px-3 py-1.5 text-xs font-bold text-ai transition-colors hover:bg-ai/10"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                  <LoadingButton
                    type="button"
                    onClick={handleReview}
                    loading={reviewing}
                    loadingText="첨삭 중"
                    className="mt-4 h-10 w-full bg-ai px-4 text-sm font-bold text-ai-foreground transition hover:bg-ai/90"
                  >
                    AI 첨삭 시작
                    <Sparkles className="h-4 w-4" />
                  </LoadingButton>
                </div>
              )}

              {notes.map((note) => {
                const selected = selectedNoteIds.includes(note.id);
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => toggleNoteSelection(note.id)}
                    className={cx(
                      "w-full border p-3 text-left transition-colors",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:bg-muted/60",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cx(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase text-primary">
                          {note.type || "제안"}
                        </p>
                        {note.quote && (
                          <p className="mt-2 bg-muted px-2 py-1 text-xs text-muted-foreground">
                            {note.quote}
                          </p>
                        )}
                        <p className="mt-2 text-sm leading-6">{note.note}</p>
                      </div>
                    </div>
                  </button>
                );
              })}

              {hasReview && (
                <label className="block space-y-2 pt-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    추가 요청
                  </span>
                  <textarea
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    rows={3}
                    className="w-full resize-none border border-input bg-background p-3 text-sm leading-6 outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/15"
                    placeholder="예: 더 짧고 공식적인 문체로 다듬어줘"
                  />
                </label>
              )}
            </div>
          </section>

          <section className="border border-border bg-card p-4">
            <PressVerificationPanel
              articleId={articleId}
              teamId={selectedTeamId ?? me?.teamId ?? null}
              refreshKey={`${saveState}:${verificationRefreshKey}`}
              onStateChange={setVerificationState}
            />
          </section>

          <section className="border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <h2 className="text-base font-bold">읽기 미리보기</h2>
            </div>
            <article className="mt-4 max-h-[380px] overflow-auto border border-slate-200 bg-white p-5 text-slate-900">
              <h3 className="border-b border-slate-900 pb-4 text-lg font-bold leading-tight text-black">
                {title || "제목 없음"}
              </h3>
              <div className="mt-4 space-y-4 text-sm leading-7">
                {paragraphs.map((paragraph, index) => (
                  <p
                    key={`${paragraph.slice(0, 28)}-${index}`}
                    className={index === 0 ? "font-bold text-slate-950" : ""}
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </article>
          </section>
          </aside>
        </div>
      </PressSimplifiedWorkspace>

      <PressSimplifiedBottomBar>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">
              {pendingResult
                ? "개선안 작성이 완료되었습니다."
                : hasReview
                  ? `${selectedCount}개 제안이 선택되었습니다.`
                  : "첨삭 없이 완료하거나 AI 제안을 받아볼 수 있습니다."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pendingResult
                ? "현재 초안은 아직 바뀌지 않았습니다. 비교 후 적용하세요."
                : saveState === "saving"
                ? "수정 내용을 저장하는 중입니다."
                : saveState === "saved"
                  ? "수정 내용이 저장되었습니다."
                  : "완료하면 최종 문서 화면으로 이동합니다."}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleComplete}
              disabled={completing || reviewing || !verificationFinalizable}
              className="inline-flex h-11 items-center justify-center gap-2 bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {completing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              완료하기
            </button>

            {!hasReview && !pendingResult && (
              <LoadingButton
                type="button"
                onClick={handleReview}
                loading={reviewing}
                loadingText="첨삭 중"
                className="h-11 bg-ai px-5 text-sm font-bold text-ai-foreground transition hover:bg-ai/90"
              >
                AI 첨삭 시작
                <Sparkles className="h-4 w-4" />
              </LoadingButton>
            )}

            {hasReview && !pendingResult && (
              <LoadingButton
                type="button"
                onClick={handleRewrite}
                loading={reviewing}
                loadingText="개선안 작성 중"
                disabled={selectedCount === 0}
                className="h-11 bg-ai px-5 text-sm font-bold text-ai-foreground transition hover:bg-ai/90 disabled:bg-muted disabled:text-muted-foreground"
              >
                선택한 제안 반영
                <RefreshCw className="h-4 w-4" />
              </LoadingButton>
            )}

            {pendingResult && (
              <LoadingButton
                type="button"
                onClick={handleApply}
                loading={reviewing}
                loadingText="적용 중"
                className="h-11 bg-ai px-5 text-sm font-bold text-ai-foreground transition hover:bg-ai/90"
              >
                개선안 적용
                <ChevronRight className="h-4 w-4" />
              </LoadingButton>
            )}
          </div>
        </div>
      </PressSimplifiedBottomBar>
      <RightPanel />
      <PressSimplifiedDevSwitcher current="review" />
    </div>
  );
}
