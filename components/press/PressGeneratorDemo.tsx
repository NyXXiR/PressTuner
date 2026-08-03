"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Lightbulb,
  Lock,
  Sparkles,
} from "lucide-react";
import {
  PressDemoBrief,
  PressDemoTone,
  savePressDemoDraft,
} from "@/lib/pressDemoDraft";
import { trackGaEvent } from "@/lib/analytics/ga4";

const INPUT_MIN_LEN = 30;
const SAMPLE_TEXT = `3월 1일 신규 예금 상품 '아이디어존' 출시.
출시 기념으로 3개월간 우대 금리 2% 제공.
기존 금융 앱보다 직관적인 UI와 간편한 가입 절차 강조.
대표 코멘트: "금융을 더 쉽고 가깝게 만들겠습니다."`;

const TONE_OPTIONS: Array<{
  id: PressDemoTone;
  label: string;
  desc: string;
}> = [
  { id: "formal", label: "공식 톤", desc: "정중하고 격식 있는 문체" },
  { id: "neutral", label: "중립 톤", desc: "균형 잡힌 담백한 톤" },
  { id: "friendly", label: "친근 톤", desc: "부드럽고 캐주얼한 톤" },
];

const emptyBrief: PressDemoBrief = {
  serviceName: "",
  announceType: "",
  oneLiner: "",
  points: [],
  quoteWho: "",
  quoteMessage: "",
  eventAt: "",
  publishAt: "",
};

