"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { validate, V } from "@/lib/utils/validate";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  History,
  Info,
  Lightbulb,
  PenTool,
  RefreshCw,
  Sparkles,
  Trash2,
  MessageSquareQuote,
  Zap,
  Users,
} from "lucide-react";
import { BriefEvidenceCandidates } from "./BriefEvidenceCandidates";

import { useMeStore } from "@/stores/useMeStore";
import { useTeamStore } from "@/stores/useTeamStore";
import {
  usePressGeneratorStore,
  ArticleResult,
} from "@/stores/usePressGeneratorStore";
import LoadingButton from "../ui/LoadingButton";
import { toast } from "@/stores/toastStore";
import ZapActionButton from "@/components/ui/ZapActionButton";
import {
  clearPressDemoDraft,
  loadPressDemoDraft,
} from "@/lib/pressDemoDraft";
import { trackGaEvent } from "@/lib/analytics/ga4";

// --- 입력 단계 검증 스키마 ---
const InputSchema = z.object({
  rawText: V.minLen("핵심 내용", 30).max(
    3000,
    "핵심 내용은 최대 3000자까지 입력 가능합니다.",
  ),
});

// --- 브리프 단계 검증 스키마 ---
const BriefSchema = z.object({
  serviceName: V.required("서비스/제품명"),
  announceType: V.required("발표 유형"),
  eventAt: V.required("행사/출시 일시"),
  oneLiner: V.minLen("한 줄 요약", 10),
  points: z
    .array(V.required("핵심 포인트 내용"))
    .min(1, "핵심 포인트는 최소 1개 이상 필요합니다."),
});

const UNWANTED_SENTENCES = ["자세한 사항은 공식 웹사이트에서 확인할 수 있다."];
function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}
function stripUnwanted(text: string) {
  if (!text) return "";
  let out = text;
  UNWANTED_SENTENCES.forEach((s) => {
    const re = new RegExp(s.replace(/[-/\\^$*+?.()|[\\]{}]/g, "\\$&"), "gi");
    out = out.replace(re, " ");
  });
  return out.replace(/\s+/g, " ").trim();
}

const TONE_OPTIONS = [
  { id: "formal", label: "정중 · 통신사", desc: "신뢰감 있고 격식 있는 문체" },
  { id: "neutral", label: "중립 · 담백", desc: "팩트 중심의 깔끔한 전달" },
  {
    id: "friendly",
    label: "친근 · 스타트업",
    desc: "에너지 넘치고 부드러운 어조",
  },
] as const;

