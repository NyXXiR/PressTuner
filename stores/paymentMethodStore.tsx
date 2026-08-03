"use client";

import { create } from "zustand";
import * as PortOne from "@portone/browser-sdk/v2";

import type { PayProvider } from "@/config/billing/options";
import { PAY_PROVIDER_OPTIONS } from "@/config/billing/options";
import { toast } from "@/stores/toastStore";

type PrepareBillingKeyOk = {
  ok: true;
  kind: "BILLING_KEY_ISSUE";
  storeId: string;
  channelGroupId: string | null;
  channelKey: string | null;

  billingKeyMethod: "CARD" | "EASY_PAY" | "MOBILE" | "PAYPAL";
  issueId?: string;
  issueName?: string;

  customer?: any;
  customData?: any;
  redirectUrl?: string;
  windowType?: any;
};

type PrepareFail = { ok: false; error?: any };

type IssueBillingKeySuccess = {
  transactionType: "ISSUE_BILLING_KEY";
  billingKey: string;
  billingIssueToken?: string;
};
type IssueBillingKeyFail = {
  code?: string;
  message?: string;
  pgCode?: string;
  pgMessage?: string;
};

function isIssueBillingKeySuccess(v: any): v is IssueBillingKeySuccess {
  return (
    !!v &&
    typeof v === "object" &&
    v.transactionType === "ISSUE_BILLING_KEY" &&
    typeof v.billingKey === "string" &&
    !!v.billingKey.trim()
  );
}

function isUserCancelled(v: any) {
  const code = typeof v?.code === "string" ? v.code : "";
  const msg = typeof v?.message === "string" ? v.message : "";
  return /CANCEL|CANCELED|CLOSED|USER/i.test(code) || /취소|닫/i.test(msg);
}

function toMsg(v: any, fallback: string) {
  if (!v) return fallback;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}

function isMobileRedirectContext() {
  if (typeof window === "undefined") return false;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = window.innerWidth < 768;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(
    window.navigator.userAgent,
  );
  return mobileUserAgent || (coarsePointer && narrowViewport);
}

/** ✅ Prepare 응답 타입가드 (이게 있어야 TS가 channelKey 접근을 허용함) */
function isPrepareBillingKeyOk(v: any): v is PrepareBillingKeyOk {
  return (
    !!v &&
    typeof v === "object" &&
    v.ok === true &&
    v.kind === "BILLING_KEY_ISSUE" &&
    typeof v.storeId === "string"
  );
}

export type ChangePaymentMethodResult =
  | {
      ok: true;
      team?: any;
      recovered?: boolean;
      redirected?: boolean;
      note?: string | null;
    }
  | {
      ok: false;
      error: string;
      paymentMethodAttached?: boolean;
      team?: any;
      recoveryError?: string | null;
    };

type PaymentMethodStore = {
  payProvider: PayProvider;
  loading: boolean;
  error: string | null;

  setPayProvider: (payProvider: PayProvider) => void;

  clearError: () => void;

  changePaymentMethod: (ctx: {
    teamId: string;
    recoverPastDue?: boolean;
    surface?: "press" | "resume";
  }) => Promise<ChangePaymentMethodResult>;
};

const DEFAULT_PROVIDER: PayProvider = "inicis";