export function PressGeneratorDemo() {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [tone, setTone] = useState<PressDemoTone>("formal");
  const [brief, setBrief] = useState<PressDemoBrief>(emptyBrief);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<string | null>(null);
  const [hasResult, setHasResult] = useState(false);
  const [demoStarted, setDemoStarted] = useState(false);

  const canGenerate = rawText.trim().length >= INPUT_MIN_LEN && !loading;

  const charCount = rawText.length;

  const handleGenerate = async () => {
    if (!canGenerate) {
      setError(`최소 ${INPUT_MIN_LEN}자 이상 입력해 주세요.`);
      return;
    }

    setLoading(true);
    setError(null);
    setRateLimit(null);
    try {
      const res = await fetch("/api/brief/normalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText, tone }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data) {
        if (res.status === 429 || data?.code === "RATE_LIMIT") {
          setRateLimit(
            data?.message ?? data?.error ??
              "오늘 체험 가능한 브리프를 모두 사용했어요. 로그인하면 계속 만들 수 있어요.",
          );
          trackGaEvent("demo_rate_limited", {
            limit_type: "ip_daily",
            tone,
            content_length: rawText.length,
          });
          return;
        }
        throw new Error(
          data?.message ?? data?.error ??
            "브리프 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }

      setBrief({
        serviceName: data.serviceName ?? "",
        announceType: data.announceType ?? "",
        oneLiner: data.oneLiner ?? "",
        points: Array.isArray(data.points) ? data.points : [],
        quoteWho: data.quoteWho ?? "",
        quoteMessage: data.quoteMessage ?? "",
        eventAt: data.eventAt ?? "",
        publishAt: data.publishAt ?? "",
      });
      setHasResult(true);
      trackGaEvent("demo_brief_generated", {
        tone,
        points_count: Array.isArray(data.points) ? data.points.length : 0,
        has_quote: !!data.quoteMessage,
      });
    } catch (err: any) {
      setError(err?.message ?? "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = (
    view: "input" | "brief" = "brief",
    ctaVariant: "result_card" | "rate_limit_card" = "result_card",
  ) => {
    const draftBrief = view === "input" ? emptyBrief : brief;
    savePressDemoDraft({
      rawText,
      tone,
      brief: draftBrief,
      createdAt: new Date().toISOString(),
      view,
    });
    trackGaEvent("cta_login_from_demo", { cta_variant: ctaVariant });
    router.push(`/login?next=${encodeURIComponent("/press/new")}`);
  };

  return (
    <section id="demo" className="py-16 border-t border-border/50 scroll-mt-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <p className="text-[10px] uppercase tracking-[0.2em] text-primary font-bold mb-2">
            DEMO
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            보도자료 샘플 초안을 위한 브리프를 바로 만들어보세요
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            메모를 30자 이상 입력하면 브리프를 바로 만들어볼 수 있습니다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6">
            <div className="pt-surface border border-border/60 bg-card/40 backdrop-blur-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  원문 입력
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRawText(SAMPLE_TEXT);
                    setError(null);
                    setRateLimit(null);
                    if (!demoStarted) {
                      setDemoStarted(true);
                      trackGaEvent("demo_brief_started", {
                        content_length: SAMPLE_TEXT.length,
                        tone,
                      });
                    }
                  }}
                  className="text-xs font-semibold text-primary hover:bg-primary/10 px-2 py-1 transition-colors flex items-center gap-1.5"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  예시 넣기
                </button>
              </div>

              <div className="relative">
                <textarea
                  value={rawText}
                  onChange={(e) => {
                    setRawText(e.target.value);
                    if (error && e.target.value.length >= INPUT_MIN_LEN) {
                      setError(null);
                    }
                    if (rateLimit) setRateLimit(null);
                    if (!demoStarted && e.target.value.trim().length > 0) {
                      setDemoStarted(true);
                      trackGaEvent("demo_brief_started", {
                        content_length: e.target.value.length,
                        tone,
                      });
                    }
                  }}
                  rows={10}
                  placeholder="대충 적은 원문도 괜찮아요. 핵심 사실만 적어보세요."
                  className="w-full min-h-[220px] bg-transparent border border-border/50 p-4 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                />
                <span className="absolute bottom-3 right-4 text-[10px] font-mono text-muted-foreground/60">
                  {charCount} / 3000
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <p id="demo-input-requirement" className="text-muted-foreground">
                  최소 <span className="font-bold text-foreground">{INPUT_MIN_LEN}자</span> 이상 입력하면 브리프를 만들 수 있어요.
                </p>
                {charCount < INPUT_MIN_LEN ? (
                  <span className="font-medium text-amber-600">
                    {INPUT_MIN_LEN - charCount}자 더 필요
                  </span>
                ) : (
                  <span className="font-medium text-emerald-600">생성 가능</span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {TONE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setTone(opt.id)}
                    className={`px-3 py-1.5 text-xs font-semibold border transition-all ${
                      tone === opt.id
                        ? "bg-primary/10 border-primary text-primary"
                        : "bg-background/60 border-transparent text-muted-foreground hover:bg-muted"
                    }`}
                    title={opt.desc}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className={`ml-auto inline-flex items-center gap-2 px-4 py-2 text-sm font-bold transition-all ${
                    canGenerate
                      ? "bg-primary text-primary-foreground hover:scale-[1.02]"
                      : "bg-muted text-muted-foreground cursor-not-allowed shadow-none"
                  }`}
                  aria-describedby="demo-input-requirement"
                >
                  {loading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <ArrowRight className="w-4 h-4" />
                  )}
                  브리프 만들기
                </button>
              </div>

              {error && (
                <div className="mt-3 text-xs text-red-600 bg-red-500/10 border border-red-500/20 px-3 py-2">
                  {error}
                </div>
              )}

              {rateLimit && (
                <div className="mt-3 border border-amber-200/60 bg-amber-50/60 p-4 text-amber-900/90">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center">
                      <Lock className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold">
                        오늘 체험 가능한 브리프를 모두 사용했어요
                      </p>
                      <p className="mt-1 text-xs text-amber-800/80">
                        로그인하면 제한 없이 브리프를 만들고, 초안 생성까지 바로
                        이어집니다.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleContinue(
                              hasResult ? "brief" : "input",
                              "rate_limit_card",
                            )
                          }
                          className="inline-flex items-center gap-2 bg-amber-600 px-4 py-2 text-xs font-bold text-white hover:bg-amber-500"
                        >
                          로그인하고 계속하기
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                        {hasResult && (
                          <span className="self-center text-[11px] text-amber-700/80">
                            현재 브리프는 로그인 후 그대로 이어집니다.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="pt-surface border border-border/60 bg-card/40 backdrop-blur-sm p-5 h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-500" />
                  브리프 결과
                </span>
                <button
                  type="button"
                  onClick={() => handleContinue("brief", "result_card")}
                  disabled={!hasResult}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold transition-all ${
                    hasResult
                      ? "bg-foreground text-background hover:opacity-90"
                      : "bg-muted text-muted-foreground cursor-not-allowed"
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  로그인하고 초안 생성
                </button>
              </div>

              {!hasResult ? (
                <div className="flex-1 border border-dashed border-border/60 p-6 text-center text-muted-foreground/70 text-sm flex flex-col items-center justify-center gap-3">
                  <Sparkles className="w-8 h-8 opacity-30" />
                  브리프가 이곳에 표시됩니다.
                </div>
              ) : (
                <div className="space-y-4 text-sm text-foreground flex-1">
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      서비스 / 제품
                    </p>
                    <p className="mt-1 font-semibold">
                      {brief.serviceName || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      발표 유형
                    </p>
                    <p className="mt-1 font-semibold">
                      {brief.announceType || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      한 줄 요약
                    </p>
                    <p className="mt-1">{brief.oneLiner || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      핵심 포인트
                    </p>
                    <ul className="mt-2 space-y-1 text-muted-foreground">
                      {brief.points?.length ? (
                        brief.points.slice(0, 4).map((p, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="text-primary font-bold">
                              {idx + 1}
                            </span>
                            <span className="flex-1">{p}</span>
                          </li>
                        ))
                      ) : (
                        <li>—</li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {hasResult && (
                <div className="mt-5 border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" />
                    초안 생성까지 1분이면 끝나요
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    로그인하면 지금 만든 브리프가 자동 저장되고, 초안 생성
                    버튼만 누르면 바로 완성됩니다.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleContinue("brief", "result_card")}
                      className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90"
                    >
                      로그인하고 초안 바로 만들기
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[11px] text-muted-foreground">
                      현재 브리프가 그대로 이어집니다.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
