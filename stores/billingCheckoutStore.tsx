// src/stores/billingCheckoutStore.tsx
"use client";

import { create } from "zustand";
import * as PortOne from "@portone/browser-sdk/v2";

import type { PayProvider } from "@/config/billing/options";
import { PAY_PROVIDER_OPTIONS } from "@/config/billing/options";
import {
  getPlanProduct,
  isPlanId,
  BILLING_PLANS,
  type PlanId,
  type PlanPromotion,
} from "@/config/billing/plans";
import { trackGaEvent } from "@/lib/analytics/ga4";
import { toast } from "@/stores/toastStore";

// ---- [Helper] 가격 계산 로직 ----
function calculateDiscountedPrice(
  originalPrice: number,
  promo?: PlanPromotion,
) {
  if (!promo) return originalPrice;
  if (promo.type === "PERCENT") {
    return Math.floor(originalPrice * (1 - promo.value / 100));
  }
  if (promo.type === "FIXED_AMOUNT") {
    return Math.max(0, originalPrice - promo.value);
  }
  return originalPrice;
}

// ---- API types ----
export type SubscriptionSummary = {
  ok: true;
  team: {
    id: string;
    plan: string;
    membershipStatus: string;
    payProvider: string | null;
    planExpiresAt: string | null;
    nextBillingAt: string | null;
    pendingPlan: string | null;
    pendingPlanStartsAt: string | null;
    cancelRequestedAt: string | null;
  };
  note: string;
};

export type Quote = {
  ok: true;
  action: "PAY_NOW" | "SCHEDULE_DOWNGRADE" | "SCHEDULE_CHANGE" | "NOOP";
  payNowAmountWon: number;
  basePayNowAmountWon?: number;
  coupon?: {
    code: string;
    name: string;
    description?: string | null;
    benefitType: string;
    discountAmountWon: number;
    discountPercent?: number | null;
  } | null;
  promotion?: {
    code: string;
    name: string;
    description?: string | null;
    benefitType: string;
    discountAmountWon: number;
    discountPercent?: number | null;
  } | null;
  target: {
    planId: string;
    planType: string;
    monthlyAmountWon: number;
    name: string;
  };
  current: {
    planId: string | null;
    planType: string;
    membershipStatus: string;
    planExpiresAt: string | null;
    pendingPlan: string | null;
    pendingPlanStartsAt: string | null;
  };
  note: string;
};

// ---- prepare response types ----
type PrepareBillingKeyOk = {
  ok: true;
  kind: "BILLING_KEY_ISSUE";

  storeId: string;
  channelGroupId?: string;
  channelKey: string;

  billingKeyMethod?: string;
  issueId?: string;
  paymentId?: string;
  issueName?: string;

  customer?: {
    customerId?: string;
    fullName?: string;
    phoneNumber?: string;
    email?: string;
    address?: any;
    zipcode?: string;
  };
  customData?: any;
  redirectUrl?: string;
  windowType?: {
    pc?: "IFRAME" | "REDIRECTION" | "POPUP";
    mobile?: "IFRAME" | "REDIRECTION" | "POPUP";
  };
};

function isPrepareBillingKeyOk(v: unknown): v is PrepareBillingKeyOk {
  if (!v || typeof v !== "object") return false;
  const o = v as any;
  return (
    o.ok === true &&
    o.kind === "BILLING_KEY_ISSUE" &&
    typeof o.storeId === "string"
  );
}

// ---- PortOne SDK response types ----
export type StartPaymentResult =
  | { ok: true; action?: string; team?: any; note?: string; redirected?: boolean }
  | { ok: false; error: string };

type InicisCardForm = {
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  birthOrBizNo: string;
  passwordTwoDigits: string;
  customerName: string;
  customerEmail: string;
  customerPhoneNumber: string;
};