export const usePaymentMethodStore = create<PaymentMethodStore>()(
  (set, get) => ({
    payProvider: DEFAULT_PROVIDER,
    loading: false,
    error: null,

    setPayProvider: (payProvider) => set(() => ({ payProvider })),

    clearError: () => set((s) => ({ ...s, error: null })),

    changePaymentMethod: async ({ teamId, recoverPastDue, surface }) => {
      const { payProvider } = get();

      if (!teamId?.trim()) {
        const msg =
          "팀 정보를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.";
        toast.error(msg, "결제수단 변경");
        return { ok: false, error: msg };
      }
      const product = surface === "resume" ? "CAREER" : "PRESS";

      const opt = PAY_PROVIDER_OPTIONS.find((p) => p.id === payProvider);
      if (!opt?.enabled) {
        const msg = "현재 준비 중인 결제수단입니다.";
        toast.info(msg, "결제수단 변경");
        return { ok: false, error: msg };
      }

      set((s) => ({ ...s, loading: true, error: null }));

      async function attach(billingKey: string) {
        const res = await fetch("/api/billing/payment-method/attach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payProvider,
            billingKey,
            recoverPastDue,
            product,
          }),
        });

        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          const msg = json?.message ?? json?.error ?? "PAYMENT_METHOD_ATTACH_FAILED";
          return {
            ok: false as const,
            error: toMsg(msg, "PAYMENT_METHOD_ATTACH_FAILED"),
            paymentMethodAttached: json?.paymentMethodAttached === true,
            team: json?.team,
            recoveryError:
              typeof json?.recoveryError === "string" ? json.recoveryError : null,
          };
        }

        const recovered = json?.recovered === true;
        toast.success(
          recovered ? "결제 복구가 완료되었습니다." : "결제수단이 변경되었습니다.",
          recovered ? "구독 복구" : "결제수단 변경",
        );
        return {
          ok: true as const,
          team: json.team,
          recovered,
          note: typeof json?.note === "string" ? json.note : null,
        };
      }

      try {
        if (payProvider === "inicis" || payProvider === "kakaopay") {
          const prepRes = await fetch("/api/portone/billing-keys/prepare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              payProvider,
              recoverPastDue,
              surface: surface ?? "press",
              product,
            }),
          });

          const prepAny = await prepRes.json().catch(() => null);

          // ✅ 여기서부터는 타입가드로 PrepareBillingKeyOk 확정
          if (!prepRes.ok || !isPrepareBillingKeyOk(prepAny)) {
            const msg =
              (prepAny as PrepareFail | null)?.error ?? "PREPARE_FAILED";
            const msgStr = toMsg(msg, "PREPARE_FAILED");
            set((s) => ({ ...s, loading: false, error: msgStr }));
            toast.error(msgStr, "결제수단 변경");
            return { ok: false, error: msgStr };
          }

          const prepJson = prepAny; // ✅ PrepareBillingKeyOk 로 확정

          const channelGroupId =
            typeof prepJson.channelGroupId === "string" &&
            prepJson.channelGroupId.trim()
              ? prepJson.channelGroupId.trim()
              : undefined;

          const channelKey =
            typeof prepJson.channelKey === "string" &&
            prepJson.channelKey.trim()
              ? prepJson.channelKey.trim()
              : undefined;

          const issueReq: any = {
            storeId: prepJson.storeId,
            channelKey,
            channelGroupId,

            billingKeyMethod: prepJson.billingKeyMethod,
            issueId: prepJson.issueId,
            issueName: prepJson.issueName,

            customer: prepJson.customer,
            customData: prepJson.customData,
            redirectUrl: prepJson.redirectUrl,
            windowType: prepJson.windowType ?? {
              pc: "IFRAME",
              mobile: "REDIRECTION",
            },
          };

          if (payProvider === "kakaopay") {
            issueReq.easyPay = { easyPayProvider: "KAKAOPAY" };
          } else {
            issueReq.card = {};
          }

          const result = await PortOne.requestIssueBillingKey(issueReq);

          if (!result) {
            const expectsRedirect =
              isMobileRedirectContext() &&
              (prepJson.windowType?.mobile ?? "REDIRECTION") === "REDIRECTION";
            if (expectsRedirect) {
              set((s) => ({ ...s, loading: false }));
              return { ok: true, redirected: true };
            }
            set((s) => ({ ...s, loading: false }));
            toast.info("결제가 취소되었습니다.", "결제수단 변경");
            return { ok: false, error: "PAYMENT_CLOSED" };
          }

          if (!isIssueBillingKeySuccess(result)) {
            if (isUserCancelled(result)) {
              set((s) => ({ ...s, loading: false }));
              toast.info("결제가 취소되었습니다.", "결제수단 변경");
              return { ok: false, error: "PAYMENT_CANCELED" };
            }

            const r = result as IssueBillingKeyFail;
            const msg = r.message ?? r.code ?? "BILLING_KEY_ISSUE_FAILED";
            set((s) => ({ ...s, loading: false, error: msg }));
            toast.error(msg, "결제수단 변경");
            return { ok: false, error: msg };
          }

          const done = await attach(result.billingKey);

          set((s) => ({
            ...s,
            loading: false,
            error: done.ok ? null : done.error,
          }));
          if (!done.ok) {
            if (done.paymentMethodAttached) {
              toast.error(
                done.recoveryError
                  ? `결제수단은 변경되었지만 복구 결제는 실패했습니다: ${done.recoveryError}`
                  : "결제수단은 변경되었지만 복구 결제는 실패했습니다.",
                "구독 복구",
              );
            }
            return done;
          }
          return done;
        }

        const msg = "지원하지 않는 결제수단입니다.";
        set((s) => ({ ...s, loading: false, error: msg }));
        toast.info(msg, "결제수단 변경");
        return { ok: false, error: msg };
      } catch (e: any) {
        const msg = e?.message ?? "결제수단 변경 실패";
        set((s) => ({ ...s, loading: false, error: msg }));
        toast.error(msg, "결제수단 변경");
        return { ok: false, error: msg };
      }
    },
  }),
);
