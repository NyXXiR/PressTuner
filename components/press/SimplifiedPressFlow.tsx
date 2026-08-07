"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Lightbulb,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { BriefEvidenceCandidates } from "./BriefEvidenceCandidates";
import {
  PressVerificationPanel,
  type PressVerificationState,
} from "./PressVerificationPanel";

import LoadingButton from "@/components/ui/LoadingButton";
import {
  PressSimplifiedDevSwitcher,
  type PressSimplifiedDevStep,
} from "@/components/press/PressSimplifiedDevSwitcher";
import {
  PressSimplifiedBottomBar,
  PressSimplifiedWorkspace,
} from "@/components/press/PressSimplifiedWorkspace";
import { trackGaEvent } from "@/lib/analytics/ga4";
import { createPressFlowApiClient } from "@/lib/press/pressFlowApiClient";
import { validate } from "@/lib/utils/validate";
import { toast } from "@/stores/toastStore";
import { useMeStore } from "@/stores/useMeStore";
import {
  usePressGeneratorStore,
  type ArticleResult,
} from "@/stores/usePressGeneratorStore";
import { useTeamStore } from "@/stores/useTeamStore";

const pressFlowApi = createPressFlowApiClient();

const INPUT_MIN_LENGTH = 30;
const INPUT_MAX_LENGTH = 3000;

const SAMPLE_INPUT = `3월 1일 정식 오픈, 2030 직장인 타깃 금융 앱 '세이브잇'.
오픈 기념으로 3개월간 전환 금액의 2% 추가 캐시백 제공.
기존 은행 앱은 복잡하지만 우리는 직관적인 UI와 게이미피케이션이 강점.
김민준 대표 코멘트: "소비가 아닌 자산이 되는 경험을 제공하겠다."`;

const DEV_BRIEF = {
  serviceName: "세이브잇",
  announceType: "신제품 출시",
  oneLiner:
    "2030 직장인을 위한 금융 앱 세이브잇이 정식 출시와 함께 2% 추가 캐시백 프로모션을 진행한다.",
  points: [
    "2026년 3월 1일 정식 출시",
    "3개월간 전환 금액 2% 추가 캐시백",
    "직관적인 UI와 게이미피케이션 기반 금융 경험",
  ],
  quoteWho: "김민준 대표",
  quoteMessage: "소비가 아닌 자산이 되는 경험을 제공하겠다.",
  eventAt: "2026-03-01T09:00",
  publishAt: "2026-03-01T09:00",
};

const DEV_RESULT: ArticleResult = {
  title: "2030 직장인 맞춤 금융 앱 '세이브잇', 정식 출시 및 캐시백 프로모션 종료",
  lead:
    "2030 직장인을 위한 금융 앱 '세이브잇'이 2026년 3월 1일 정식 출시되었으며, 오픈 기념으로 3개월간 2% 추가 캐시백 프로모션을 진행 중이다.",
  fact: "",
  paragraphs: [
    {
      text: "'세이브잇'은 2026년 3월 1일 정식 오픈된 금융 앱으로, 2030 직장인을 주요 타깃으로 한다. 직관적인 UI와 게이미피케이션 기능을 통해 기존 은행 앱 대비 사용이 간편하고 즐거운 금융 경험을 제공한다.",
      importance: 0,
    },
    {
      text: "세이브잇은 금융 거래 시 전환 금액의 2%를 추가로 캐시백해주는 프로모션을 3개월간 진행하며 사용자들에게 실질적인 혜택을 제공한다.",
      importance: 0,
    },
    {
      text: '김민준 세이브잇 대표는 "소비가 아닌 자산이 되는 경험을 제공하겠다"고 말하며, 세이브잇만의 차별화된 금융 경험을 강조했다.',
      importance: 0,
    },
  ],
  closing:
    "세이브잇은 사용자 친화적인 디자인과 기능으로 2030 직장인들이 금융 활동에 더 쉽게 접근할 수 있도록 서비스를 확장할 계획이다.",
};