type BillingCheckoutStore = {
  planId: string | null;
  payProvider: PayProvider;
  couponCode: string;
  couponError: string | null;

  loading: boolean;
  error: string | null;

  completed: boolean;
  lastAction: string | null;

  summary: SubscriptionSummary | null;
  quote: Quote | null;
  loadingSummary: boolean;
  loadingQuote: boolean;

  inicisCard: InicisCardForm;
  setInicisCard: (patch: Partial<InicisCardForm>) => void;

  setPlanId: (planId: string | null) => void;
  setPayProvider: (payProvider: PayProvider) => void;
  setCouponCode: (code: string) => void;
  applyCoupon: () => Promise<void>;
  clearCoupon: () => void;

  clearError: () => void;
  reset: () => void;

  fetchSummary: (targetPlanId?: string | null) => Promise<void>;
  fetchQuote: (targetPlanId: string, couponCode?: string) => Promise<void>;

  completeBillingKeyPayment: (ctx: {
    teamId: string;
    billingKey: string;
    customer?: any;
    couponCode?: string | null;
    planId?: string | null;
    payProvider?: PayProvider;
    attemptId?: string | null;
    checkoutIntentToken?: string | null;
  }) => Promise<StartPaymentResult>;
  startPayment: (ctx: {
    teamId: string;
    mobileRedirect?: boolean;
    couponCode?: string | null;
  }) => Promise<StartPaymentResult>;
};

const DEFAULT_PROVIDER: PayProvider = "inicis";

function toMsg(v: any, fallback: string) {
  if (!v) return fallback;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}

function attemptStorageKey(
  teamId: string,
  planId: string,
  payProvider: string,
) {
  return `portone_attempt_${teamId}_${planId}_${payProvider}`;
}

