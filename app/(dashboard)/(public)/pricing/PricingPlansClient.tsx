"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMeStore } from "@/stores/useMeStore";
import { trackGaEvent } from "@/lib/analytics/ga4";
import clsx from "clsx";
import { Check, Sparkles, X } from "lucide-react";

type UiPlan = {
  id: string;
  name: string;
  category: string;
  price: string;
  originalPrice: string;
  quotaMain: string;
  quotaSub?: string;
  blurb: string;
  cta: { label: string; href: string; disabled?: boolean } | null;
  badge?: string;
  promotionLabel?: string;
  isFree: boolean;
};

type PricingTabId = "PRESS" | "CAREER";

const TABS = [
  { id: "PRESS", label: "기업 홍보" },
  { id: "CAREER", label: "취업 / 이직" },
] satisfies Array<{ id: PricingTabId; label: string }>;

function isPricingTabId(value: string | null): value is PricingTabId {
  return TABS.some((tab) => tab.id === value);
}

export default function PricingPlansClient({
  plans,
  basePath = "/pricing",
  defaultTab = "PRESS",
}: {
  plans: UiPlan[];
  basePath?: string;
  defaultTab?: PricingTabId;
}) {
  const router = useRouter();
  const { checked, me, fetchMe } = useMeStore();
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [trialMessage, setTrialMessage] = useState<string | null>(null);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);

  // 🟢 [추가] 초기 탭 설정 로직
  // URL의 ?tab=... 파라미터를 확인하고, 유효한 탭이면 그 값을 초기값으로 사용
  // 없다면 "PRESS"를 기본값으로 사용
  const [activeTab, setActiveTab] = useState<PricingTabId>(defaultTab);

  // URL 파라미터 기반 초기 탭 설정 (CSR 이후에만 적용)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get("tab");
    if (isPricingTabId(initialTab)) {
      setActiveTab(initialTab);
    } else {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const isAdminRole = (role?: string | null) =>
    role === "OWNER" || role === "ADMIN";
  const isSuperAdmin = me?.isSuperAdmin === true;
  const trialSurface = activeTab === "PRESS" ? "PRESS" : "RESUME";

  // 🟢 [추가] 탭 변경 핸들러
  // 탭을 바꿀 때 URL도 같이 바꿔줘서 새로고침해도 유지되게 함
  const handleTabChange = (tabId: PricingTabId) => {
    setActiveTab(tabId);
    trackGaEvent("pricing_tab_changed", {
      pricing_tab: tabId,
      base_path: basePath,
    });

    // 현재 파라미터 복사 후 tab만 업데이트
    if (typeof window === "undefined") return;
    const newParams = new URLSearchParams(window.location.search);
    newParams.set("tab", tabId);

    // 페이지 이동 없이 URL만 업데이트 (scroll: false로 스크롤 튐 방지)
    router.replace(`?${newParams.toString()}`, { scroll: false });
  };

  const visiblePlans = useMemo(() => {
    const filtered = plans.filter((p) => p.isFree || p.category === activeTab);
    return filtered.sort((a, b) => {
      const priceA = a.isFree
        ? 0
        : parseInt(a.price.replace(/[^0-9]/g, ""), 10);
      const priceB = b.isFree
        ? 0
        : parseInt(b.price.replace(/[^0-9]/g, ""), 10);
      return priceA - priceB;
    });
  }, [plans, activeTab]);

  const handleCheckout = (plan: UiPlan) => {
    if (!checked) return;
    setLoadingId(plan.id);
    trackGaEvent("pricing_plan_selected", {
      plan_id: plan.id,
      plan_category: plan.category,
      is_free: plan.isFree,
      cta_label: plan.cta?.label ?? null,
      base_path: basePath,
    });
    router.push(plan.cta?.href ?? "/pricing");
  };

  const handleRedeemCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponMessage(null);
    setCouponError(null);

    try {
      const res = await fetch("/api/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: couponCode }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setCouponError(json?.message ?? json?.error ?? "쿠폰 적용에 실패했습니다.");
        return;
      }

      setCouponMessage("이용권이 적용되었습니다. 플랜이 갱신되었어요!");
      trackGaEvent("coupon_redeemed", {
        source: "pricing_page",
        base_path: basePath,
      });
      setCouponCode("");
      await fetchMe();
      router.refresh();
    } catch {
      setCouponError("쿠폰 적용에 실패했습니다.");
    } finally {
      setCouponLoading(false);
    }
  };

  const handleClaimTrial = async () => {
    if (!checked) {
      router.push(`/login?next=${basePath}`);
      return;
    }
    if (!trialSurface) return;

    setTrialLoading(true);
    setTrialMessage(null);
    setTrialError(null);

    try {
      const res = await fetch("/api/billing/trial/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface: trialSurface }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setTrialError(json?.code ?? json?.message ?? "TRIAL_CLAIM_FAILED");
        return;
      }

      setTrialMessage(
        trialSurface === "PRESS"
          ? "Press Pro 1개월 체험이 시작되었습니다."
          : "Career Pro 1개월 체험이 시작되었습니다.",
      );
      trackGaEvent("trial_claimed", {
        source: "pricing_page",
        surface: trialSurface,
        base_path: basePath,
      });
      await fetchMe();
      router.refresh();
    } catch {
      setTrialError("TRIAL_CLAIM_FAILED");
    } finally {
      setTrialLoading(false);
    }
  };

  const couponErrorText = useMemo(() => {
    if (!couponError) return null;
    switch (couponError) {
      case "COUPON_CODE_REQUIRED":
        return "쿠폰 코드를 입력해 주세요.";
      case "COUPON_NOT_FOUND":
        return "쿠폰을 찾을 수 없습니다.";
      case "COUPON_INACTIVE":
        return "사용할 수 없는 쿠폰입니다.";
      case "COUPON_EXPIRED":
        return "만료된 쿠폰입니다.";
      case "COUPON_EXHAUSTED":
        return "쿠폰이 모두 소진되었습니다.";
      case "COUPON_USER_LIMIT":
        return "이미 사용한 쿠폰입니다.";
      case "COUPON_NOT_PLAN_GRANT":
        return "이 쿠폰은 결제 할인 전용입니다. 결제 화면에서 적용하세요.";
      case "COUPON_PLAN_NOT_FOUND":
        return "쿠폰에 연결된 플랜이 없습니다.";
      case "COUPON_INVALID_GRANT":
        return "이용권 설정이 올바르지 않습니다.";
      default:
        return "쿠폰을 적용할 수 없습니다.";
    }
  }, [couponError]);

  const trialErrorText = useMemo(() => {
    if (!trialError) return null;
    switch (trialError) {
      case "TRIAL_ALREADY_CLAIMED":
        return "이미 체험 플랜을 사용했습니다.";
      case "TRIAL_ACTIVE_PLAN_EXISTS":
        return "이미 활성화된 유료 플랜이 있습니다.";
      case "FORBIDDEN":
        return "관리자 권한이 있는 계정만 체험을 시작할 수 있습니다.";
      default:
        return "체험 플랜을 시작할 수 없습니다.";
    }
  }, [trialError]);

  return (
    <div>
      {/* 탭 컨트롤 */}
      <div className="flex justify-center mb-16">
        <div className="inline-flex p-1.5 bg-secondary/40 border border-border/50">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)} // 🟢 [변경]
              className={clsx(
                "px-6 py-2.5 text-sm font-bold transition-all duration-300",
                activeTab === tab.id
                  ? "bg-background text-foreground ring-1 ring-black/5 dark:ring-white/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-6 lg:gap-8 items-stretch pt-12">
        {visiblePlans.map((p) => {
          const isPopular = p.badge === "Popular" || p.badge === "Best Value";
          const isDiscounted = p.price !== p.originalPrice;
          const isLoading = loadingId === p.id;

          return (
            <div
              key={p.id}
              className={clsx(
                "relative flex flex-col p-8 transition-all duration-300 w-full md:w-[calc(50%-1rem)] xl:w-[calc(33.333%-1.5rem)] min-w-[300px] max-w-[400px]",
                "pt-overflow-visible", // globals.css에서 강제 overflow 설정
                p.isFree
                  ? "bg-transparent border-2 border-dashed border-border/60 hover:border-border hover:bg-secondary/10"
                  : "bg-card border border-border hover:-translate-y-1",

                isPopular &&
                  "ring-2 ring-primary border-transparent",
              )}
            >
              {/* 배지 */}
              {p.badge && (
                <div className="absolute -top-4 right-6 z-20">
                  <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-primary text-primary-foreground whitespace-nowrap ring-4 ring-background">
                    {p.badge === "Best Value" && (
                      <Sparkles className="w-3 h-3 fill-current" />
                    )}
                    {p.badge}
                  </span>
                </div>
              )}

              {/* 헤더 */}
              <div className="mb-6">
                <h3
                  className={clsx(
                    "text-lg font-bold",
                    p.isFree ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {p.name}
                </h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed min-h-[40px]">
                  {p.blurb}
                </p>
              </div>

              {/* 가격 */}
              <div className="mb-8 flex items-baseline gap-1">
                <span
                  className={clsx(
                    "text-4xl font-extrabold tracking-tight",
                    p.isFree ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {p.price}
                </span>
                {!p.isFree && (
                  <span className="text-sm font-medium text-muted-foreground">
                    / 월
                  </span>
                )}

                {isDiscounted && !p.isFree && (
                  <span className="ml-2 text-sm text-muted-foreground line-through decoration-slate-500/50">
                    {p.originalPrice}
                  </span>
                )}
              </div>

              {/* 혜택 리스트 */}
              <div className="space-y-4 flex-1 mb-8">
                <div className="flex items-start gap-3">
                  <div
                    className={clsx(
                      "mt-0.5 p-1 rounded-full shrink-0",
                      p.isFree
                        ? "bg-secondary text-muted-foreground"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  </div>
                  <span
                    className={clsx(
                      "text-sm font-bold",
                      p.isFree ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {p.quotaMain}
                  </span>
                </div>

                {p.quotaSub && (
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-1 rounded-full shrink-0 bg-secondary text-muted-foreground/50">
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {p.quotaSub}
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-3 opacity-60">
                  <div className="mt-0.5 p-1 rounded-full shrink-0 bg-secondary text-muted-foreground/50">
                    {p.isFree ? (
                      <X className="w-3.5 h-3.5" />
                    ) : (
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {p.isFree ? "고급 기능 제한됨" : "언제든 해지/변경 가능"}
                  </span>
                </div>
              </div>

              {/* 하단 액션 */}
              <div className="mt-auto">
                {p.cta ? (
                  <button
                    disabled={p.cta.disabled || isLoading}
                    onClick={() => !p.cta!.disabled && handleCheckout(p)}
                    className={clsx(
                      "w-full py-3.5 font-bold text-sm transition-all flex items-center justify-center",
                      p.cta.disabled
                        ? "bg-secondary text-muted-foreground cursor-not-allowed"
                        : isPopular
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:-translate-y-0.5"
                          : "bg-foreground text-background hover:bg-foreground/90 hover:-translate-y-0.5",
                      isLoading && "opacity-70",
                    )}
                  >
                    {isLoading ? "처리 중..." : p.cta.label}
                  </button>
                ) : (
                  <div className="w-full py-3.5 border border-border/50 bg-secondary/30 text-center text-sm font-medium text-muted-foreground cursor-default select-none">
                    현재 기본 제공 중
                  </div>
                )}

                {p.promotionLabel && (
                  <div className="mt-3 text-center">
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-900/30 px-2 py-1">
                      {p.promotionLabel}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {trialSurface ? (
        <section className="mt-16 max-w-2xl mx-auto border border-border bg-card p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-bold">
                {trialSurface === "PRESS" ? "Press Pro" : "Career Pro"} 1개월 체험
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Free 상태에서 직접 신청하면 1회에 한해 자동 갱신 없이 Pro 체험이 시작됩니다.
              </p>
            </div>
            <button
              type="button"
              onClick={handleClaimTrial}
              disabled={
                trialLoading ||
                (checked && !(isAdminRole(me?.userRole ?? null) || isSuperAdmin))
              }
              className={clsx(
                " bg-foreground px-4 py-2 text-sm font-semibold text-background",
                (trialLoading ||
                  (checked && !(isAdminRole(me?.userRole ?? null) || isSuperAdmin))) &&
                  "cursor-not-allowed opacity-50",
              )}
            >
              {trialLoading ? "시작 중..." : checked ? "체험 시작" : "로그인"}
            </button>
          </div>
          {trialErrorText ? (
            <div className="mt-2 text-xs text-red-500">{trialErrorText}</div>
          ) : null}
          {trialMessage ? (
            <div className="mt-2 text-xs text-green-600">{trialMessage}</div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-16 max-w-2xl mx-auto border border-border bg-card p-6">
        <h3 className="text-lg font-bold">이용권 쿠폰 적용</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          1개월 PRO 이용권 등 플랜 이용권은 여기에서 적용하세요.
        </p>

        {!checked ? (
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              이용권을 적용하려면 로그인이 필요합니다.
            </span>
            <button
              type="button"
              onClick={() => router.push(`/login?next=${basePath}`)}
              className="bg-foreground px-4 py-2 text-sm font-semibold text-background"
            >
              로그인
            </button>
          </div>
        ) : !(isAdminRole(me?.userRole ?? null) || isSuperAdmin) ? (
          <div className="mt-4 text-sm text-muted-foreground">
            관리자 권한이 있는 계정만 이용권을 적용할 수 있습니다.
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="이용권 코드 입력"
                className="flex-1 border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
                disabled={couponLoading}
              />
              <button
                type="button"
                onClick={handleRedeemCoupon}
                disabled={!couponCode.trim() || couponLoading}
                className={clsx(
                  " px-4 py-2 text-sm font-semibold",
                  "bg-primary text-primary-foreground hover:opacity-90",
                  (!couponCode.trim() || couponLoading) &&
                    "opacity-50 cursor-not-allowed",
                )}
              >
                {couponLoading ? "적용 중..." : "이용권 적용"}
              </button>
            </div>
            {couponErrorText && (
              <div className="mt-2 text-xs text-red-500">{couponErrorText}</div>
            )}
            {couponMessage && (
              <div className="mt-2 text-xs text-green-600">{couponMessage}</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