const InputSchema = z.object({
  rawText: z
    .string()
    .min(
      INPUT_MIN_LENGTH,
      `핵심 내용은 최소 ${INPUT_MIN_LENGTH}자 이상이어야 합니다.`,
    )
    .max(
      INPUT_MAX_LENGTH,
      `핵심 내용은 최대 ${INPUT_MAX_LENGTH}자까지 입력 가능합니다.`,
    ),
});

const BriefSchema = z.object({
  serviceName: z.string().trim().min(1, "서비스/제품/행사명을 입력해주세요."),
  announceType: z.string().trim().min(1, "발표 유형을 입력해주세요."),
  eventAt: z.string().trim(),
  oneLiner: z
    .string()
    .trim()
    .min(10, "한 줄 요약은 최소 10자 이상이어야 합니다."),
  points: z
    .array(z.string().trim().min(1, "핵심 포인트를 입력해주세요."))
    .min(1, "핵심 포인트는 최소 1개 이상 필요합니다."),
});

const TONE_OPTIONS = [
  { id: "formal", label: "공식", desc: "정중하고 격식 있는 문체" },
  { id: "neutral", label: "중립", desc: "팩트 중심의 담백한 문체" },
  { id: "friendly", label: "친근", desc: "부드럽고 에너지 있는 문체" },
] as const;

const ANNOUNCE_TYPES = [
  "신제품 출시",
  "서비스 업데이트",
  "제휴/파트너십",
  "행사/이벤트 개최",
  "성과 발표",
  "기타",
];

const STEPS = [
  { key: "input", label: "메모" },
  { key: "brief", label: "확인" },
  { key: "preview", label: "초안" },
] as const;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function stripUnwanted(text: string) {
  return text
    .replace(/자세한 사항은 공식 웹사이트에서 확인할 수 있다\./g, "")
    .trim();
}

function firstValidationMessage(errors: Record<string, string> | null) {
  return errors ? Object.values(errors)[0] : null;
}