function clearAttemptId(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function getStoredAttemptId(teamId: string, planId: string, payProvider: string) {
  const key = attemptStorageKey(teamId, planId, payProvider);
  const attemptId = sessionStorage.getItem(key);
  return {
    key,
    attemptId: attemptId?.trim() ? attemptId.trim() : null,
  };
}

let quoteAbortController: AbortController | null = null;

export const useBillingCheckoutStore = create<BillingCheckoutStore>()(
  (set, get) => ({
    planId: null,
    payProvider: DEFAULT_PROVIDER,
    couponCode: "",
    couponError: null,

    loading: false,
    error: null,

    completed: false,
    lastAction: null,

    summary: null,
    quote: null,
    loadingSummary: false,
    loadingQuote: false,

    inicisCard: {
      cardNumber: process.env.NEXT_PUBLIC_PORTONE_TEST_CARD_NUMBER ?? "",
      expiryMonth: process.env.NEXT_PUBLIC_PORTONE_TEST_EXPIRY_MM ?? "",
      expiryYear: process.env.NEXT_PUBLIC_PORTONE_TEST_EXPIRY_YY ?? "",
      birthOrBizNo: process.env.NEXT_PUBLIC_PORTONE_TEST_BIRTH_OR_BIZ ?? "",
      passwordTwoDigits: "",
      customerName:
        process.env.NEXT_PUBLIC_PORTONE_TEST_CUSTOMER_NAME ?? "테스트 사용자",
      customerEmail:
        process.env.NEXT_PUBLIC_PORTONE_TEST_CUSTOMER_EMAIL ?? "test@test.com",
      customerPhoneNumber:
        process.env.NEXT_PUBLIC_PORTONE_TEST_CUSTOMER_PHONE ?? "01000000000",
    },

    setInicisCard: (patch) =>
      set((s) => ({ ...s, inicisCard: { ...s.inicisCard, ...patch } })),

    setPlanId: (planId) => {
      set(() => ({
        planId,
        payProvider: DEFAULT_PROVIDER,
        couponError: null,
        loading: false,
        error: null,
        completed: false,
        lastAction: null,
        quote: null,
        loadingQuote: false,
        inicisCard: {
          cardNumber: process.env.NEXT_PUBLIC_PORTONE_TEST_CARD_NUMBER ?? "",
          expiryMonth: process.env.NEXT_PUBLIC_PORTONE_TEST_EXPIRY_MM ?? "",
          expiryYear: process.env.NEXT_PUBLIC_PORTONE_TEST_EXPIRY_YY ?? "",
          birthOrBizNo: process.env.NEXT_PUBLIC_PORTONE_TEST_BIRTH_OR_BIZ ?? "",
          passwordTwoDigits: "",
          customerName:
            process.env.NEXT_PUBLIC_PORTONE_TEST_CUSTOMER_NAME ??
            "테스트 사용자",
          customerEmail:
            process.env.NEXT_PUBLIC_PORTONE_TEST_CUSTOMER_EMAIL ??
            "test@test.com",
          customerPhoneNumber:
            process.env.NEXT_PUBLIC_PORTONE_TEST_CUSTOMER_PHONE ??
            "01000000000",
        },
      }));

      if (planId && isPlanId(planId)) {
        get()
          .fetchQuote(planId, get().couponCode)
          .catch(() => {});
      }
    },

    setPayProvider: (payProvider) => set(() => ({ payProvider })),
    setCouponCode: (code) =>
      set(() => ({ couponCode: code, couponError: null })),
    applyCoupon: async () => {
      const { planId, couponCode } = get();
      if (!planId || !isPlanId(planId)) return;
      await get().fetchQuote(planId, couponCode);
    },
    clearCoupon: () => {
      const planId = get().planId;
      set(() => ({
        couponCode: "",
        couponError: null,
      }));
      if (planId && isPlanId(planId)) {
        get()
          .fetchQuote(planId)
          .catch(() => {});
      }
    },

    clearError: () => set((s) => ({ ...s, error: null })),
    reset: () =>
      set(() => ({
        planId: null,
        payProvider: DEFAULT_PROVIDER,
        couponCode: "",
        couponError: null,
        loading: false,
        error: null,
        completed: false,
        lastAction: null,
        summary: null,
        quote: null,
        loadingSummary: false,
        loadingQuote: false,
        inicisCard: {
          cardNumber: process.env.NEXT_PUBLIC_PORTONE_TEST_CARD_NUMBER ?? "",
          expiryMonth: process.env.NEXT_PUBLIC_PORTONE_TEST_EXPIRY_MM ?? "",
          expiryYear: process.env.NEXT_PUBLIC_PORTONE_TEST_EXPIRY_YY ?? "",
          birthOrBizNo: process.env.NEXT_PUBLIC_PORTONE_TEST_BIRTH_OR_BIZ ?? "",
          passwordTwoDigits: "",
          customerName:
            process.env.NEXT_PUBLIC_PORTONE_TEST_CUSTOMER_NAME ??
            "테스트 사용자",
          customerEmail:
            process.env.NEXT_PUBLIC_PORTONE_TEST_CUSTOMER_EMAIL ??
            "test@test.com",
          customerPhoneNumber:
            process.env.NEXT_PUBLIC_PORTONE_TEST_CUSTOMER_PHONE ??
            "01000000000",
        },
      })),

    fetchSummary: async (targetPlanId) => {
      const effectivePlanId =
        targetPlanId && isPlanId(targetPlanId)
          ? targetPlanId
          : get().planId && isPlanId(get().planId)
            ? get().planId
            : null;
      if (!effectivePlanId) {
        set((s) => ({ ...s, summary: null, loadingSummary: false }));
        return;
      }
      if (get().loadingSummary) return;

      const product = getPlanProduct(effectivePlanId);
      if (!product) {
        set((s) => ({ ...s, summary: null, loadingSummary: false }));
        return;
      }

      set((s) => ({ ...s, loadingSummary: true }));

      try {
        const res = await fetch("/api/billing/subscriptions", {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | SubscriptionSummary
          | any;
        const selected = json?.ok ? json?.subscriptions?.[product] : null;

        if (res.ok && json?.ok) {
          if (selected) {
            set((s) => ({
              ...s,
              summary: {
                ok: true,
                team: selected,
                note: "TEAM_SUBSCRIPTION_SUMMARY",
              },
              loadingSummary: false,
            }));
            return;
          }

          set((s) => ({ ...s, summary: null, loadingSummary: false }));
          return;
        }

        set((s) => ({ ...s, summary: null, loadingSummary: false }));
      } catch {
        set((s) => ({ ...s, summary: null, loadingSummary: false }));
      }
    },

    fetchQuote: async (targetPlanId: string, couponCode?: string) => {
      if (!isPlanId(targetPlanId)) {
        set((s) => ({ ...s, quote: null, loadingQuote: false }));
        return;
      }
      if (quoteAbortController) {
        try {
          quoteAbortController.abort("stale_quote_request");
        } catch {
          // ignore
        }
      }
      const ac = new AbortController();
      quoteAbortController = ac;
      set((s) => ({ ...s, loadingQuote: true }));

      try {
        const params = new URLSearchParams({
          targetPlanId: targetPlanId,
        });
        if (couponCode && couponCode.trim()) {
          params.set("couponCode", couponCode.trim());
        }
        const res = await fetch(
          `/api/billing/subscription/quote?${params.toString()}`,
          { cache: "no-store", signal: ac.signal },
        );
        const json = await res.json().catch(() => null);
        if (ac.signal.aborted) return;

        if (res.ok && json?.ok) {
          set((s) => {
            const prev = s.quote ? JSON.stringify(s.quote) : "";
            const next = JSON.stringify(json);
            const hasInput = !!s.couponCode.trim();
            const nextCouponError =
              hasInput && !json?.coupon ? s.couponError : null;
            return {
              ...s,
              quote: prev === next ? s.quote : (json as Quote),
              loadingQuote: false,
              couponError: nextCouponError,
            };
          });
        } else {
          set((s) => ({
            ...s,
            quote: null,
            loadingQuote: false,
            couponError: couponCode?.trim()
              ? json?.message ?? json?.error ?? "COUPON_INVALID"
              : null,
          }));
          if (couponCode && couponCode.trim()) {
            get()
              .fetchQuote(targetPlanId)
              .catch(() => {});
          }
        }
      } catch (e: any) {
        if (ac.signal.aborted) return;
        set((s) => ({ ...s, quote: null, loadingQuote: false }));
      } finally {
        if (quoteAbortController === ac) {
          quoteAbortController = null;
        }
      }
    },

    completeBillingKeyPayment: async ({
      teamId,
      billingKey,
      customer,
      couponCode,
      planId: planIdOverride,
      payProvider: payProviderOverride,
      attemptId: attemptIdOverride,
      checkoutIntentToken,
    }) => {
      const planId = planIdOverride ?? get().planId;
      const payProvider = payProviderOverride ?? get().payProvider;
      const quote = get().quote;
      set((s) => ({ ...s, loading: true, error: null }));

      if (!teamId?.trim()) {
        const msg =
          "팀 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.";
        set((s) => ({ ...s, loading: false, error: msg }));
        toast.error(msg, "결제");
        return { ok: false, error: msg };
      }
      if (!planId || !isPlanId(planId)) {
        const msg = "플랜 정보가 올바르지 않습니다.";
        set((s) => ({ ...s, loading: false, error: msg }));
        toast.error(msg, "결제");
        return { ok: false, error: msg };
      }

      const plan = BILLING_PLANS[planId as PlanId];
      if (!plan) {
        const msg = "플랜을 찾을 수 없습니다.";
        set((s) => ({ ...s, loading: false, error: msg }));
        toast.error(msg, "결제");
        return { ok: false, error: msg };
      }

      const legacyAttempt =
        checkoutIntentToken?.trim()
          ? { key: null as string | null, attemptId: null as string | null }
          : attemptIdOverride?.trim()
            ? {
                key: attemptStorageKey(teamId, planId, payProvider),
                attemptId: attemptIdOverride.trim(),
              }
            : getStoredAttemptId(teamId, planId, payProvider);

      if (!checkoutIntentToken?.trim() && !legacyAttempt.attemptId) {
        const msg = "결제 세션을 찾지 못했습니다. 모바일 링크를 다시 열어주세요.";
        set((s) => ({ ...s, loading: false, error: msg }));
        toast.error(msg, "결제");
        return { ok: false, error: msg };
      }

      let payAmount = 0;
      if (quote?.ok) {
        payAmount = quote.payNowAmountWon;
      } else {
        payAmount = calculateDiscountedPrice(
          plan.monthlyAmountWon,
          plan.promotion,
        );
      }

      const appliedCouponCode = couponCode?.trim() || get().quote?.coupon?.code;
      const doneRes = checkoutIntentToken?.trim()
        ? await fetch("/api/billing/checkout-intents/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: checkoutIntentToken.trim(),
              billingKey,
              customer,
            }),
          })
        : await fetch("/api/portone/payments/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              planId,
              payProvider,
              billingKey,
              customer,
              attemptId: legacyAttempt.attemptId,
              couponCode: appliedCouponCode?.trim() || undefined,
            }),
          });

      const doneJson = (await doneRes.json().catch(() => null)) as any;

      if (!doneRes.ok || !doneJson || doneJson.ok !== true) {
        const msg = doneJson?.error || "SUBSCRIPTION_COMPLETE_FAILED";
        trackGaEvent("checkout_failed", {
          plan_id: planId,
          pay_provider: payProvider,
          stage: "complete",
          error_code: toMsg(msg, "SUBSCRIPTION_COMPLETE_FAILED"),
        });
        const error = toMsg(msg, "SUBSCRIPTION_COMPLETE_FAILED");
        set((s) => ({ ...s, loading: false, error }));
        return { ok: false as const, error };
      }

      const action = doneJson.action ?? doneJson.mode ?? doneJson.status ?? "OK";
      const team = doneJson.team;
      const note = doneJson.note;

      trackGaEvent("checkout_completed", {
        plan_id: planId,
        plan_category: plan.category,
        pay_provider: payProvider,
        amount_won: payAmount,
        result_action: String(action),
        has_coupon: !!appliedCouponCode,
      });

      toast.success(
        note ? `처리 완료: ${note}` : "처리 완료(DB 반영됨)",
        "결제",
      );

      set((s) => ({
        ...s,
        loading: false,
        error: null,
        completed: true,
        lastAction: String(action),
      }));
      if (legacyAttempt.key) {
        clearAttemptId(legacyAttempt.key);
      }

      get()
        .fetchSummary(planId)
        .catch(() => {});
      get()
        .fetchQuote(planId)
        .catch(() => {});

      return { ok: true as const, action, team, note };
    },

    startPayment: async ({ teamId, mobileRedirect, couponCode }) => {
      const { planId, payProvider, completed, quote } = get();

      // --- [1] 초기 유효성 검사 ---
      if (completed) {
        const msg = "이미 결제가 완료되었습니다.";
        toast.info(msg, "결제");
        return { ok: false, error: msg };
      }
      if (!teamId?.trim()) {
        const msg =
          "팀 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.";
        toast.error(msg, "결제");
        return { ok: false, error: msg };
      }
      if (!planId || !isPlanId(planId)) {
        const msg = "플랜 정보가 올바르지 않습니다.";
        set((s) => ({ ...s, error: msg }));
        toast.error(msg, "결제");
        return { ok: false, error: msg };
      }

      const plan = BILLING_PLANS[planId as PlanId];
      if (!plan) {
        const msg = "플랜을 찾을 수 없습니다.";
        set((s) => ({ ...s, error: msg }));
        toast.error(msg, "결제");
        return { ok: false, error: msg };
      }

      const opt = PAY_PROVIDER_OPTIONS.find((p) => p.id === payProvider);
      if (!opt?.enabled) {
        const msg = "현재 준비 중인 결제수단입니다.";
        set((s) => ({ ...s, error: msg }));
        toast.info(msg, "결제");
        return { ok: false, error: msg };
      }

      // --- [2] 결제 금액 계산 (수정됨) ---
      // 견적(quote)이 있다면 견적 금액(차액)을, 없다면 플랜 기본 금액을 사용
      let payAmount = 0;
      if (quote?.ok) {
        payAmount = quote.payNowAmountWon;
      } else {
        payAmount = calculateDiscountedPrice(
          plan.monthlyAmountWon,
          plan.promotion,
        );
      }

      trackGaEvent("checkout_started", {
        plan_id: planId,
        plan_category: plan.category,
        pay_provider: payProvider,
        amount_won: payAmount,
        quote_action: quote?.ok ? quote.action : "PAY_NOW",
        has_coupon: !!quote?.coupon,
      });

      set((s) => ({ ...s, loading: true, error: null }));

      let checkoutIntentToken: string | null = null;
      const markCheckoutIntentFailed = async (message: string) => {
        if (!checkoutIntentToken) return;
        try {
          await fetch("/api/billing/checkout-intents/fail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: checkoutIntentToken, message }),
          });
        } catch {
          // best effort only
        }
      };

      try {
        const intentRes = await fetch("/api/billing/checkout-intents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId,
            payProvider,
            couponCode: couponCode?.trim() || undefined,
          }),
        });
        const intentJson = (await intentRes.json().catch(() => null)) as any;
        if (!intentRes.ok || !intentJson?.ok || !intentJson?.token) {
          const msg = toMsg(
            intentJson?.message ?? intentJson?.error,
            "CHECKOUT_INTENT_CREATE_FAILED",
          );
          trackGaEvent("checkout_failed", {
            plan_id: planId,
            pay_provider: payProvider,
            stage: "intent",
            error_code: msg,
          });
          set((s) => ({ ...s, loading: false, error: msg }));
          toast.error(msg, "결제");
          return { ok: false, error: msg };
        }
        checkoutIntentToken = String(intentJson.token);

        // --- [4] 결제 준비 (서버에서 channelKey, issueId 등 발급) ---
        const prepRes = await fetch("/api/billing/checkout-intents/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: checkoutIntentToken }),
        });

        const prepJsonUnknown = (await prepRes
          .json()
          .catch(() => null)) as unknown;

        if (!prepRes.ok || !isPrepareBillingKeyOk(prepJsonUnknown)) {
          const fallback = !prepRes.ok
            ? "PREPARE_HTTP_ERROR"
            : "PREPARE_FAILED";
          const msg =
            prepJsonUnknown &&
            typeof prepJsonUnknown === "object" &&
            "error" in prepJsonUnknown
              ? (prepJsonUnknown as any).error
              : fallback;
          const msgStr = toMsg(msg, fallback);
          trackGaEvent("checkout_failed", {
            plan_id: planId,
            pay_provider: payProvider,
            stage: "prepare",
            error_code: msgStr,
          });
          await markCheckoutIntentFailed(msgStr);
          set((s) => ({ ...s, loading: false, error: msgStr }));
          toast.error(msgStr, "결제");
          return { ok: false, error: msgStr };
        }

        const prepJson = prepJsonUnknown;

        // --- [5] PortOne 요청 파라미터 구성 ---
        // 5-1. 정기결제 주기 설정
        let offerPeriod: { interval: string } | undefined;
        if (plan.quotaPeriod === "MONTHLY") offerPeriod = { interval: "1m" };
        else if (plan.quotaPeriod === "YEARLY")
          offerPeriod = { interval: "1y" };

        // 5-2. 공통 요청 데이터
        const baseRequest = {
          storeId: prepJson.storeId,
          channelKey: prepJson.channelKey,
          issueId: prepJson.issueId,
          issueName: prepJson.issueName || `${plan.name} 정기결제 등록`,
          displayAmount: payAmount, // ✅ 수정된 결제 금액 적용
          currency: "KRW" as PortOne.Currency,
          customer: prepJson.customer,
          customData: prepJson.customData,
          redirectUrl: prepJson.redirectUrl,
          windowType: prepJson.windowType ?? {
            pc: "IFRAME",
            mobile: "REDIRECTION",
          },
          locale: "KO_KR" as const,
          offerPeriod: offerPeriod,
          productType: "DIGITAL" as const,
        };

        let issueReq: PortOne.IssueBillingKeyRequest;

        // [3] Provider별 분기 처리
        switch (payProvider) {
          case "kakaopay":
            issueReq = {
              ...baseRequest,
              billingKeyMethod: "EASY_PAY",
              easyPay: {
                easyPayProvider: "KAKAOPAY",
              },
            };
            break;

          case "inicis":
            issueReq = {
              ...baseRequest,
              billingKeyMethod: "CARD",
              card: {
                // 필요 시 카드사 코드 지정 가능
              },
            };
            break;

          default:
            const msg = `지원하지 않는 결제수단입니다: ${payProvider}`;
            await markCheckoutIntentFailed(msg);
            set((s) => ({ ...s, loading: false, error: msg }));
            toast.error(msg, "결제");
            return { ok: false, error: msg };
        }

        // --- [6] PortOne SDK 호출 ---
        const result = await PortOne.requestIssueBillingKey(issueReq);

        // --- [7] 결과 처리 ---
        if (!result) {
          const expectsRedirect =
            !!mobileRedirect &&
            (prepJson.windowType?.mobile ?? "REDIRECTION") === "REDIRECTION";
          if (expectsRedirect) {
            set((s) => ({ ...s, loading: false }));
            return { ok: true, redirected: true };
          }
          trackGaEvent("checkout_canceled", {
            plan_id: planId,
            pay_provider: payProvider,
            stage: "sdk_result_missing",
          });
          await markCheckoutIntentFailed("PAYMENT_CLOSED");
          set((s) => ({ ...s, loading: false }));
          toast.info("결제가 취소되었습니다 (No result).", "결제");
          return { ok: false, error: "PAYMENT_CLOSED" };
        }

        if (result.code != null) {
          // 결제 실패 또는 사용자 취소
          if (
            result.code === "FAILURE_TYPE_PG" ||
            result.code === "USER_CANCEL"
          ) {
            trackGaEvent("checkout_canceled", {
              plan_id: planId,
              pay_provider: payProvider,
              stage: "sdk",
              error_code: result.code,
            });
            await markCheckoutIntentFailed(String(result.code));
            set((s) => ({ ...s, loading: false }));
            toast.info("결제가 취소되었습니다.", "결제");
            return { ok: false, error: "PAYMENT_CANCELED" };
          }
          const msg =
            result.message ?? result.code ?? "BILLING_KEY_ISSUE_FAILED";
          trackGaEvent("checkout_failed", {
            plan_id: planId,
            pay_provider: payProvider,
            stage: "sdk",
            error_code: typeof result.code === "string" ? result.code : msg,
          });
          await markCheckoutIntentFailed(msg);
          set((s) => ({ ...s, loading: false, error: msg }));
          toast.error(msg, "결제");
          return { ok: false, error: msg };
        }

        // --- [8] 성공 시 서버 최종 승인 요청 ---
        const done = await get().completeBillingKeyPayment({
          teamId,
          billingKey: result.billingKey,
          customer: prepJson.customer,
          checkoutIntentToken,
        });

        if (!done.ok) return { ok: false, error: done.error };
        return { ok: true, action: done.action, team: done.team };
      } catch (e: any) {
        const msg = e?.message ?? "결제 시작 실패";
        trackGaEvent("checkout_failed", {
          plan_id: planId,
          pay_provider: payProvider,
          stage: "exception",
          error_code: msg,
        });
        set((s) => ({ ...s, loading: false, error: msg }));
        toast.error(msg, "결제");
        return { ok: false, error: msg };
      }
    },
  }),
);