// --- [추가] 포인트 입력 컴포넌트 (자동 높이 조절) ---
const PointInputItem = ({
  point,
  index,
  onChange,
  onRemove,
}: {
  point: string;
  index: number;
  onChange: (index: number, val: string) => void;
  onRemove: (index: number) => void;
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 내용(point)이 변경될 때마다 높이 자동 조절
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [point]);

  return (
    <div className="flex items-start gap-3 group animate-in slide-in-from-bottom-1 duration-300">
      <div className="pt-3.5 w-6 flex justify-center shrink-0">
        <span className="text-xs font-bold text-muted-foreground/40 tabular-nums">
          {index + 1}
        </span>
      </div>
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={point}
          onChange={(e) => onChange(index, e.target.value)}
          rows={1}
          style={{ minHeight: "44px" }}
          className="pt-input w-full py-3 pl-3 pr-10 resize-none overflow-hidden bg-background/50 focus:bg-background transition-colors leading-relaxed"
        />
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 text-muted-foreground/40 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
          title="삭제"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export function PressGenerator({
  editPathForArticle = (articleId: string) => `/press/${articleId}/edit`,
}: {
  editPathForArticle?: (articleId: string) => string;
} = {}) {
  const router = useRouter();
  const { me, fetchMe } = useMeStore();
  const { selectedTeamId, setSelectedTeamId, hydrateFromStorage } =
    useTeamStore();
  const initializedRef = useRef(false);

  const {
    reset,
    rawText,
    tone,
    brief,
    factCandidates,
    normalizeLoading,
    normalizeError,
    result,
    loading,
    previewLoading,
    drafts,
    selectedArticleId,
    view,
    usage,
    articleId,
    fetchUsage,
    setRawText,
    setTone,
    goToBrief,
    setView,
    normalizeBrief,
    decideFactCandidate,
    submitGenerate,
    selectDraft,
    setBriefPatch,
    addPoint,
    changePoint,
    removePoint,
  } = usePressGeneratorStore();

  const [copied, setCopied] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 네비게이션 로딩 상태
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    hydrateFromStorage();
    reset();
    fetchUsage();

    const restored = loadPressDemoDraft();
    if (restored) {
      setRawText(restored.rawText);
      setTone(restored.tone);
      if (restored.view === "input") {
        setView("input");
      } else {
        setBriefPatch(restored.brief);
        goToBrief();
      }
      clearPressDemoDraft();
      return;
    }

    setView("input");
  }, [
    reset,
    fetchUsage,
    setView,
    hydrateFromStorage,
    setRawText,
    setTone,
    setBriefPatch,
    goToBrief,
  ]);

  useEffect(() => {
    if (articleId && !usage) {
      fetchUsage();
    }
  }, [articleId, usage, fetchUsage]);

  const teams = me?.teams ?? [];
  const effectiveTeamId = useMemo(() => {
    if (teams.length === 0) return null;
    const ids = new Set(teams.map((t) => t.id));
    if (selectedTeamId && ids.has(selectedTeamId)) return selectedTeamId;
    return teams[0]?.id ?? null;
  }, [teams, selectedTeamId]);

  const handleTeamChange = async (newTeamId: string) => {
    if (newTeamId === effectiveTeamId) return;
    setSelectedTeamId(newTeamId);
    try {
      await fetch("/api/team/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: newTeamId }),
      });
      await fetchMe();
      await fetchUsage();
    } catch (e) {
      console.error(e);
    }
  };

  const compactPreviewText = useMemo(() => {
    if (!result) return "";
    const parts = [
      result.lead,
      result.fact,
      ...(result.paragraphs ?? []).map((p) => p.text),
      result.closing,
    ]
      .map((t) => stripUnwanted(t ?? ""))
      .filter(Boolean);
    return parts.join("\n\n");
  }, [result]);

  const handleCopy = () => {
    if (!compactPreviewText) return;
    navigator.clipboard.writeText(compactPreviewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAnalyze = async () => {
    const { success, errors: validationErrors } = validate(InputSchema, {
      rawText,
    });

    if (!success && validationErrors) {
      setErrors(validationErrors);
      const firstMsg = Object.values(validationErrors)[0];
      toast.error(firstMsg, undefined, "top-center");
      return;
    }

    setErrors({});
    await normalizeBrief();
  };

  const onSubmit = async () => {
    const { success, errors: validationErrors } = validate(BriefSchema, brief);

    if (!success && validationErrors) {
      const firstErrorMessage = Object.values(validationErrors)[0];
      toast.error(firstErrorMessage, undefined, "top-center");
      return;
    }

    try {
      trackGaEvent("draft_generate_clicked", {
        tone,
        points_count: brief.points.length,
        has_quote: !!brief.quoteMessage,
        raw_length: rawText.length,
      });
      await submitGenerate();
      await Promise.all([fetchMe(), fetchUsage()]);
    } catch (e: any) {
      if (e?.status === 403 && e?.code?.includes("LIMIT")) {
        toast.error(
          "플랜에서 생성 가능한 횟수를 모두 사용했습니다.",
          undefined,
          "top-center",
        );
        return;
      }
      toast.error(e?.message ?? "생성 중 오류가 발생했습니다.");
    }
  };

  // 이동 중 중복 클릭 방지 및 상태 처리
  const handleGoToEdit = async () => {
    const targetId =
      selectedArticleId ?? (result as ArticleResult | null)?.articleId;

    if (!targetId || isNavigating) return;

    setIsNavigating(true);

    try {
      await fetch(`/api/articles/${targetId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      router.push(editPathForArticle(targetId));
    } catch (e) {
      console.error(e);
      setIsNavigating(false);
    }
  };

  const handleInsertExample = () => {
    setRawText(`3월 1일 정식 오픈, 2030 직장인 타깃 금융 앱 '세이브잇'.
오픈 기념으로 3개월간 전환 금액의 2% 추가 캐시백 제공.
기존 은행 앱은 복잡하지만 우리는 직관적인 UI와 '게이미피케이션'이 강점.
대표님 왈 "소비가 아닌 자산이 되는 경험을 제공하겠다."`);
    setErrors({});
  };

  const isInputView = view === "input";
  const isBriefView = view === "brief";
  const isPreviewView = view === "preview";

  const renderInputSection = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          어떤 보도자료를 작성할까요?
        </h1>
        <p className="text-muted-foreground text-sm">
          형식은 brieFFlow가 잡아줘요. 자유롭게 입력해보세요.
        </p>
      </div>

      {teams.length > 0 && (
        <div className="flex items-center gap-3 bg-muted/40 p-3 border border-border/50">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <div className="p-1.5 bg-background border border-border">
              <Users className="w-3.5 h-3.5" />
            </div>
            작성할 팀
          </div>
          <div className="relative flex-1 max-w-[240px]">
            <select
              value={effectiveTeamId ?? ""}
              onChange={(e) => handleTeamChange(e.target.value)}
              className="w-full appearance-none bg-background border border-input text-foreground text-sm font-bold pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-shadow cursor-pointer hover:border-primary/50"
            >
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>

          {me?.usage?.effectivePlanName && (
            <span className="hidden sm:inline-flex text-[10px] font-bold px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 ml-auto">
              {me.usage.effectivePlanName} Plan
            </span>
          )}
        </div>
      )}

      <div
        className={cx(
          "pt-surface p-1 space-y-4 ring-1 transition-all duration-200",
          errors.rawText
            ? "border-red-500/50 ring-red-500/20"
            : "border-primary/20 ring-primary/10",
        )}
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-bold flex items-center gap-2 text-foreground/80">
              <PenTool className="w-4 h-4 text-primary" />
              핵심 내용
            </label>
            <button
              type="button"
              onClick={handleInsertExample}
              className="text-xs font-medium text-primary hover:bg-primary/10 px-2 py-1 rounded transition-colors flex items-center gap-1.5"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              예시로 채우기
            </button>
          </div>

          <div className="relative">
            <textarea
              value={rawText}
              onChange={(e) => {
                setRawText(e.target.value);
                if (errors.rawText && e.target.value.length >= 30) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.rawText;
                    return next;
                  });
                }
              }}
              className="w-full min-h-[300px] bg-transparent border-0 resize-none outline-none text-base leading-relaxed placeholder:text-muted-foreground/40"
              placeholder={`예시)
- 3월 1일, 2030 직장인 타깃 금융 앱 '세이브잇' 정식 오픈
- 오픈 기념 3개월간 2% 추가 캐시백 이벤트
- 경쟁사 대비 직관적인 UI와 게이미피케이션 요소 강조
- 대표님 코멘트: "소비가 아닌 자산이 되는 경험을 제공하겠다"`}
            />
            <div
              className={cx(
                "absolute bottom-0 right-0 text-[10px] font-mono pointer-events-none transition-colors",
                rawText.length > 3000
                  ? "text-red-500 font-bold"
                  : "text-muted-foreground/40",
              )}
            >
              {rawText.length} / 3000
            </div>
          </div>
        </div>

        {errors.rawText && (
          <div className="px-4 pb-3 animate-in slide-in-from-top-1">
            <p className="text-red-500 text-xs font-medium flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              {errors.rawText}
            </p>
          </div>
        )}

        <div className="border-t border-border/50 bg-muted/20 px-4 py-3 flex flex-wrap items-center gap-4">
          <span className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 mr-auto">
            <Sparkles className="w-3.5 h-3.5" />
            톤앤매너:
          </span>
          <div className="flex gap-2">
            {TONE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setTone(opt.id as any)}
                className={cx(
                  "px-3 py-1.5 text-xs font-medium transition-all border",
                  tone === opt.id
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-card border-transparent hover:bg-muted text-muted-foreground",
                )}
                title={opt.desc}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-end gap-3 pt-2">
        <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
          <LoadingButton
            type="button"
            onClick={handleAnalyze}
            loading={normalizeLoading}
            loadingText="분석 중..."
            disabled={
              usage?.articleUsage && !usage.planLimits.unlimited
                ? usage.articleUsage.briefRemaining <= 0
                : false
            }
            className={cx(
              "w-full sm:w-auto pl-6 pr-4 py-3.5 text-base font-bold transition-all hover:scale-[1.02] active:scale-[0.98]",
              usage?.articleUsage &&
              !usage.planLimits.unlimited &&
              usage.articleUsage.briefRemaining <= 0
                ? "bg-muted text-muted-foreground cursor-not-allowed shadow-none"
                : "bg-ai text-ai-foreground hover:bg-ai/90",
            )}
          >
            <div className="flex items-center justify-center gap-2">
              <span>브리프 생성하기</span>
              {usage?.articleUsage && usage?.planLimits && (
                <span
                  className={cx(
                    "text-xs font-medium tabular-nums px-1.5 py-0.5 rounded ml-1",
                    !usage.planLimits.unlimited &&
                    usage.articleUsage.briefRemaining <= 0
                      ? "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-300"
                      : "bg-black/10 dark:bg-white/10 text-ai-foreground/90",
                  )}
                >
                  {usage.planLimits.unlimited
                    ? "무제한"
                    : `${usage.articleUsage.briefRemaining}/${usage.planLimits.perBrief}`}
                </span>
              )}
              <ArrowRight className="w-5 h-5" />
            </div>
          </LoadingButton>

          {usage?.articleUsage && (
            <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 text-right">
              <Info className="w-3 h-3 opacity-70 shrink-0" />
              <span>
                이 문서에서 사용 가능한{" "}
                <span className="font-semibold text-foreground/80">
                  생성/수정 횟수
                </span>
                입니다.
              </span>
            </p>
          )}
        </div>

        {normalizeError && (
          <div className="w-full sm:w-auto bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs px-3 py-2 font-medium flex items-center gap-2 animate-in slide-in-from-top-1">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>
              {normalizeError.includes("403") || normalizeError.includes("권한")
                ? "생성 한도를 초과했거나 권한이 없습니다."
                : normalizeError}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  const renderGuideSection = () => (
    <div className="h-full flex flex-col justify-center animate-in fade-in slide-in-from-right-4 duration-700 delay-100">
      <div className="bg-gradient-to-br from-primary/5 via-card to-card border border-primary/10 p-6 md:p-8 space-y-6">
        <div className="space-y-2">
          <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
            <Zap className="w-5 h-5 text-yellow-500 fill-yellow-500" />
            작성 팁
          </h3>
          <p className="text-sm text-muted-foreground">
            완벽한 문장이 아니어도 괜찮습니다. 아래 3가지만 포함해보세요.
          </p>
        </div>
        <ul className="space-y-4">
          <li className="flex gap-3">
            <div className="w-8 h-8 bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-sm shrink-0">
              1
            </div>
            <div className="text-sm">
              <span className="block font-bold text-foreground mb-0.5">
                무엇을 (What)
              </span>
              <span className="text-muted-foreground">
                출시, 업데이트, 이벤트 등 핵심 뉴스
              </span>
            </div>
          </li>
          <li className="flex gap-3">
            <div className="w-8 h-8 bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-sm shrink-0">
              2
            </div>
            <div className="text-sm">
              <span className="block font-bold text-foreground mb-0.5">
                언제 (When)
              </span>
              <span className="text-muted-foreground">정확한 일시나 기간</span>
            </div>
          </li>
          <li className="flex gap-3">
            <div className="w-8 h-8 bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-sm shrink-0">
              3
            </div>
            <div className="text-sm">
              <span className="block font-bold text-foreground mb-0.5">
                왜 (Why/Benefit)
              </span>
              <span className="text-muted-foreground">
                사용자가 얻는 이점이나 차별점
              </span>
            </div>
          </li>
        </ul>
        <div className="pt-4 border-t border-border/50">
          <div className="bg-muted/50 p-3 text-xs text-muted-foreground flex gap-2">
            <MessageSquareQuote className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
            <p>
              대표님이나 담당자의 인용구(&quot;...&quot;)를 한 줄 넣어주면
              기사의 신뢰도가 훨씬 높아집니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  const renderBriefSection = () => (
    <div className="h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-300 relative">
      <div className="flex items-center justify-between mb-6 px-1">
        <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
          <div className="p-1.5 bg-primary/10 text-primary">
            <Check className="w-5 h-5" />
          </div>
          브리프 확정
        </h2>
        <button
          onClick={() => setView("input")}
          className="group flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-colors pr-1"
        >
          <PenTool className="w-3 h-3 transition-transform group-hover:-translate-x-0.5" />
          입력 수정하기
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar pb-32 -mx-2 px-2">
        <div className="space-y-6">
          <BriefEvidenceCandidates
            candidates={factCandidates}
            onDecision={decideFactCandidate}
          />
          <div className="bg-card/50 border border-border/50 p-5 space-y-5">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground/80 border-b border-border/40 pb-2 mb-2">
              <Info className="w-4 h-4 text-primary" />
              기본 정보
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pl-0.5">
                  서비스/제품명
                </label>
                <input
                  value={brief.serviceName}
                  onChange={(e) =>
                    setBriefPatch({ serviceName: e.target.value })
                  }
                  className="pt-input w-full h-11 px-3 bg-background/50 focus:bg-background transition-colors"
                  placeholder="예: 세이브잇"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pl-0.5">
                  발표 유형
                </label>
                <div className="relative">
                  <select
                    value={brief.announceType}
                    onChange={(e) =>
                      setBriefPatch({ announceType: e.target.value })
                    }
                    className="pt-input w-full h-11 px-3 bg-background/50 focus:bg-background transition-colors appearance-none cursor-pointer"
                  >
                    <option>신제품 출시</option>
                    <option>서비스 업데이트</option>
                    <option>제휴/파트너십</option>
                    <option>행사/이벤트 개최</option>
                    <option>성과 발표</option>
                    <option>기타</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pl-0.5 flex items-center justify-between">
                  <span>행사/출시 일시</span>
                  <span className="text-[9px] font-normal opacity-70 bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                    필수
                  </span>
                </label>
                <input
                  type="datetime-local"
                  value={brief.eventAt}
                  onChange={(e) => setBriefPatch({ eventAt: e.target.value })}
                  className="pt-input w-full h-11 px-3 bg-background/50 focus:bg-background font-mono text-sm tracking-tight"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider pl-0.5 flex items-center justify-between">
                  <span>배포 희망 일시</span>
                  <span className="text-[9px] font-normal opacity-50">
                    선택
                  </span>
                </label>
                <input
                  type="datetime-local"
                  value={brief.publishAt}
                  onChange={(e) => setBriefPatch({ publishAt: e.target.value })}
                  className="pt-input w-full h-11 px-3 bg-background/50 focus:bg-background font-mono text-sm tracking-tight text-muted-foreground focus:text-foreground transition-colors"
                />
              </div>
            </div>
          </div>

          <div className="bg-card/50 border border-border/50 p-5 space-y-5">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-bold text-foreground/80 mb-1">
                <FileText className="w-4 h-4 text-primary" />한 줄 요약 (리드문)
              </label>
              <textarea
                value={brief.oneLiner}
                onChange={(e) => setBriefPatch({ oneLiner: e.target.value })}
                className="pt-input w-full min-h-[80px] p-4 leading-relaxed resize-none bg-background/50 focus:bg-background transition-colors"
                placeholder="가장 중요한 핵심 내용을 한 문장으로 정리해주세요."
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <label className="flex items-center gap-2 text-sm font-bold text-foreground/80">
                  <div className="flex items-center justify-center w-4 h-4 rounded-full border border-primary text-[10px] text-primary font-bold">
                    !
                  </div>
                  핵심 포인트
                </label>
                <button
                  type="button"
                  onClick={addPoint}
                  className="text-xs font-bold text-primary hover:bg-primary/10 px-2.5 py-1.5 transition-colors flex items-center gap-1"
                >
                  <span className="text-lg leading-none">+</span> 추가
                </button>
              </div>

              <div className="space-y-3">
                {/* [수정] PointInputItem 컴포넌트 사용 */}
                {brief.points.map((p, idx) => (
                  <PointInputItem
                    key={idx}
                    point={p}
                    index={idx}
                    onChange={changePoint}
                    onRemove={removePoint}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-primary/5 via-card/50 to-card/50 border border-primary/10 p-5 space-y-4">
            <label className="flex items-center gap-2 text-sm font-bold text-foreground/80">
              <MessageSquareQuote className="w-4 h-4 text-primary" />
              핵심 인용구 (Quote)
            </label>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 border border-border">
                  <Users className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <input
                    value={brief.quoteWho}
                    onChange={(e) =>
                      setBriefPatch({ quoteWho: e.target.value })
                    }
                    placeholder="말한 사람 (예: 김철수 대표)"
                    className="pt-input w-full h-10 px-3 text-sm font-medium bg-background/80 focus:bg-background transition-colors"
                  />
                </div>
              </div>

              <div className="relative ml-[3.25rem]">
                <div className="absolute top-4 -left-2 w-2 h-2 bg-background border-l border-t border-input transform -rotate-45" />
                <textarea
                  value={brief.quoteMessage}
                  onChange={(e) =>
                    setBriefPatch({ quoteMessage: e.target.value })
                  }
                  className="pt-input w-full min-h-[80px] p-3 resize-none text-sm bg-background/80 focus:bg-background transition-colors leading-relaxed"
                  placeholder='"이번 서비스 출시는 우리 팀의 끊임없는 노력의 결실이며..."'
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-20">
        <div className="h-12 bg-gradient-to-t from-background to-transparent pointer-events-none" />
        <div className="bg-background/80 backdrop-blur-md border-t border-border/50 p-4 pb-2">
          <div className="flex justify-end">
            <ZapActionButton
              label="보도자료 초안 생성"
              loadingLabel="AI가 문장을 빚는 중..."
              loading={loading}
              onClick={onSubmit}
              points={-1}
              className="w-full sm:w-auto"
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderPreviewSection = () => (
    <div className="h-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-500">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="bg-green-500/10 text-green-600 dark:text-green-400 p-1.5">
            <Check className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-foreground">생성 완료</h2>
            <p className="text-[10px] text-muted-foreground">
              내용을 확인하고 복사하거나 수정하세요.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {result?.articleId && (
            <button
              onClick={handleGoToEdit}
              disabled={isNavigating}
              className={cx(
                "group relative w-full sm:w-auto inline-flex items-center justify-between gap-3 px-4 py-3 text-white ring-1 ring-white/15 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                isNavigating
                  ? "bg-primary/80 cursor-wait opacity-80"
                  : "bg-gradient-to-r from-primary to-blue-600 hover:opacity-95 active:scale-[0.98]"
              )}
            >
              <span className="flex items-center gap-3">
                <span className="flex items-center justify-center w-9 h-9 bg-white/15 ring-1 ring-white/20">
                  {isNavigating ? (
                    <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-4.5 h-4.5" />
                  )}
                </span>
                <span className="flex flex-col items-start leading-tight">
                  <span className="text-[11px] font-bold opacity-90">
                    {isNavigating ? "이동 중..." : "다음 단계"}
                  </span>
                  <span className="text-sm font-extrabold">
                    {isNavigating ? "잠시만 기다려주세요" : "AI 첨삭으로 이동"}
                  </span>
                </span>
              </span>
              {!isNavigating && (
                <span className="inline-flex items-center gap-1.5">
                  <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                </span>
              )}
              {!isNavigating && (
                <span className="pointer-events-none absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          )}
        </div>
      </div>

      {drafts?.length > 1 && (
        <div className="mb-4">
          <details className="group pt-surface overflow-hidden">
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground select-none hover:bg-muted/50">
              <div className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                <span>다른 버전 보기 ({drafts.length})</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t border-border bg-muted/30 max-h-32 overflow-y-auto">
              {drafts.map((d) => (
                <button
                  key={d.articleId}
                  onClick={() => selectDraft(d.articleId)}
                  className={cx(
                    "w-full text-left px-4 py-2 flex items-center justify-between hover:bg-primary/5 transition-colors border-b border-border/50 last:border-0",
                    d.articleId === selectedArticleId
                      ? "text-primary font-bold bg-primary/5"
                      : "text-muted-foreground",
                  )}
                >
                  <span className="truncate flex-1 text-xs">
                    {d.title || "제목 없음"}
                  </span>
                  <span className="text-[9px] opacity-50 ml-2 font-mono">
                    {new Date(d.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </button>
              ))}
            </div>
          </details>
        </div>
      )}

      <div className="flex-1 relative border border-border bg-muted/30 overflow-hidden flex flex-col">
        {previewLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-medium">문서를 불러오는 중...</span>
          </div>
        ) : result ? (
          <div className="flex-1 overflow-auto p-4 sm:p-6 custom-scrollbar">
            <div className="bg-white text-slate-900 border border-slate-200 min-h-full max-w-[680px] mx-auto p-8 sm:p-10">
              <div className="border-b-2 border-slate-900 pb-6 mb-8">
                <h1 className="text-2xl font-bold leading-tight tracking-tight text-black">
                  {result.title}
                </h1>
              </div>
              <div className="space-y-6 text-[15px] leading-[1.8] text-justify font-serif text-slate-800">
                <p className="font-bold text-slate-950">
                  {compactPreviewText.split("\n\n")[0]}
                </p>
                <div className="whitespace-pre-line">
                  {compactPreviewText.split("\n\n").slice(1).join("\n\n")}
                </div>
              </div>
            </div>
            <div className="absolute top-4 right-4 flex gap-2">
              <button
                onClick={handleCopy}
                className="p-2 bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary transition-all active:scale-95"
                title="텍스트 복사"
              >
                {copied ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            생성된 내용이 없습니다.
          </div>
        )}
      </div>

      {result?.articleId && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleGoToEdit}
            disabled={isNavigating}
            className={cx(
              "group relative w-full sm:w-auto inline-flex items-center justify-between gap-3 px-4 py-3 text-white ring-1 ring-white/15 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              isNavigating
                ? "bg-primary/80 cursor-wait opacity-80"
                : "bg-gradient-to-r from-primary to-blue-600 hover:opacity-95 active:scale-[0.98]",
            )}
          >
            <span className="flex items-center gap-3">
              <span className="flex items-center justify-center w-9 h-9 bg-white/15 ring-1 ring-white/20">
                {isNavigating ? (
                  <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                ) : (
                  <Sparkles className="w-4.5 h-4.5" />
                )}
              </span>
              <span className="flex flex-col items-start leading-tight">
                <span className="text-[11px] font-bold opacity-90">
                  {isNavigating ? "이동 중..." : "다음 단계"}
                </span>
                <span className="text-sm font-extrabold">
                  {isNavigating ? "잠시만 기다려주세요" : "AI 첨삭으로 이동"}
                </span>
              </span>
            </span>
            {!isNavigating && (
              <span className="inline-flex items-center gap-1.5">
                <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6 max-w-[1200px] mx-auto pb-12 pt-4 px-2">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:min-h-[600px]">
        <section
          className={cx(
            "flex flex-col transition-all duration-500 ease-in-out",
            isPreviewView
              ? "lg:col-span-5 hidden lg:flex"
              : "lg:col-span-7 flex",
          )}
        >
          {isBriefView ? renderBriefSection() : renderInputSection()}
        </section>

        <section
          className={cx(
            "flex flex-col h-full transition-all duration-500 ease-in-out",
            isPreviewView
              ? "lg:col-span-7 flex"
              : "lg:col-span-5 hidden lg:flex",
          )}
        >
          {isInputView && renderGuideSection()}
          {isBriefView && (
            <div className="h-full flex items-center justify-center text-muted-foreground/30 text-sm p-8 border-2 border-dashed border-border">
              <div className="text-center">
                <FileText className="w-12 h-12 mx-auto mb-2 opacity-20" />
                <p>
                  브리프를 확정하면
                  <br />
                  여기에 완성된 보도자료가 표시됩니다.
                </p>
              </div>
            </div>
          )}
          {isPreviewView && renderPreviewSection()}
        </section>
      </div>
    </div>
  );
}