export function SimplifiedPressFlow() {
  const router = useRouter();
  const initializedRef = useRef(false);

  const { me, fetchMe } = useMeStore();
  const hydrateFromStorage = useTeamStore((state) => state.hydrateFromStorage);

  const {
    reset,
    rawText,
    tone,
    brief,
    factCandidates,
    briefReviewed,
    articleId,
    normalizeLoading,
    normalizeError,
    loading,
    previewLoading,
    result,
    drafts,
    selectedArticleId,
    usage,
    view,
    setRawText,
    setTone,
    setView,
    fetchUsage,
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
  const [navigating, setNavigating] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [verificationState, setVerificationState] =
    useState<PressVerificationState | null>(null);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    hydrateFromStorage();
    reset();
    setView("input");
    void Promise.all([fetchMe(), fetchUsage()]);
  }, [fetchMe, fetchUsage, hydrateFromStorage, reset, setView]);

  const handleDevStepChange = useCallback(
    (step: Extract<PressSimplifiedDevStep, "input" | "brief" | "preview">) => {
      const baseState = {
        rawText: SAMPLE_INPUT,
        tone: "formal" as const,
        flowAlert: null,
        articleId: null,
        normalizeLoading: false,
        normalizeError: null,
        loading: false,
        previewLoading: false,
        error: null,
        usage: null,
      };

      if (step === "input") {
        usePressGeneratorStore.setState({
          ...baseState,
          brief: DEV_BRIEF,
          briefReviewed: false,
          result: null,
          drafts: [],
          selectedArticleId: null,
          view: "input",
          editorTab: "input",
        });
        return;
      }

      if (step === "brief") {
        usePressGeneratorStore.setState({
          ...baseState,
          brief: DEV_BRIEF,
          briefReviewed: true,
          result: null,
          drafts: [],
          selectedArticleId: null,
          view: "brief",
          editorTab: "brief",
        });
        return;
      }

      usePressGeneratorStore.setState({
        ...baseState,
        brief: DEV_BRIEF,
        briefReviewed: true,
        result: DEV_RESULT,
        drafts: [
          {
            articleId: "dev-preview",
            title: DEV_RESULT.title,
            createdAt: new Date().toISOString(),
          },
        ],
        selectedArticleId: null,
        view: "preview",
        editorTab: "brief",
      });
    },
    [],
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const params = new URLSearchParams(window.location.search);
    const devView = params.get("devView");
    if (
      devView !== "input" &&
      devView !== "brief" &&
      devView !== "preview"
    ) {
      return;
    }

    handleDevStepChange(devView);
    window.history.replaceState(null, "", "/press/new");
  }, [handleDevStepChange]);

  useEffect(() => {
    if (articleId && !usage) {
      void fetchUsage();
    }
  }, [articleId, fetchUsage, usage]);

  const activeStepIndex = view === "preview" ? 2 : view === "brief" ? 1 : 0;

  const previewText = useMemo(() => {
    if (!result) return "";
    return [
      result.lead,
      result.fact,
      ...(result.paragraphs ?? []).map((paragraph) => paragraph.text),
      result.closing,
    ]
      .map((text) => stripUnwanted(text ?? ""))
      .filter(Boolean)
      .join("\n\n");
  }, [result]);

  const canOpenBrief = briefReviewed || !!articleId;
  const verificationFinalizable =
    verificationState?.freshness === "CURRENT" &&
    verificationState.verification?.result !== "BLOCK";
  const monthlyRemaining = me?.usageArticleRemaining;
  const monthlyLimit = me?.usageArticleLimit;
  const monthlyUnlimited = me?.usage?.article?.unlimited === true;
  const isMonthlyLimitReached =
    !monthlyUnlimited &&
    typeof monthlyRemaining === "number" && monthlyRemaining <= 0;
  const isMonthlyLimitNear =
    typeof monthlyRemaining === "number" &&
    typeof monthlyLimit === "number" &&
    monthlyLimit >= 10 &&
    monthlyRemaining > 0 &&
    monthlyRemaining <= Math.ceil(monthlyLimit * 0.1);
  const limitNotice = isMonthlyLimitReached
    ? me?.usage?.article?.resetAt ?? me?.usagePeriodEnd
      ? `사용 한도에 도달했습니다. ${new Date(
          me?.usage?.article?.resetAt ?? me.usagePeriodEnd!,
        ).toLocaleString("ko-KR", {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })} 이후 다시 사용할 수 있습니다.`
      : "사용 한도에 도달했습니다."
    : isMonthlyLimitNear
      ? "사용 한도에 가까워졌습니다. 계속 사용하려면 플랜 업그레이드를 검토하세요."
      : null;

  const handleInsertSample = () => {
    setRawText(SAMPLE_INPUT);
    trackGaEvent("simplified_press_sample_inserted");
  };

  const handleNormalize = async () => {
    const parsed = validate(InputSchema, { rawText });
    if (!parsed.success) {
      toast.error(
        firstValidationMessage(parsed.errors) ?? "입력값을 확인해주세요.",
        undefined,
        "top-center",
      );
      return;
    }

    try {
      trackGaEvent("simplified_press_normalize_clicked", {
        tone,
        raw_length: rawText.length,
      });
      await normalizeBrief({ quotaMode: "simplified" });
      await Promise.all([fetchMe(), fetchUsage()]);
    } catch (error: any) {
      toast.error(
        error?.message ?? "메모 정리에 실패했습니다.",
        undefined,
        "top-center",
      );
    }
  };

  const handleGenerate = async () => {
    const parsed = validate(BriefSchema, brief);
    if (!parsed.success) {
      toast.error(
        firstValidationMessage(parsed.errors) ?? "정리된 내용을 확인해주세요.",
        undefined,
        "top-center",
      );
      return;
    }

    try {
      trackGaEvent("simplified_press_generate_clicked", {
        tone,
        points_count: brief.points.length,
        has_quote: !!brief.quoteMessage,
      });
      await submitGenerate({ quotaMode: "simplified" });
      await Promise.all([fetchMe(), fetchUsage()]);
    } catch (error: any) {
      toast.error(
        error?.message ?? "초안 생성에 실패했습니다.",
        undefined,
        "top-center",
      );
    }
  };

  const handleCopy = async () => {
    if (!previewText) return;
    await navigator.clipboard.writeText(previewText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleGoToEdit = async () => {
    const targetId =
      selectedArticleId ?? (result as ArticleResult | null)?.articleId ?? articleId;
    if (!targetId || navigating) return;

    setNavigating(true);
    try {
      await pressFlowApi.updateStatus(targetId, {
        status: "IN_PROGRESS",
      });
      router.push(`/press/${targetId}/edit`);
    } catch (error) {
      console.error(error);
      toast.error("수정 화면으로 이동하지 못했습니다.", undefined, "top-center");
      setNavigating(false);
    }
  };

  const handleCompleteWithoutReview = async () => {
    const targetId =
      selectedArticleId ?? (result as ArticleResult | null)?.articleId ?? articleId;
    if (!targetId || completing) return;

    setCompleting(true);
    try {
      await pressFlowApi.updateStatus(targetId, {
        status: "FINAL",
      });
      router.push(`/press/${targetId}/final`);
    } catch (error: any) {
      toast.error(
        error?.message ?? "완료 처리에 실패했습니다.",
        undefined,
        "top-center",
      );
      setCompleting(false);
    }
  };

  const handleFreshStart = async () => {
    reset();
    setView("input");
    await fetchUsage();
  };

  return (
    <div className="wongoji-sharp min-h-screen bg-background text-foreground">
      <PressSimplifiedWorkspace mainClassName="max-w-5xl">
        <header className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-[0.18em] text-primary">
              brieFFlow Press
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              새 보도자료 만들기
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              보도자료로 바꿀 내용을 적고, 정리된 사실만 확인하면 됩니다.
            </p>
          </div>
        </header>

        {limitNotice && (
          <div className="mb-5 flex flex-col gap-3 border border-ai/30 bg-ai/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="font-bold text-foreground">{limitNotice}</p>
            <Link
              href="/press/pricing"
              className="inline-flex h-9 items-center justify-center bg-ai px-3 text-xs font-bold text-ai-foreground transition hover:bg-ai/90"
            >
              플랜 보기
            </Link>
          </div>
        )}

      <nav
        className="mb-5 flex border border-border"
        aria-label="보도자료 작성 단계"
      >
        {STEPS.map((step, index) => {
          const isActive = index === activeStepIndex;
          const isDone = index < activeStepIndex;
          const isEnabled =
            index === 0 ||
            (index === 1 && canOpenBrief) ||
            (index === 2 && !!result);

          return (
            <button
              key={step.key}
              type="button"
              disabled={!isEnabled}
              onClick={() => {
                if (index === 0) setView("input");
                if (index === 1) setView("brief");
                if (index === 2) setView("preview");
              }}
              aria-current={isActive ? "step" : undefined}
              className={cx(
                "flex h-12 flex-1 items-center justify-center gap-2 border-r border-border px-3 text-sm font-bold transition-colors last:border-r-0",
                isActive &&
                  "z-10 border-primary bg-primary text-primary-foreground",
                !isActive &&
                  isDone &&
                  "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15",
                !isActive &&
                  !isDone &&
                  "bg-card text-muted-foreground enabled:hover:bg-muted",
                !isEnabled && "cursor-not-allowed opacity-50",
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-current text-[11px]">
                {isDone ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              {step.label}
            </button>
          );
        })}
      </nav>

      <section className="overflow-hidden border border-border bg-card">
        {view === "input" && (
          <div className="flex min-h-[520px] flex-col sm:min-h-[620px]">
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    핵심 메모
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    출시, 일정, 차별점, 인용구를 자유롭게 적어주세요.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleInsertSample}
                  className="inline-flex h-10 items-center justify-center gap-2 border border-border bg-card px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Lightbulb className="h-4 w-4" />
                  예시
                </button>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-xs font-bold text-muted-foreground">
                  문체 선택
                </p>
                <div className="inline-flex w-full border border-border bg-background sm:w-auto">
                  {TONE_OPTIONS.map((option, index) => (
                    <button
                      key={option.id}
                      type="button"
                      title={option.desc}
                      onClick={() => setTone(option.id)}
                      className={cx(
                        "h-10 flex-1 px-3 text-sm font-bold transition-colors sm:flex-none",
                        index > 0 && "-ml-px border-l border-border",
                        tone === option.id
                          ? "z-10 bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-1 flex-col px-4 py-4 sm:px-6">
              <label className="sr-only" htmlFor="press-source-input">
                핵심 메모
              </label>
              <div className="relative flex flex-1">
                <textarea
                  id="press-source-input"
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  className="min-h-[220px] w-full flex-1 resize-none border border-border bg-card/70 p-4 pr-20 text-base leading-7 text-foreground outline-none transition focus:border-primary sm:min-h-[380px]"
                  placeholder="예: 3월 1일 신규 서비스 출시. 출시 기념 프로모션 진행. 기존 방식보다 빠른 처리와 쉬운 사용성이 강점. 대표 코멘트..."
                />
                <span
                  className={cx(
                    "absolute bottom-3 right-4 text-xs tabular-nums",
                    rawText.length > INPUT_MAX_LENGTH
                      ? "font-bold text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {rawText.length}/{INPUT_MAX_LENGTH}
                </span>
              </div>
            </div>

            {normalizeError && (
              <div className="border-t border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:px-6">
                {normalizeError}
              </div>
            )}
          </div>
        )}

        {view === "brief" && (
          <div className="flex min-h-[620px] flex-col">
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground">
                    정리된 내용 확인
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    아래 내용으로 초안이 생성됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setView("input")}
                  className="inline-flex h-10 items-center justify-center gap-2 border border-border bg-card px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ArrowLeft className="h-4 w-4" />
                  입력 수정
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-6 px-4 py-5 sm:px-6">
              <section className="border border-border bg-card p-4">
                <h3 className="text-xs font-bold text-muted-foreground">
                  처음 입력한 메모
                </h3>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">
                  {rawText}
                </p>
              </section>

              <BriefEvidenceCandidates
                candidates={factCandidates}
                onDecision={decideFactCandidate}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    서비스/제품/행사명
                  </span>
                  <input
                    value={brief.serviceName}
                    onChange={(event) =>
                      setBriefPatch({ serviceName: event.target.value })
                    }
                    className="h-11 w-full border border-border bg-card px-3 text-sm font-bold outline-none transition focus:border-primary"
                    placeholder="예: 탄소국경조정제도 설명회"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    발표 유형
                  </span>
                  <span className="relative block">
                    <select
                      value={brief.announceType}
                      onChange={(event) =>
                        setBriefPatch({ announceType: event.target.value })
                      }
                      className="h-11 w-full appearance-none border border-border bg-card px-3 pr-9 text-sm font-bold outline-none transition focus:border-primary"
                    >
                      {ANNOUNCE_TYPES.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </span>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    행사/출시 일시
                  </span>
                  <input
                    type="datetime-local"
                    value={brief.eventAt}
                    onChange={(event) =>
                      setBriefPatch({ eventAt: event.target.value })
                    }
                    className="h-11 w-full border border-border bg-card px-3 text-sm font-bold outline-none transition focus:border-primary"
                  />
                  <span className="block text-[11px] leading-4 text-muted-foreground">
                    정확한 일시가 없으면 비워둘 수 있습니다.
                  </span>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    보도자료 게시 일시
                  </span>
                  <input
                    type="datetime-local"
                    value={brief.publishAt}
                    onChange={(event) =>
                      setBriefPatch({ publishAt: event.target.value })
                    }
                    className="h-11 w-full border border-border bg-card px-3 text-sm font-bold outline-none transition focus:border-primary"
                  />
                  <span className="block text-[11px] leading-4 text-muted-foreground">
                    연도가 없는 날짜는 자동 확정하지 않으니 직접 확인해 주세요.
                  </span>
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-bold text-muted-foreground">
                  한 줄 요약
                </span>
                <textarea
                  value={brief.oneLiner}
                  onChange={(event) =>
                    setBriefPatch({ oneLiner: event.target.value })
                  }
                  rows={3}
                  className="w-full resize-none border border-border bg-card p-3 text-sm leading-6 outline-none transition focus:border-primary"
                  placeholder="기사 첫 문단에 들어갈 핵심 문장"
                />
              </label>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-bold text-muted-foreground">
                    핵심 포인트
                  </h3>
                  <button
                    type="button"
                    onClick={addPoint}
                    className="inline-flex h-9 items-center gap-1.5 border border-border bg-card px-3 text-xs font-bold text-primary transition-colors hover:bg-primary/10"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    추가
                  </button>
                </div>

                <div className="space-y-2">
                  {brief.points.length === 0 && (
                    <button
                      type="button"
                      onClick={addPoint}
                      className="flex min-h-16 w-full items-center justify-center border border-dashed border-border text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      핵심 포인트 추가
                    </button>
                  )}

                  {brief.points.map((point, index) => (
                    <div key={index} className="flex items-start gap-2">
                      <span className="mt-3 flex h-6 w-6 shrink-0 items-center justify-center bg-muted text-xs font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                      <textarea
                        value={point}
                        onChange={(event) =>
                          changePoint(index, event.target.value)
                        }
                        rows={2}
                        className="min-h-12 flex-1 resize-y border border-border bg-card p-3 text-sm leading-6 outline-none transition focus:border-primary"
                        placeholder="강조할 사실이나 수치"
                      />
                      <button
                        type="button"
                        onClick={() => removePoint(index)}
                        className="mt-2 inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[220px_1fr]">
                <label className="space-y-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    인용자
                  </span>
                    <input
                    value={brief.quoteWho}
                    onChange={(event) =>
                      setBriefPatch({ quoteWho: event.target.value })
                    }
                    className="h-11 w-full border border-border bg-card px-3 text-sm font-bold outline-none transition focus:border-primary"
                    placeholder="예: 김민준 대표"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold text-muted-foreground">
                    인용구
                  </span>
                  <textarea
                    value={brief.quoteMessage}
                    onChange={(event) =>
                      setBriefPatch({ quoteMessage: event.target.value })
                    }
                    rows={2}
                    className="w-full resize-none border border-border bg-card p-3 text-sm leading-6 outline-none transition focus:border-primary"
                    placeholder={'"고객이 더 빠르게 성과를 내도록 돕겠습니다."'}
                  />
                </label>
              </div>
            </div>

            <div className="border-t border-border bg-background/40 px-4 py-4 sm:px-6">
              <p className="text-sm text-muted-foreground">
                초안 생성 후 편집 화면에서 AI 첨삭을 이어갑니다.
              </p>
            </div>
          </div>
        )}

        {view === "preview" && (
          <div className="flex min-h-[620px] flex-col">
            <div className="border-b border-border px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-success/30 bg-success/10 text-success">
                    <Check className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      초안 생성 완료
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      바로 완료하거나 AI 첨삭으로 더 다듬을 수 있습니다.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setView("brief")}
                    className="inline-flex h-10 items-center justify-center gap-2 border border-border bg-card px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    내용 수정
                  </button>
                  <button
                    type="button"
                    onClick={handleFreshStart}
                    className="inline-flex h-10 items-center justify-center gap-2 border border-border bg-card px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <RefreshCw className="h-4 w-4" />
                    새로 시작
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!previewText}
                    className="inline-flex h-10 items-center justify-center gap-2 border border-border bg-card px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {copied ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? "복사됨" : "복사"}
                  </button>
                </div>
              </div>
            </div>

            {drafts.length > 1 && (
              <div className="border-b border-border bg-background/40 px-4 py-3 sm:px-6">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {drafts.map((draft) => (
                    <button
                      key={draft.articleId}
                      type="button"
                      onClick={() => void selectDraft(draft.articleId)}
                      className={cx(
                        "inline-flex min-w-40 items-center gap-2 border px-3 py-2 text-left text-xs font-bold transition-colors",
                        draft.articleId === selectedArticleId
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {draft.title || "제목 없음"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex-1 bg-background/60 px-4 py-5 sm:px-6">
              {previewLoading ? (
                <div className="flex min-h-[420px] items-center justify-center gap-2 text-sm font-semibold text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  불러오는 중
                </div>
              ) : result ? (
                <article className="mx-auto max-w-3xl border border-border bg-card p-6 text-foreground sm:p-8">
                  <h1 className="border-b border-foreground pb-5 text-2xl font-extrabold leading-tight tracking-tight">
                    {result.title || "제목 없음"}
                  </h1>
                  <div className="mt-6 space-y-5 text-[15px] leading-8">
                    {previewText.split("\n\n").map((paragraph, index) => (
                      <p
                        key={`${paragraph.slice(0, 24)}-${index}`}
                        className={index === 0 ? "font-bold text-foreground" : "text-muted-foreground"}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </article>
              ) : (
                <div className="flex min-h-[420px] items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
                  생성된 초안이 없습니다.
                </div>
              )}
            </div>

            {result?.articleId && result.articleId !== "dev-preview" ? (
              <div className="border-t border-border bg-background/60 px-4 py-5 sm:px-6">
                <PressVerificationPanel
                  articleId={result.articleId}
                  onStateChange={setVerificationState}
                />
              </div>
            ) : null}

            <div className="border-t border-border bg-background/40 px-4 py-4 text-sm text-muted-foreground sm:px-6">
              최종 원고 검증을 통과하면 바로 완료할 수 있습니다. 더 다듬으려면
              AI 첨삭으로 이어갑니다.
            </div>
          </div>
        )}
      </section>
      </PressSimplifiedWorkspace>

      <PressSimplifiedBottomBar contentClassName="max-w-5xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">
              {view === "input" && "메모를 정리해 다음 단계로 이동하세요."}
              {view === "brief" && "정리된 내용을 확인하고 초안을 만드세요."}
              {view === "preview" && "초안을 확인한 뒤 첨삭으로 이어가세요."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {limitNotice ??
                (view === "input"
                  ? "최소 30자 이상 입력하면 진행할 수 있습니다."
                  : view === "brief"
                    ? "필수 항목이 비어 있으면 생성 전에 알려드립니다."
                    : "첨삭 없이 바로 완료할 수도 있습니다.")}
            </p>
          </div>

          {view === "input" && (
            <LoadingButton
              type="button"
              onClick={handleNormalize}
              loading={normalizeLoading}
              loadingText="정리 중"
              disabled={isMonthlyLimitReached}
              className="h-11 w-full bg-ai px-5 text-sm font-bold text-ai-foreground transition hover:bg-ai/90 sm:w-auto"
            >
              메모 정리하기
              <ArrowRight className="h-4 w-4" />
            </LoadingButton>
          )}

          {view === "brief" && (
            <LoadingButton
              type="button"
              onClick={handleGenerate}
              loading={loading}
              loadingText="생성 중"
              disabled={isMonthlyLimitReached}
              className="h-11 w-full bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 sm:w-auto"
            >
              초안 만들기
              <Sparkles className="h-4 w-4" />
            </LoadingButton>
          )}

          {view === "preview" && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <LoadingButton
                type="button"
                onClick={handleCompleteWithoutReview}
                loading={completing}
                loadingText="완료 중"
                disabled={
                  !result?.articleId || navigating || !verificationFinalizable
                }
                className="h-11 bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
              >
                이대로 완료
                <Check className="h-4 w-4" />
              </LoadingButton>
              <LoadingButton
                type="button"
                onClick={handleGoToEdit}
                loading={navigating}
                loadingText="이동 중"
                disabled={!result?.articleId || completing}
                className="h-11 bg-ai px-5 text-sm font-bold text-ai-foreground transition hover:bg-ai/90"
              >
                AI 첨삭으로 이동
                <ArrowRight className="h-4 w-4" />
              </LoadingButton>
            </div>
          )}
        </div>
      </PressSimplifiedBottomBar>
      <PressSimplifiedDevSwitcher
        current={view}
        onSelectCreateStep={handleDevStepChange}
      />
    </div>
  );
}
