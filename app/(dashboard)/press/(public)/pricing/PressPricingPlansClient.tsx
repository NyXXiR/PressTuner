"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { trackGaEvent } from "@/lib/analytics/ga4";
import { useMeStore } from "@/stores/useMeStore";

export type PressUiPlan = {
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

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function numericPrice(plan: PressUiPlan) {
  if (plan.isFree) return 0;
  return Number.parseInt(plan.price.replace(/[^0-9]/g, ""), 10) || 0;
}

export default function PressPricingPlansClient({
  plans,
  basePath = "/press/pricing",
}: {
  plans: PressUiPlan[];
  basePath?: string;
}) {
  const router = useRouter();
  const { checked, me, authStatus, fetchMe } = useMeStore();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [trialMessage, setTrialMessage] = useState<string | null>(null);
  const [trialError, setTrialError] = useState<string | null>(null);
  const [trialLoading, setTrialLoading] = useState(false);

  const visiblePlans = useMemo(() => {
    return plans
      .filter((p) => p.isFree || p.category === "PRESS")
      .sort((a, b) => numericPrice(a) - numericPrice(b));
  }, [plans]);

  const isAdminRole = (role?: string | null) => role === "OWNER" || role === "ADMIN";
  const isSuperAdmin = me?.isSuperAdmin === true;
  const requiresLogin = !checked || authStatus !== "authed" || !me?.userId;

  const handleCheckout = (plan: PressUiPlan) => {
    if (requiresLogin) {
      router.push(`/login?next=${encodeURIComponent(basePath)}`);
      return;
    }

    setLoadingId(plan.id);
    trackGaEvent("pricing_plan_selected", {
      plan_id: plan.id,
      plan_category: plan.category,
      is_free: plan.isFree,
      cta_label: plan.cta?.label ?? null,
      base_path: basePath,
    });
    router.push(plan.cta?.href ?? `/billing/checkout?plan=${encodeURIComponent(plan.id)}`);
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
        source: "press_pricing_page",
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
    if (requiresLogin) {
      router.push(`/login?next=${encodeURIComponent(basePath)}`);
      return;
    }

    setTrialLoading(true);
    setTrialMessage(null);
    setTrialError(null);

    try {
      const res = await fetch("/api/billing/trial/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface: "PRESS" }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setTrialError(json?.code ?? json?.message ?? "TRIAL_CLAIM_FAILED");
        return;
      }

      setTrialMessage("Press Pro 1개월 체험이 시작되었습니다.");
      trackGaEvent("trial_claimed", {
        source: "press_pricing_page",
        surface: "PRESS",
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
        return couponError;
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
    <div className="wongoji-sharp space-y-6">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {visiblePlans.map((plan) => {
          const isLoading = loadingId === plan.id;
          const isHighlighted = plan.badge === "Popular";
          const isDiscounted = Boolean(plan.originalPrice) && plan.price !== plan.originalPrice;

          return (
            <article
              key={plan.id}
              className={cx(
                "flex min-w-0 flex-col border bg-card p-5",
                isHighlighted ? "border-primary/50 ring-1 ring-primary/20" : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-foreground">
                    {plan.name}
                  </h2>
                  <p className="mt-1 min-h-10 text-sm leading-relaxed text-muted-foreground">
                    {plan.blurb}
                  </p>
                </div>
                {plan.badge ? (
                  <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {plan.badge}
                  </span>
                ) : null}
              </div>

              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-foreground">
                  {plan.price}
                </span>
                {!plan.isFree && <span className="text-sm text-muted-foreground">/월</span>}
                {isDiscounted ? (
                  <span className="text-xs text-muted-foreground line-through">
                    {plan.originalPrice}
                  </span>
                ) : null}
              </div>

              <div className="mt-5 flex-1 space-y-3 border-t border-border pt-4">
                <div className="flex items-start gap-2 text-sm font-semibold text-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{plan.quotaMain}</span>
                </div>
                {plan.quotaSub ? (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{plan.quotaSub}</span>
                  </div>
                ) : null}
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>{plan.isFree ? "기능 체험에 적합" : "언제든 해지/변경 가능"}</span>
                </div>
              </div>

              <div className="mt-5">
                {plan.cta ? (
                  <button
                    type="button"
                    disabled={plan.cta.disabled || isLoading}
                    onClick={() => !plan.cta?.disabled && handleCheckout(plan)}
                    className={cx(
                      "inline-flex h-10 w-full items-center justify-center gap-2 text-sm font-bold transition-colors",
                      isHighlighted
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-foreground text-background hover:bg-foreground/90",
                      (plan.cta.disabled || isLoading) && "cursor-not-allowed opacity-60",
                    )}
                  >
                    {isLoading ? "처리 중..." : plan.cta.label}
                    {!isLoading && <ArrowRight className="h-4 w-4" />}
                  </button>
                ) : (
                  <div className="flex h-10 items-center justify-center border border-border bg-muted/40 text-sm font-semibold text-muted-foreground">
                    현재 기본 제공 중
                  </div>
                )}
                {plan.promotionLabel ? (
                  <p className="mt-2 text-center text-xs font-semibold text-primary">
                    {plan.promotionLabel}
                  </p>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <section className="border border-border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Press Pro 1개월 체험</h2>
            <p className="text-sm text-muted-foreground">
              Free 상태에서 직접 신청하면 1회에 한해 자동 갱신 없이 Pro 체험이 시작됩니다.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClaimTrial}
            disabled={trialLoading || (!requiresLogin && !(isAdminRole(me?.userRole ?? null) || isSuperAdmin))}
            className={cx(
              "inline-flex h-9 items-center justify-center bg-foreground px-4 text-sm font-bold text-background transition-opacity",
              (trialLoading || (!requiresLogin && !(isAdminRole(me?.userRole ?? null) || isSuperAdmin))) &&
                "cursor-not-allowed opacity-50",
            )}
          >
            {trialLoading ? "시작 중..." : requiresLogin ? "로그인" : "체험 시작"}
          </button>
        </div>
        {trialErrorText ? (
          <p className="mt-2 text-xs text-red-500">{trialErrorText}</p>
        ) : null}
        {trialMessage ? (
          <p className="mt-2 text-xs text-green-600">{trialMessage}</p>
        ) : null}
      </section>

      <section className="border border-border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">이용권 쿠폰 적용</h2>
            <p className="text-sm text-muted-foreground">
              플랜 이용권을 받은 경우 이곳에서 적용합니다.
            </p>
          </div>

          {requiresLogin ? (
            <button
              type="button"
              onClick={() => router.push(`/login?next=${encodeURIComponent(basePath)}`)}
              className="inline-flex h-9 items-center justify-center bg-foreground px-4 text-sm font-bold text-background"
            >
              로그인
            </button>
          ) : !(isAdminRole(me?.userRole ?? null) || isSuperAdmin) ? (
            <p className="text-sm text-muted-foreground">
              관리자 권한이 있는 계정만 이용권을 적용할 수 있습니다.
            </p>
          ) : (
            <div className="flex min-w-0 flex-col gap-2 sm:min-w-[420px] sm:flex-row">
              <input
                value={couponCode}
                onChange={(event) => setCouponCode(event.target.value)}
                placeholder="이용권 코드 입력"
                className="h-9 flex-1 border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/30"
                disabled={couponLoading}
              />
              <button
                type="button"
                onClick={handleRedeemCoupon}
                disabled={!couponCode.trim() || couponLoading}
                className={cx(
                  "h-9 bg-primary px-4 text-sm font-bold text-primary-foreground",
                  (!couponCode.trim() || couponLoading) && "cursor-not-allowed opacity-50",
                )}
              >
                {couponLoading ? "적용 중..." : "이용권 적용"}
              </button>
            </div>
          )}
        </div>
        {couponErrorText ? (
          <p className="mt-2 text-xs text-red-500">{couponErrorText}</p>
        ) : null}
        {couponMessage ? (
          <p className="mt-2 text-xs text-green-600">{couponMessage}</p>
        ) : null}
      </section>
    </div>
  );
}
