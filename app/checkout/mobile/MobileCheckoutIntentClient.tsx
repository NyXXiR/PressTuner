"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as PortOne from "@portone/browser-sdk/v2";
import { CircleAlert, CreditCard, ShieldCheck, Smartphone } from "lucide-react";

import { BILLING_PLANS, isPlanId } from "@/config/billing/plans";
import { parseBillingCheckoutRedirect } from "@/domain/billing/portone/billingCheckoutRedirect";

type CheckoutIntentStatus = {
  id: string;
  teamId: string;
  teamName: string;
  planId: string;
  planName: string;
  planMonthlyAmountWon: number;
  payProvider: "inicis" | "kakaopay";
  couponCode: string | null;
  status:
    | "OPEN"
    | "OPENED"
    | "BILLING_KEY_ISSUED"
    | "COMPLETED"
    | "EXPIRED"
    | "FAILED";
  lastError: string | null;
  openedAt: string | null;
  billingKeyIssuedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

type PrepareBillingKeyOk = {
  ok: true;
  kind: "BILLING_KEY_ISSUE";
  storeId: string;
  channelKey: string;
  issueId?: string;
  issueName?: string;
  customer?: {
    fullName?: string;
    phoneNumber?: string;
    email?: string;
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
    typeof o.storeId === "string" &&
    typeof o.channelKey === "string"
  );
}

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function getIntentCardCopy(args: {
  intent: CheckoutIntentStatus;
  isCompleted: boolean;
  isExpired: boolean;
  hasError: boolean;
  processing: boolean;
}) {
  if (args.isCompleted) {
    return {
      title: "등록과 첫 결제가 완료되었습니다",
      body: "PC checkout 화면이 자동으로 갱신됩니다. 그대로 두셔도 됩니다.",
      buttonLabel: "완료됨",
    };
  }

  if (args.isExpired) {
    return {
      title: "결제 링크가 만료되었습니다",
      body: "PC에서 checkout을 다시 열어 새 QR 링크를 생성해 주세요.",
      buttonLabel: "다시 생성 필요",
    };
  }

  if (args.processing) {
    return {
      title: "카드 등록 결과를 확인하고 있습니다",
      body: "화면을 닫지 말고 잠시만 기다려 주세요. 등록이 끝나면 첫 결제를 바로 처리합니다.",
      buttonLabel: "처리 중...",
    };
  }

  if (args.intent.status === "FAILED" || args.hasError) {
    return {
      title: "카드 등록 중 문제가 발생했습니다",
      body: "아래 버튼으로 다시 시도할 수 있습니다. 같은 문제가 반복되면 PC에서 새 QR 링크를 다시 열어 주세요.",
      buttonLabel: "카드 등록 다시 시작",
    };
  }

  return {
    title: "카드 등록을 시작할 준비가 되었습니다",
    body: "버튼을 누르면 이니시스 카드 등록창으로 이동하고, 완료 후 이 페이지로 자동 복귀합니다.",
    buttonLabel: "카드 등록 시작",
  };
}

export default function MobileCheckoutIntentClient({
  intentToken,
}: {
  intentToken: string;
}) {
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [intent, setIntent] = useState<CheckoutIntentStatus | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [modalMessage, setModalMessage] = useState<string | null>(null);

  const openMarkedRef = useRef(false);
  const redirectHandledRef = useRef(false);
  const failureMarkedRef = useRef<string | null>(null);
  const cleanedRedirectUrlRef = useRef(false);

  const redirectResult = useMemo(() => {
    if (typeof window === "undefined") {
      return parseBillingCheckoutRedirect(new URLSearchParams());
    }
    return parseBillingCheckoutRedirect(new URLSearchParams(window.location.search));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!intentToken.trim()) return;
    if (!redirectResult.hasResult) return;
    if (cleanedRedirectUrlRef.current) return;

    cleanedRedirectUrlRef.current = true;
    window.history.replaceState(
      {},
      "",
      `/checkout/mobile?intent=${encodeURIComponent(intentToken)}`,
    );
  }, [intentToken, redirectResult.hasResult]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = window.navigator.userAgent || "";
    setIsMobileDevice(
      /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua),
    );
  }, []);

  async function fetchStatus() {
    if (!intentToken.trim()) {
      setErrorText("유효하지 않은 결제 링크입니다.");
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/billing/checkout-intents/status?token=${encodeURIComponent(intentToken)}`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.intent) {
        setErrorText(json?.message ?? json?.error ?? "결제 링크를 불러오지 못했습니다.");
        setLoading(false);
        return;
      }
      setIntent(json.intent as CheckoutIntentStatus);
      setErrorText(null);
    } catch {
      setErrorText("결제 링크를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus().catch(() => {});
  }, [intentToken]);

  useEffect(() => {
    if (!intentToken.trim()) return;
    if (openMarkedRef.current) return;
    openMarkedRef.current = true;

    fetch("/api/billing/checkout-intents/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: intentToken }),
    })
      .then((res) => res.json().catch(() => null))
      .then((json) => {
        if (json?.ok && json.intent) {
          setIntent(json.intent as CheckoutIntentStatus);
        }
      })
      .catch(() => {});
  }, [intentToken]);

  async function markFailed(message: string) {
    const next = message.trim() || "CHECKOUT_INTENT_FAILED";
    if (failureMarkedRef.current === next) return;
    failureMarkedRef.current = next;

    try {
      const res = await fetch("/api/billing/checkout-intents/fail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: intentToken, message: next }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && json.intent) {
        setIntent(json.intent as CheckoutIntentStatus);
      }
    } catch {
      // ignore
    }
  }

  async function completeWithBillingKey(billingKey: string) {
    setProcessing(true);
    setNotice("카드 등록을 확인하고 첫 결제를 완료하고 있습니다...");

    try {
      const res = await fetch("/api/billing/checkout-intents/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: intentToken, billingKey }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        const message =
          json?.message ?? json?.error ?? "첫 결제 완료 처리에 실패했습니다.";
        setNotice(message);
        setErrorText(message);
        setModalMessage(message);
        await markFailed(message);
        return;
      }

      setNotice("카드 등록과 첫 결제가 완료되었습니다. PC 화면이 곧 갱신됩니다.");
      await fetchStatus();
    } catch {
      const message = "첫 결제 완료 처리에 실패했습니다.";
      setNotice(message);
      setErrorText(message);
      setModalMessage(message);
      await markFailed(message);
    } finally {
      setProcessing(false);
    }
  }

  useEffect(() => {
    if (!intentToken.trim()) return;
    if (!redirectResult.hasResult) return;
    if (redirectHandledRef.current) return;
    redirectHandledRef.current = true;

    if (redirectResult.code || !redirectResult.billingKey) {
      const message =
        redirectResult.pgMessage ??
        redirectResult.message ??
        redirectResult.code ??
        "빌링키 발급에 실패했습니다.";
      setNotice(message);
      setErrorText(message);
      setModalMessage(message);
      markFailed(message).catch(() => {});
      return;
    }

    completeWithBillingKey(redirectResult.billingKey).catch(() => {});
  }, [
    intentToken,
    redirectResult.billingKey,
    redirectResult.code,
    redirectResult.hasResult,
    redirectResult.message,
    redirectResult.pgMessage,
  ]);

  async function startRegistration() {
    if (!intentToken.trim() || !intent) return;
    setProcessing(true);
    setErrorText(null);
    setNotice(null);
    setModalMessage(null);

    try {
      const prepRes = await fetch("/api/billing/checkout-intents/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: intentToken }),
      });
      const prepJsonUnknown = (await prepRes.json().catch(() => null)) as unknown;

      if (!prepRes.ok || !isPrepareBillingKeyOk(prepJsonUnknown)) {
        const message =
          prepJsonUnknown &&
          typeof prepJsonUnknown === "object" &&
          "message" in prepJsonUnknown
            ? String((prepJsonUnknown as any).message)
            : "결제창 준비에 실패했습니다.";
        setErrorText(message);
        setNotice(message);
        setModalMessage(message);
        await markFailed(message);
        return;
      }

      const prep = prepJsonUnknown;
      let offerPeriod: { interval: string } | undefined;
      if (isPlanId(intent.planId)) {
        const plan = BILLING_PLANS[intent.planId];
        if (plan.quotaPeriod === "MONTHLY") offerPeriod = { interval: "1m" };
        else if (plan.quotaPeriod === "YEARLY") offerPeriod = { interval: "1y" };
      }

      const baseRequest = {
        storeId: prep.storeId,
        channelKey: prep.channelKey,
        issueId: prep.issueId,
        issueName: prep.issueName ?? `${intent.planName} 카드 등록`,
        displayAmount: intent.planMonthlyAmountWon,
        currency: "KRW" as PortOne.Currency,
        customer: prep.customer,
        customData: prep.customData,
        redirectUrl: prep.redirectUrl,
        windowType: prep.windowType ?? {
          pc: "IFRAME",
          mobile: "REDIRECTION",
        },
        locale: "KO_KR" as const,
        offerPeriod,
        productType: "DIGITAL" as const,
      };

      const issueReq: PortOne.IssueBillingKeyRequest =
        intent.payProvider === "kakaopay"
          ? {
              ...baseRequest,
              billingKeyMethod: "EASY_PAY",
              easyPay: { easyPayProvider: "KAKAOPAY" },
            }
          : {
              ...baseRequest,
              billingKeyMethod: "CARD",
              card: {},
            };

      const result = await PortOne.requestIssueBillingKey(issueReq);
      if (!result) {
        setNotice("카드 등록창으로 이동 중입니다...");
        return;
      }

      if (result.code || !result.billingKey) {
        const message =
          result.pgMessage ??
          result.message ??
          result.code ??
          "빌링키 발급에 실패했습니다.";
        setNotice(message);
        setErrorText(message);
        setModalMessage(message);
        await markFailed(message);
        return;
      }

      await completeWithBillingKey(result.billingKey);
    } catch (error: any) {
      const message = error?.message ?? "카드 등록을 시작하지 못했습니다.";
      setNotice(message);
      setErrorText(message);
      setModalMessage(message);
      await markFailed(message);
    } finally {
      setProcessing(false);
    }
  }

  const isCompleted = intent?.status === "COMPLETED";
  const isExpired = intent?.status === "EXPIRED";
  const cardCopy = intent
    ? getIntentCardCopy({
        intent,
        isCompleted,
        isExpired,
        hasError: !!errorText,
        processing,
      })
    : null;
  const canStart =
    !!intent &&
    !processing &&
    !loading &&
    !isCompleted &&
    !isExpired &&
    isMobileDevice;

  return (
    <main className="mx-auto min-h-[calc(100vh-72px)] w-full max-w-xl px-4 py-8 sm:px-6">
      <section className="overflow-hidden border border-slate-200 bg-[linear-gradient(145deg,#ffffff_0%,#f8fafc_48%,#ecfeff_100%)]">
        <div className="border-b border-slate-200/80 px-6 py-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold tracking-[0.14em] text-white uppercase">
            <Smartphone className="h-3.5 w-3.5" />
            Mobile Billing
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950">
            휴대폰에서 카드 등록을 이어갑니다
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            로그인 없이 이 링크에 담긴 1회용 결제 권한으로 카드 등록을 진행합니다.
            등록이 끝나면 첫 결제까지 자동으로 완료됩니다.
          </p>
        </div>

        <div className="px-6 py-6">
          {loading ? (
            <div className="space-y-3">
              <div className="h-5 w-36 animate-pulse rounded bg-slate-200" />
              <div className="h-24 animate-pulse bg-slate-100" />
            </div>
          ) : errorText && !intent ? (
            <div className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {errorText}
            </div>
          ) : intent ? (
            <>
              <div className="grid gap-3">
                <div className="border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Team
                  </div>
                  <div className="mt-2 text-base font-semibold text-slate-950">
                    {intent.teamName}
                  </div>
                </div>
                <div className="border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    Plan
                  </div>
                  <div className="mt-2 text-base font-semibold text-slate-950">
                    {intent.planName}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {intent.payProvider === "inicis"
                      ? "이니시스 카드 자동결제 등록"
                      : "간편결제 자동결제 등록"}
                  </div>
                </div>
              </div>

              {!isMobileDevice ? (
                <div className="mt-4 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  이 페이지는 휴대폰에서만 결제를 시작할 수 있습니다. QR을 스캔한 휴대폰
                  브라우저에서 다시 열어 주세요.
                </div>
              ) : null}

              {notice && !errorText ? (
                <div className="mt-4 border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-900">
                  {notice}
                </div>
              ) : null}

              <div className="mt-4 border border-slate-200 bg-slate-950 p-5 text-white">
                <div className="flex items-start gap-3">
                  <div className="bg-white/10 p-3">
                    {isCompleted ? (
                      <ShieldCheck className="h-5 w-5" />
                    ) : (
                      <CreditCard className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-base font-semibold">
                      {isCompleted
                        ? "등록과 첫 결제가 완료되었습니다"
                        : isExpired
                          ? "결제 링크가 만료되었습니다"
                          : intent.status === "FAILED"
                            ? "다시 카드 등록을 시도할 수 있습니다"
                            : "카드 등록을 시작할 준비가 되었습니다"}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-white/70">
                      {isCompleted
                        ? "PC checkout 화면이 자동으로 갱신됩니다. 그대로 두셔도 됩니다."
                        : isExpired
                          ? "PC에서 checkout을 다시 열어 새 QR 링크를 생성해 주세요."
                          : "버튼을 누르면 이니시스 카드 등록창으로 이동하고, 완료 후 이 페이지로 자동 복귀합니다."}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canStart}
                  onClick={startRegistration}
                  className={cn(
                    "mt-5 inline-flex h-12 w-full items-center justify-center text-sm font-semibold transition",
                    "bg-white text-slate-950 hover:bg-slate-100",
                    !canStart && "cursor-not-allowed opacity-40",
                  )}
                >
                  {cardCopy?.buttonLabel ?? "카드 등록 시작"}
                </button>
              </div>

              <div className="mt-4 flex items-start gap-2 border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p>
                  이 결제 링크는 한 번의 checkout 세션에만 연결됩니다. 완료 후에는
                  재사용되지 않으며, 만료되면 PC에서 다시 생성해야 합니다.
                </p>
              </div>
            </>
          ) : null}
        </div>
      </section>

      {modalMessage && intent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4">
          <div className="w-full max-w-sm bg-white p-5 shadow-[0_28px_70px_-36px_rgba(15,23,42,0.75)]">
            <div className="flex items-start gap-3">
              <div className="bg-rose-50 p-3 text-rose-600">
                <CircleAlert className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold text-slate-950">
                  카드 등록 중 문제가 발생했습니다
                </div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {modalMessage}
                </p>
              </div>
            </div>

            <div className="mt-4 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
              {isExpired
                ? "이 링크는 다시 사용할 수 없습니다. PC checkout에서 새 QR 링크를 열어 주세요."
                : "같은 링크에서 다시 카드 등록을 시도할 수 있습니다. 문제가 반복되면 PC에서 새 QR 링크를 생성해 주세요."}
            </div>

            <div className="mt-5 flex gap-2">
              {!isExpired && canStart ? (
                <button
                  type="button"
                  onClick={() => {
                    void startRegistration();
                  }}
                  className="inline-flex h-11 flex-1 items-center justify-center bg-slate-950 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  다시 시도
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setModalMessage(null)}
                className="inline-flex h-11 flex-1 items-center justify-center border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
