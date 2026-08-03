"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  Copy,
  CreditCard,
  QrCode,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { PAY_PROVIDER_OPTIONS } from "@/config/billing/options";
import { BILLING_PLANS, type PlanId, isPlanId } from "@/config/billing/plans";
import {
  buildBillingCheckoutPath,
  parseBillingCheckoutRedirect,
} from "@/domain/billing/portone/billingCheckoutRedirect";
import { trackGaEvent } from "@/lib/analytics/ga4";
import { useBillingCheckoutStore } from "@/stores/billingCheckoutStore";
import { toast } from "@/stores/toastStore";
import { useMeStore } from "@/stores/useMeStore";
import CheckoutQrCode from "./CheckoutQrCode";

const PRESS_PLAN_CATEGORY = "PRESS";
const RENEW_WINDOW_DAYS = 7;

type Intent =
  | "DOWNGRADE"
  | "PLAN_CHANGE"
  | "UPGRADE"
  | "RENEW"
  | "SUBSCRIBE"
  | "RECOVER"
  | "NOOP";
type CheckoutIntentStatus =
  | "OPEN"
  | "OPENED"
  | "BILLING_KEY_ISSUED"
  | "COMPLETED"
  | "EXPIRED"
  | "FAILED";

type CheckoutIntentSummary = {
  id: string;
  teamId: string;
  teamName: string;
  planId: string;
  planName: string;
  planMonthlyAmountWon: number;
  payProvider: "inicis" | "kakaopay";
  couponCode: string | null;
  status: CheckoutIntentStatus;
  lastError: string | null;
  openedAt: string | null;
  billingKeyIssuedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type CheckoutIntentPayload = {
  token: string;
  mobileUrl: string;
  intent: CheckoutIntentSummary;
};

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function fmtKRW(won: number) {
  return `₩${won.toLocaleString("ko-KR")}`;
}

function fmtDateTime(value?: string | null) {
  if (!value) return "없음";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "없음";
  return d.toLocaleString("ko-KR");
}

function isAdminRole(role?: string | null) {
  return role === "OWNER" || role === "ADMIN";
}

function intentTitle(intent: Intent) {
  switch (intent) {
    case "DOWNGRADE":
      return "다음 결제부터 변경";
    case "PLAN_CHANGE":
      return "다음 결제부터 플랜 전환";
    case "RECOVER":
      return "미납 복구 필요";
    case "UPGRADE":
      return "즉시 업그레이드";
    case "RENEW":
      return "동일 플랜 연장";
    case "NOOP":
      return "변경 없음";
    default:
      return "새 구독 시작";
  }
}

function intentDescription(intent: Intent, payProvider: string) {
  if (intent === "DOWNGRADE") {
    return "이번 결제는 발생하지 않고 다음 주기부터 하위 플랜으로 바뀝니다.";
  }
  if (intent === "PLAN_CHANGE") {
    return "이번 결제는 발생하지 않고 다음 주기부터 같은 등급의 다른 플랜으로 전환됩니다.";
  }
  if (intent === "RECOVER") {
    return "미납 상태에서는 일반 플랜 변경을 진행할 수 없습니다. 먼저 결제수단을 갱신해 현재 구독을 복구하거나, 자동결제 재시도를 중단해야 합니다.";
  }
  if (payProvider === "inicis") {
    return "카드 등록이 끝나면 이 화면으로 돌아와 첫 결제가 자동 완료됩니다.";
  }
  if (intent === "RENEW") {
    return "현재 플랜을 같은 조건으로 연장합니다.";
  }
  if (intent === "UPGRADE") {
    return "차액만 바로 결제하고 상위 플랜으로 즉시 변경합니다.";
  }
  return "결제가 완료되면 바로 구독 상태가 반영됩니다.";
}

export default function BillingCheckoutClient({ planId }: { planId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [nowMs] = useState(() => Date.now());
  const [isMobileDevice] = useState(() => {
    if (typeof navigator === "undefined") return false;
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent || "",
    );
  });
  const [redirectNotice, setRedirectNotice] = useState<string | null>(null);
  const [copiedMobileLink, setCopiedMobileLink] = useState(false);
  const [checkoutIntent, setCheckoutIntent] =
    useState<CheckoutIntentPayload | null>(null);
  const [checkoutIntentError, setCheckoutIntentError] = useState<string | null>(
    null,
  );
  const [creatingCheckoutIntent, setCreatingCheckoutIntent] = useState(false);

  const trackedCheckoutViewRef = useRef<string | null>(null);
  const redirectedRef = useRef(false);
  const redirectHandledRef = useRef(false);
  const initializedCouponRef = useRef<string | null>(null);
  const checkoutIntentMarkerRef = useRef<string | null>(null);

  const checked = useMeStore((s) => s.checked);
  const loadingMe = useMeStore((s) => s.loading);
  const authStatus = useMeStore((s) => s.authStatus);
  const me = useMeStore((s) => s.me);
  const fetchMe = useMeStore((s) => s.fetchMe);

  const payProvider = useBillingCheckoutStore((s) => s.payProvider);
  const loading = useBillingCheckoutStore((s) => s.loading);
  const completed = useBillingCheckoutStore((s) => s.completed);
  const setPayProvider = useBillingCheckoutStore((s) => s.setPayProvider);
  const setPlanId = useBillingCheckoutStore((s) => s.setPlanId);
  const fetchQuote = useBillingCheckoutStore((s) => s.fetchQuote);
  const startPayment = useBillingCheckoutStore((s) => s.startPayment);
  const completeBillingKeyPayment = useBillingCheckoutStore(
    (s) => s.completeBillingKeyPayment,
  );
  const couponCode = useBillingCheckoutStore((s) => s.couponCode);
  const couponError = useBillingCheckoutStore((s) => s.couponError);
  const setCouponCode = useBillingCheckoutStore((s) => s.setCouponCode);
  const applyCoupon = useBillingCheckoutStore((s) => s.applyCoupon);
  const clearCoupon = useBillingCheckoutStore((s) => s.clearCoupon);
  const summary = useBillingCheckoutStore((s) => s.summary);
  const quote = useBillingCheckoutStore((s) => s.quote);
  const loadingQuote = useBillingCheckoutStore((s) => s.loadingQuote);
  const loadingSummary = useBillingCheckoutStore((s) => s.loadingSummary);
  const fetchSummary = useBillingCheckoutStore((s) => s.fetchSummary);

  const searchParamsString = searchParams.toString();
  const redirectResult = useMemo(
    () => parseBillingCheckoutRedirect(new URLSearchParams(searchParamsString)),
    [searchParamsString],
  );
  const checkoutSurface =
    isPlanId(planId) && BILLING_PLANS[planId]?.category === "CAREER"
      ? "resume"
      : "press";
  const checkoutPricingHref =
    checkoutSurface === "resume" ? "/resume/pricing?tab=CAREER" : "/press/pricing";
  const checkoutMyHref = `/my?surface=${checkoutSurface}`;
  const nextUrl = useMemo(
    () => `${pathname}${searchParamsString ? `?${searchParamsString}` : ""}`,
    [pathname, searchParamsString],
  );

  useEffect(() => {
    if (!checked && !loadingMe) {
      fetchMe().catch(() => {});
    }
  }, [checked, loadingMe, fetchMe]);

  useEffect(() => {
    if (!checked) return;
    if (redirectedRef.current) return;
    if (authStatus !== "authed") {
      redirectedRef.current = true;
      router.replace(`/login?next=${encodeURIComponent(nextUrl)}`);
      return;
    }
    const role = me?.userRole ?? null;
    if (!isAdminRole(role)) {
      redirectedRef.current = true;
      router.replace(checkoutPricingHref);
    }
  }, [authStatus, checked, checkoutPricingHref, me?.userRole, nextUrl, router]);

  const gateReady =
    checked && authStatus === "authed" && isAdminRole(me?.userRole ?? null);

  useEffect(() => {
    setPlanId(planId ?? null);
  }, [planId, setPlanId]);

  useEffect(() => {
    if (!redirectResult.payProvider) return;
    if (redirectResult.payProvider === payProvider) return;
    setPayProvider(redirectResult.payProvider);
  }, [payProvider, redirectResult.payProvider, setPayProvider]);

  useEffect(() => {
    if (!isPlanId(planId)) return;
    fetchSummary(planId).catch(() => {});
  }, [fetchSummary, planId]);

  useEffect(() => {
    if (!planId || !isPlanId(planId)) return;
    const couponFromQuery = redirectResult.couponCode ?? "";
    const marker = `${planId}:${couponFromQuery}`;
    if (initializedCouponRef.current === marker) return;
    initializedCouponRef.current = marker;

    setCouponCode(couponFromQuery);
    fetchQuote(planId, couponFromQuery || undefined).catch(() => {});
  }, [fetchQuote, planId, redirectResult.couponCode, setCouponCode]);

  const visiblePayOptions = useMemo(() => {
    const isPressPlan =
      isPlanId(planId) &&
      BILLING_PLANS[planId]?.category === PRESS_PLAN_CATEGORY;

    if (!isPressPlan) {
      return PAY_PROVIDER_OPTIONS.filter((opt) => opt.id !== "kakaopay");
    }

    return PAY_PROVIDER_OPTIONS;
  }, [planId]);

  useEffect(() => {
    const isCurrentValid = visiblePayOptions.find((opt) => opt.id === payProvider);

    if (!isCurrentValid && visiblePayOptions.length > 0) {
      setPayProvider(visiblePayOptions[0].id);
    }
  }, [payProvider, setPayProvider, visiblePayOptions]);

  const plan = useMemo(() => {
    if (!isPlanId(planId)) return null;
    return BILLING_PLANS[planId as PlanId];
  }, [planId]);

  const selectedProduct = useMemo(() => {
    if (!plan) return "PRESS";
    return plan.category === "CAREER" ? "CAREER" : "PRESS";
  }, [plan]);

  const expiresMs = useMemo(() => {
    const raw = quote?.ok
      ? quote.current.planExpiresAt
      : summary?.ok
        ? summary.team.planExpiresAt
        : null;

    if (!raw) return null;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : null;
  }, [quote, summary]);

  const hasActiveCycle = useMemo(() => {
    return !!expiresMs && nowMs < expiresMs;
  }, [expiresMs, nowMs]);
  const isPastDueRecoveryRequired =
    summary?.ok && summary.team.membershipStatus === "PAST_DUE";

  const renewAllowed = useMemo(() => {
    if (!hasActiveCycle || !expiresMs) return true;
    const diff = expiresMs - nowMs;
    return diff <= RENEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  }, [expiresMs, hasActiveCycle, nowMs]);

  const isSamePlan = useMemo(() => {
    if (!quote?.ok) return false;
    return quote.current.planId === quote.target.planId;
  }, [quote]);

  const intent: Intent = useMemo(() => {
    if (isPastDueRecoveryRequired) return "RECOVER";
    if (!plan || !quote?.ok) return "SUBSCRIBE";
    if (quote.action === "SCHEDULE_DOWNGRADE") return "DOWNGRADE";
    if (quote.action === "SCHEDULE_CHANGE") return "PLAN_CHANGE";
    if (quote.action === "NOOP") return "NOOP";
    if (isSamePlan) return hasActiveCycle ? "RENEW" : "SUBSCRIBE";
    return hasActiveCycle ? "UPGRADE" : "SUBSCRIBE";
  }, [hasActiveCycle, isPastDueRecoveryRequired, isSamePlan, plan, quote]);

  const totalPreview = useMemo(() => {
    if (!plan) return 0;
    if (!quote?.ok) return plan.monthlyAmountWon;
    return quote.payNowAmountWon;
  }, [plan, quote]);

  const basePreview = useMemo(() => {
    if (!plan) return 0;
    if (!quote?.ok) return plan.monthlyAmountWon;
    return quote.basePayNowAmountWon ?? quote.payNowAmountWon;
  }, [plan, quote]);

  const appliedCoupon = quote?.ok ? quote.coupon : null;
  const couponErrorText = useMemo(() => {
    if (!couponError) return null;
    switch (couponError) {
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
      case "COUPON_NOT_DISCOUNT":
        return "이 쿠폰은 이용권 전용입니다. 가격 정책에서 적용해 주세요.";
      case "COUPON_MIN_AMOUNT":
        return "결제 금액 조건을 충족하지 않습니다.";
      default:
        return "쿠폰을 적용할 수 없습니다.";
    }
  }, [couponError]);

  const disabledReason = useMemo(() => {
    if (completed) return "이미 결제가 완료되었습니다.";
    if (!plan) return "유효하지 않은 플랜입니다.";
    if (loadingQuote || loadingSummary) return "정보를 불러오는 중입니다.";
    if (isPastDueRecoveryRequired) {
      return "미납 상태에서는 일반 checkout을 진행할 수 없습니다. 먼저 구독을 복구하세요.";
    }
    if (intent === "NOOP") return "이미 적용된 상태입니다.";
    if (intent === "RENEW" && hasActiveCycle && !renewAllowed) {
      const expText =
        expiresMs != null ? new Date(expiresMs).toLocaleString("ko-KR") : "—";
      return `이미 같은 플랜을 사용 중입니다. (만료: ${expText}) 연장은 만료 ${RENEW_WINDOW_DAYS}일 전부터 가능합니다.`;
    }
    return null;
  }, [
    completed,
    expiresMs,
    hasActiveCycle,
    isPastDueRecoveryRequired,
    intent,
    loadingQuote,
    loadingSummary,
    plan,
    renewAllowed,
  ]);

  const canProceedPay =
    !loading &&
    !!plan &&
    !loadingQuote &&
    !loadingSummary &&
    !disabledReason &&
    intent !== "DOWNGRADE";

  const showDesktopInicisHandoff =
    payProvider === "inicis" &&
    !isMobileDevice &&
    !isPastDueRecoveryRequired &&
    intent !== "DOWNGRADE" &&
    intent !== "PLAN_CHANGE" &&
    intent !== "NOOP" &&
    !(intent === "RENEW" && hasActiveCycle && !renewAllowed);

  const paySelectionDisabled =
    intent === "DOWNGRADE" ||
    intent === "PLAN_CHANGE" ||
    isPastDueRecoveryRequired;

  const actionLabel = useMemo(() => {
    if (!plan) return "결제";
    if (loadingSummary || loadingQuote) return "견적 계산 중...";
    if (intent === "RECOVER") return "구독 복구가 필요합니다";
    if (!quote?.ok) return `결제하기 (${fmtKRW(plan.monthlyAmountWon)})`;
    if (intent === "DOWNGRADE") return "다음 결제부터 변경 예약 (0원)";
    if (intent === "PLAN_CHANGE") return "다음 결제부터 플랜 전환 예약 (0원)";
    if (intent === "NOOP") return "이미 적용됨";
    if (intent === "RENEW") {
      if (hasActiveCycle && !renewAllowed) return "연장 가능 기간 아님";
      return `연장 결제하기 (${fmtKRW(quote.payNowAmountWon)})`;
    }
    if (intent === "UPGRADE") {
      return `업그레이드 결제하기 (${fmtKRW(quote.payNowAmountWon)})`;
    }
    return `결제하기 (${fmtKRW(quote.payNowAmountWon)})`;
  }, [
    hasActiveCycle,
    intent,
    loadingQuote,
    loadingSummary,
    plan,
    quote,
    renewAllowed,
  ]);

  const checkoutCouponCode =
    appliedCoupon?.code ?? (couponCode.trim() || undefined);
  const teamId = summary?.ok ? summary.team.id : null;

  const sanitizedCheckoutPath = useMemo(() => {
    const redirectPlanId = redirectResult.planId ?? planId;
    const redirectPayProvider = redirectResult.payProvider ?? payProvider;
    if (!redirectPlanId || !redirectPayProvider) return null;
    return buildBillingCheckoutPath({
      planId: redirectPlanId,
      payProvider: redirectPayProvider,
      couponCode: redirectResult.couponCode,
      mobile: redirectResult.mobile,
    });
  }, [
    payProvider,
    planId,
    redirectResult.couponCode,
    redirectResult.mobile,
    redirectResult.payProvider,
    redirectResult.planId,
  ]);

  const selectedPayOption = useMemo(
    () => visiblePayOptions.find((opt) => opt.id === payProvider) ?? null,
    [payProvider, visiblePayOptions],
  );

  const currentPlanName = summary?.ok ? summary.team.plan : "구독 정보 없음";
  const expiresAtText = summary?.ok
    ? fmtDateTime(summary.team.planExpiresAt)
    : "불러오는 중";
  const pendingPlanText =
    summary?.ok && summary.team.pendingPlan
      ? `${summary.team.pendingPlan} 예약`
      : "예약 없음";
  const summaryTone =
    intent === "RECOVER"
      ? intentDescription(intent, payProvider)
      : payProvider === "inicis" && showDesktopInicisHandoff
      ? "PC에서는 모바일 등록으로 이어집니다."
      : intentDescription(intent, payProvider);
  const desktopCheckoutIntentKey = useMemo(() => {
    if (!showDesktopInicisHandoff || !teamId || !plan) return null;
    return [teamId, plan.id, payProvider, checkoutCouponCode ?? ""].join(":");
  }, [checkoutCouponCode, payProvider, plan, showDesktopInicisHandoff, teamId]);
  const desktopHandoffUrl = checkoutIntent?.mobileUrl ?? "";
  const desktopHandoffStatus = checkoutIntent?.intent.status ?? null;

  useEffect(() => {
    if (!showDesktopInicisHandoff) {
      checkoutIntentMarkerRef.current = null;
      return;
    }
    if (!gateReady || !desktopCheckoutIntentKey || !plan || !teamId) return;
    if (checkoutIntentMarkerRef.current === desktopCheckoutIntentKey) return;

    checkoutIntentMarkerRef.current = desktopCheckoutIntentKey;
    const checkoutPlanId = plan.id;

    async function createCheckoutIntent() {
      setCreatingCheckoutIntent(true);
      setCheckoutIntentError(null);

      try {
        const res = await fetch("/api/billing/checkout-intents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId: checkoutPlanId,
            payProvider: "inicis",
            couponCode: checkoutCouponCode ?? null,
          }),
        });
        const json = await res.json().catch(() => null);

        if (!json?.ok || !json?.token || !json?.mobileUrl || !json?.intent) {
          throw new Error(
            json?.message ?? json?.error ?? "모바일 결제 링크를 만들지 못했습니다.",
          );
        }

        setCheckoutIntent({
          token: json.token,
          mobileUrl: json.mobileUrl,
          intent: json.intent as CheckoutIntentSummary,
        });
      } catch (error: any) {
        checkoutIntentMarkerRef.current = null;
        setCheckoutIntent(null);
        setCheckoutIntentError(
          error?.message ?? "모바일 결제 링크를 만들지 못했습니다.",
        );
      } finally {
        setCreatingCheckoutIntent(false);
      }
    }

    void createCheckoutIntent();
  }, [
    checkoutCouponCode,
    desktopCheckoutIntentKey,
    gateReady,
    plan,
    showDesktopInicisHandoff,
    teamId,
  ]);

  useEffect(() => {
    if (!showDesktopInicisHandoff) return;
    if (!checkoutIntent?.token) return;

    const currentToken = checkoutIntent.token;
    const currentMobileUrl = checkoutIntent.mobileUrl;
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(
          `/api/billing/checkout-intents/status?token=${encodeURIComponent(
            currentToken,
          )}`,
          { cache: "no-store" },
        );
        const json = await res.json().catch(() => null);
        if (cancelled || !res.ok || !json?.ok || !json?.intent) return;

        const nextIntent = {
          token: currentToken,
          mobileUrl: currentMobileUrl,
          intent: json.intent as CheckoutIntentSummary,
        };
        setCheckoutIntent(nextIntent);

        if (nextIntent.intent.status === "COMPLETED") {
          router.replace("/billing/checkout/complete");
          return;
        }

        if (nextIntent.intent.status === "FAILED" && nextIntent.intent.lastError) {
          setCheckoutIntentError(nextIntent.intent.lastError);
        } else if (nextIntent.intent.status === "EXPIRED") {
          setCheckoutIntentError("모바일 결제 링크가 만료되었습니다. 다시 생성해 주세요.");
          return;
        } else {
          setCheckoutIntentError(null);
        }
      } catch {
        // ignore polling errors
      }
    }

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [checkoutIntent?.mobileUrl, checkoutIntent?.token, router, showDesktopInicisHandoff]);

  useEffect(() => {
    if (!gateReady || !summary?.ok) return;
    if (redirectHandledRef.current) return;
    if (!redirectResult.hasResult) return;

    const redirectPlanId = redirectResult.planId ?? planId;
    const redirectPayProvider = redirectResult.payProvider ?? payProvider;

    if (!redirectPlanId || !isPlanId(redirectPlanId) || !redirectPayProvider) {
      return;
    }

    redirectHandledRef.current = true;
    if (sanitizedCheckoutPath && typeof window !== "undefined") {
      window.history.replaceState({}, "", sanitizedCheckoutPath);
    }

    if (redirectResult.code || !redirectResult.billingKey) {
      const message =
        redirectResult.pgMessage ??
        redirectResult.message ??
        redirectResult.code ??
        "빌링키 발급에 실패했습니다.";
      window.setTimeout(() => setRedirectNotice(message), 0);
      toast.error(message, "결제");
      trackGaEvent("checkout_failed", {
        plan_id: redirectPlanId,
        pay_provider: redirectPayProvider,
        stage: "redirect",
        error_code: redirectResult.code ?? message,
      });
      return;
    }

    window.setTimeout(
      () => setRedirectNotice("모바일 카드 등록을 확인하고 있습니다..."),
      0,
    );

    completeBillingKeyPayment({
      teamId: summary.team.id,
      planId: redirectPlanId,
      payProvider: redirectPayProvider,
      billingKey: redirectResult.billingKey,
      couponCode: redirectResult.couponCode,
    })
      .then((result) => {
        if (!result.ok) {
          setRedirectNotice(result.error);
          redirectHandledRef.current = false;
          return;
        }
        router.replace("/billing/checkout/complete");
      })
      .catch((error: any) => {
        const message = error?.message ?? "모바일 결제 완료 처리에 실패했습니다.";
        setRedirectNotice(message);
        toast.error(message, "결제");
        redirectHandledRef.current = false;
      });
  }, [
    completeBillingKeyPayment,
    gateReady,
    payProvider,
    planId,
    redirectResult.billingKey,
    redirectResult.code,
    redirectResult.couponCode,
    redirectResult.hasResult,
    redirectResult.message,
    redirectResult.payProvider,
    redirectResult.pgMessage,
    redirectResult.planId,
    router,
    sanitizedCheckoutPath,
    summary,
  ]);

  useEffect(() => {
    if (!gateReady || !plan || loadingQuote || loadingSummary) return;

    const viewKey = [
      planId,
      intent,
      payProvider,
      appliedCoupon?.code ?? "no-coupon",
    ].join(":");

    if (trackedCheckoutViewRef.current === viewKey) {
      return;
    }

    trackedCheckoutViewRef.current = viewKey;
    trackGaEvent("checkout_page_viewed", {
      plan_id: plan.id,
      plan_category: plan.category,
      pay_provider: payProvider,
      intent,
      current_plan: summary?.ok ? summary.team.plan : null,
      has_active_cycle: hasActiveCycle,
      has_coupon: !!appliedCoupon,
      preview_amount_won: totalPreview,
    });
  }, [
    appliedCoupon,
    gateReady,
    hasActiveCycle,
    intent,
    loadingQuote,
    loadingSummary,
    payProvider,
    plan,
    planId,
    summary,
    totalPreview,
  ]);

  async function copyInicisMobileLink() {
    if (!desktopHandoffUrl) {
      toast.error("모바일 링크를 만들지 못했습니다.", "결제");
      return;
    }

    try {
      await navigator.clipboard.writeText(desktopHandoffUrl);
      setCopiedMobileLink(true);
      toast.success("모바일 결제 링크를 복사했습니다.", "결제");
      window.setTimeout(() => setCopiedMobileLink(false), 2200);
    } catch {
      window.prompt("휴대폰에서 아래 링크를 열어주세요.", desktopHandoffUrl);
    }
  }

  async function onClickPay() {
    if (!plan || !isPlanId(planId)) return;
    if (!gateReady) {
      alert("권한 확인 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    if (isPastDueRecoveryRequired) {
      alert(
        "미납 상태에서는 일반 checkout을 진행할 수 없습니다. 결제수단을 갱신해 구독을 복구하거나 자동결제 재시도를 중단해 주세요.",
      );
      return;
    }

    if (
      quote?.ok &&
      (quote.action === "SCHEDULE_DOWNGRADE" ||
        quote.action === "SCHEDULE_CHANGE")
    ) {
      const ok = window.confirm(
        quote.action === "SCHEDULE_CHANGE"
          ? "다음 결제부터 이 플랜으로 전환 예약할까요?"
          : "다음 결제부터 하위 플랜으로 변경 예약할까요?",
      );
      if (!ok) return;

      const res = await fetch("/api/billing/subscription/schedule-downgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPlanId: planId,
          product: selectedProduct,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        alert(json?.message ?? json?.error ?? "예약 실패");
        return;
      }
      trackGaEvent("downgrade_scheduled", {
        plan_id: planId,
        pay_provider: payProvider,
        source: "billing_checkout",
        schedule_action: quote.action,
      });
      alert(
        quote.action === "SCHEDULE_CHANGE"
          ? "플랜 전환이 다음 결제부터 적용되도록 예약되었습니다."
          : "다운그레이드가 다음 결제부터 적용되도록 예약되었습니다.",
      );
      router.push("/billing/checkout/complete");
      return;
    }

    if (intent === "NOOP") {
      alert("이미 적용된 상태입니다.");
      return;
    }
    if (intent === "RENEW" && hasActiveCycle && !renewAllowed) {
      alert(disabledReason ?? "연장 가능 기간이 아닙니다.");
      return;
    }

    if (intent === "RENEW") {
      const ok = window.confirm(
        "현재 플랜과 동일한 플랜입니다.\n'연장 결제'를 진행할까요?",
      );
      if (!ok) return;
    }

    const teamId = summary?.ok ? summary.team.id : null;
    if (!teamId) {
      alert("팀 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const result = await startPayment({
      teamId,
      mobileRedirect: isMobileDevice,
      couponCode: checkoutCouponCode ?? null,
    });
    if (!result.ok) return;
    if (result.redirected) return;

    router.push("/billing/checkout/complete");
  }

  if (!gateReady) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
        <div className="border border-slate-200/80 bg-white p-6">
          <div className="h-6 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-72 animate-pulse rounded bg-muted" />
          <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="h-80 bg-muted animate-pulse" />
            <div className="h-64 bg-muted animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  async function onClickStopPastDueRetry() {
    const ok = window.confirm(
      "자동결제 재시도를 중단하시겠습니까?\n만료일까지는 현재 구독을 그대로 사용할 수 있습니다.",
    );
    if (!ok) return;

    const res = await fetch("/api/billing/subscription/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: selectedProduct }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      alert(json?.message ?? json?.error ?? "자동결제 재시도를 중단하지 못했습니다.");
      return;
    }
    router.push(checkoutMyHref);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6 lg:py-10">
      <button
        onClick={() => router.push(checkoutPricingHref)}
        className="group mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-950"
      >
        <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        플랜 선택으로 돌아가기
      </button>

      <section className="relative overflow-hidden border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_42%,#ecfeff_100%)] p-6 md:p-8">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-cyan-200/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-slate-200/40 blur-3xl" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-slate-700 uppercase">
              {showDesktopInicisHandoff ? (
                <>
                  <QrCode className="h-3.5 w-3.5" />
                  Mobile Checkout Only
                </>
              ) : payProvider === "inicis" ? (
                <>
                  <Smartphone className="h-3.5 w-3.5" />
                  Mobile Card Registration
                </>
              ) : (
                <>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Fast Checkout
                </>
              )}
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
              {showDesktopInicisHandoff
                ? "휴대폰에서 카드 등록을 이어서 진행하세요"
                : "구독 결제를 진행합니다"}
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600 md:text-base">
              {showDesktopInicisHandoff
                ? "이니시스 카드는 PC 결제창보다 모바일 등록 흐름이 훨씬 자연스럽습니다. 아래 QR을 찍으면 같은 checkout이 휴대폰에서 열리고, 카드 등록이 끝나면 첫 결제가 자동 완료됩니다."
                : summaryTone}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <div className="border border-white/80 bg-white/85 p-4 backdrop-blur">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                현재 플랜
              </div>
              <div className="mt-2 text-base font-semibold text-slate-950">
                {currentPlanName}
              </div>
              <div className="mt-1 text-xs text-slate-500">{expiresAtText}</div>
            </div>
            <div className="border border-white/80 bg-white/85 p-4 backdrop-blur">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                이번 액션
              </div>
              <div className="mt-2 text-base font-semibold text-slate-950">
                {intentTitle(intent)}
              </div>
              <div className="mt-1 text-xs text-slate-500">{pendingPlanText}</div>
            </div>
            <div className="border border-white/80 bg-white/85 p-4 backdrop-blur">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                예상 결제
              </div>
              <div className="mt-2 text-base font-semibold text-slate-950">
                {fmtKRW(totalPreview)}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {selectedPayOption?.label ?? "결제수단 선택"}
              </div>
            </div>
          </div>
        </div>
      </section>

      {isPastDueRecoveryRequired ? (
        <section className="mt-5 grid gap-4 border border-amber-200 bg-amber-50 p-5 md:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="text-sm font-semibold text-amber-900">
              미납 상태에서는 새 플랜 checkout을 진행할 수 없습니다.
            </div>
            <p className="mt-2 text-sm leading-6 text-amber-800">
              먼저 결제수단을 갱신해 현재 구독을 복구하거나, 자동결제 재시도를
              중단하고 만료일까지 현재 구독을 사용하세요. 다른 요금제는 복구
              이후 또는 만료 처리 후 시작할 수 있습니다.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => router.push("/billing/payment-method")}
              className="inline-flex items-center justify-center bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              결제수단 갱신 후 구독 복구
            </button>
            <button
              type="button"
              onClick={() => {
                void onClickStopPastDueRetry();
              }}
              className="inline-flex items-center justify-center border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-100"
            >
              자동결제 재시도 중단
            </button>
          </div>
        </section>
      ) : null}

      {redirectNotice ? (
        <div className="mt-4 border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
          {redirectNotice}
        </div>
      ) : null}

      {disabledReason ? (
        <div className="mt-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {disabledReason}
        </div>
      ) : null}

      {checkoutIntentError && showDesktopInicisHandoff ? (
        <div className="mt-4 border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {checkoutIntentError}
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_380px]">
        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <article className="border border-slate-200 bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Team Subscription
              </div>
              {summary?.ok ? (
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-4">
                    <span>플랜</span>
                    <span className="font-medium text-slate-950">
                      {summary.team.plan}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>상태</span>
                    <span className="font-medium text-slate-950">
                      {summary.team.membershipStatus}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span>만료 예정</span>
                    <span className="font-medium text-slate-950">
                      {fmtDateTime(summary.team.planExpiresAt)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-slate-500">
                  {loadingSummary ? "불러오는 중..." : "구독 정보가 없습니다."}
                </div>
              )}
            </article>

            <article className="border border-slate-200 bg-white p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Next Change
              </div>
              <div className="mt-3 space-y-2 text-sm text-slate-600">
                <div className="flex items-center justify-between gap-4">
                  <span>선택 플랜</span>
                  <span className="font-medium text-slate-950">
                    {plan?.name ?? "없음"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>진행 방식</span>
                  <span className="font-medium text-slate-950">
                    {intentTitle(intent)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span>다음 예약</span>
                  <span className="font-medium text-slate-950">
                    {summary?.ok && summary.team.pendingPlan
                      ? summary.team.pendingPlan
                      : "없음"}
                  </span>
                </div>
              </div>
            </article>
          </div>

          <section className="border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Coupon
                </div>
                <div className="mt-1 text-base font-semibold text-slate-950">
                  쿠폰 적용
                </div>
              </div>
              {appliedCoupon ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  적용됨
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value)}
                placeholder="쿠폰 번호 입력"
                className="h-12 flex-1 border border-slate-200 bg-slate-50 px-4 text-sm text-slate-950 outline-none transition focus:border-slate-400 focus:bg-white"
                disabled={loadingQuote || loadingSummary}
              />
              <button
                type="button"
                onClick={() => applyCoupon()}
                disabled={loadingQuote || loadingSummary || !couponCode.trim()}
                className={cn(
                  "inline-flex h-12 items-center justify-center px-5 text-sm font-semibold transition",
                  "bg-slate-950 text-white hover:bg-slate-800",
                  (loadingQuote || loadingSummary || !couponCode.trim()) &&
                    "cursor-not-allowed opacity-40",
                )}
              >
                적용
              </button>
            </div>

            {couponErrorText ? (
              <div className="mt-3 text-sm text-rose-600">{couponErrorText}</div>
            ) : null}

            {appliedCoupon ? (
              <div className="mt-4 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">
                    {appliedCoupon.name ?? appliedCoupon.code}
                  </div>
                  <button
                    type="button"
                    onClick={clearCoupon}
                    className="text-xs font-medium text-emerald-800/80 hover:text-emerald-950"
                  >
                    제거
                  </button>
                </div>
                <div className="mt-1 text-emerald-800/80">
                  할인 {fmtKRW(appliedCoupon.discountAmountWon)}
                </div>
              </div>
            ) : null}
          </section>

          <section className="border border-slate-200 bg-white p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Payment Method
            </div>
            <div className="mt-1 text-base font-semibold text-slate-950">
              결제수단 선택
            </div>

            <div className="mt-4 grid gap-3">
              {visiblePayOptions.map((opt) => {
                const disabled = !opt.enabled || paySelectionDisabled;
                const active = payProvider === opt.id;
                return (
                  <label
                    key={opt.id}
                    className={cn(
                      "flex cursor-pointer items-start justify-between gap-4 border p-4 transition",
                      "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white",
                      active &&
                        "border-slate-950 bg-white",
                      (disabled || loading) && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="payProvider"
                        disabled={disabled || loading}
                        checked={active}
                        onChange={() => !disabled && setPayProvider(opt.id)}
                        className="mt-1"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-slate-950">
                            {opt.label}
                          </div>
                          {opt.id === "inicis" ? (
                            <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-700">
                              모바일 우선
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {opt.description}
                        </div>
                      </div>
                    </div>

                    {opt.id === "inicis" ? (
                      <Smartphone className="mt-0.5 h-4 w-4 text-slate-400" />
                    ) : (
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-slate-400" />
                    )}
                  </label>
                );
              })}
            </div>
          </section>

          {payProvider === "inicis" ? (
            <section className="border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_55%,#eef6ff_100%)] p-5">
              {showDesktopInicisHandoff ? (
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-white uppercase">
                      <QrCode className="h-3.5 w-3.5" />
                      Scan To Continue
                    </div>
                    <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">
                      PC에서는 결제를 열지 않고 모바일로 넘깁니다
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      휴대폰 카메라로 QR을 찍으면 공개 모바일 결제 페이지가 열립니다.
                      로그인 없이 카드 등록을 진행하고, 완료되면 이 화면이 자동으로 갱신됩니다.
                    </p>

                    <div className="mt-4 inline-flex rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-medium text-slate-600">
                      {creatingCheckoutIntent
                        ? "보안 링크 생성 중"
                        : desktopHandoffStatus === "OPENED"
                          ? "휴대폰에서 링크를 열었습니다"
                          : desktopHandoffStatus === "BILLING_KEY_ISSUED"
                            ? "카드 등록 후 첫 결제를 처리 중입니다"
                            : desktopHandoffStatus === "FAILED"
                              ? "모바일에서 다시 시도할 수 있습니다"
                              : desktopHandoffStatus === "COMPLETED"
                                ? "결제가 완료되었습니다"
                                : "QR을 찍어 모바일에서 이어서 진행하세요"}
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
                      <div className="border border-slate-200 bg-white/90 p-3">
                        <div className="font-semibold text-slate-950">1. QR 스캔</div>
                        <div className="mt-1 text-xs text-slate-500">
                          휴대폰 카메라로 열기
                        </div>
                      </div>
                      <div className="border border-slate-200 bg-white/90 p-3">
                        <div className="font-semibold text-slate-950">2. 카드 등록</div>
                        <div className="mt-1 text-xs text-slate-500">
                          모바일 이니시스 창에서 진행
                        </div>
                      </div>
                      <div className="border border-slate-200 bg-white/90 p-3">
                        <div className="font-semibold text-slate-950">3. 자동 완료</div>
                        <div className="mt-1 text-xs text-slate-500">
                          빌링키 확인 후 첫 결제 반영
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={copyInicisMobileLink}
                        disabled={!desktopHandoffUrl}
                        className="inline-flex h-11 items-center justify-center gap-2 bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        <Copy className="h-4 w-4" />
                        {copiedMobileLink ? "링크 복사됨" : "모바일 링크 복사"}
                      </button>
                      <div className="inline-flex h-11 items-center border border-slate-200 bg-white px-4 text-sm text-slate-500">
                        이니시스 카드는 모바일에서만 진행
                      </div>
                    </div>

                    <div className="mt-4 border border-dashed border-slate-300 bg-white/80 px-4 py-3 text-xs break-all text-slate-500">
                      {desktopHandoffUrl || "모바일 링크를 준비 중입니다."}
                    </div>
                  </div>

                  <div className="mx-auto w-full max-w-[240px]">
                    <CheckoutQrCode value={desktopHandoffUrl} />
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="bg-slate-950 p-3 text-white">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-base font-semibold text-slate-950">
                      모바일 카드 등록으로 이어집니다
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      버튼을 누르면 이니시스 카드 등록창으로 이동합니다. 등록이
                      끝나면 checkout으로 돌아와 첫 결제가 자동으로 완료됩니다.
                    </p>
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <section className="border border-slate-200 bg-slate-950 p-6 text-white">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
              Order Summary
            </div>
            <div className="mt-4">
              <div className="text-xl font-semibold">{plan?.name ?? "플랜 선택 필요"}</div>
              <div className="mt-1 text-sm text-white/65">
                {planId || "유효하지 않은 플랜"} · {intentTitle(intent)}
              </div>
            </div>

            <div className="mt-6 space-y-3 bg-white/8 p-4">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-white/65">기본 금액</span>
                <span>{fmtKRW(basePreview)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-white/65">할인</span>
                <span>
                  {basePreview !== totalPreview
                    ? `-${fmtKRW(basePreview - totalPreview)}`
                    : "₩0"}
                </span>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-white/70">오늘 결제</span>
                <span className="text-2xl font-semibold">{fmtKRW(totalPreview)}</span>
              </div>
            </div>

            <div className="mt-5 space-y-2 text-sm text-white/70">
              <div className="flex items-center justify-between gap-4">
                <span>결제수단</span>
                <span className="text-right text-white">
                  {selectedPayOption?.label ?? "선택 필요"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>처리 방식</span>
                <span className="text-right text-white">{intentTitle(intent)}</span>
              </div>
            </div>

            {showDesktopInicisHandoff ? (
              <div className="mt-6 border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-sm leading-6 text-cyan-50">
                PC에서 직접 결제를 열지 않습니다. 오른쪽 QR을 찍거나 링크를 복사해
                휴대폰에서 계속해 주세요.
              </div>
            ) : (
              <button
                type="button"
                disabled={intent === "DOWNGRADE" ? false : !canProceedPay}
                onClick={onClickPay}
                className={cn(
                  "mt-6 inline-flex h-12 w-full items-center justify-center px-4 text-sm font-semibold transition",
                  "bg-white text-slate-950 hover:bg-slate-100",
                  (intent === "DOWNGRADE" ? false : !canProceedPay) &&
                    "cursor-not-allowed opacity-40",
                )}
              >
                {loading ? "처리 중..." : actionLabel}
              </button>
            )}

            <p className="mt-4 text-xs leading-5 text-white/55">
              동일 플랜 선택 시 기본 동작은 연장입니다. 연장은 만료
              {RENEW_WINDOW_DAYS}일 전부터 가능합니다.
            </p>
          </section>

          <section className="border border-slate-200 bg-white p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              Before You Pay
            </div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-slate-600">
              <p>쿠폰이 있다면 먼저 적용한 뒤 결제를 시작하는 편이 안전합니다.</p>
              <p>
                이니시스 카드는 모바일에서 등록을 끝내면 이후부터 자동결제로
                같은 카드가 사용됩니다.
              </p>
              <p>
                다운그레이드는 즉시 과금 없이 다음 결제 주기부터 반영됩니다.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
