"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PAY_PROVIDER_OPTIONS } from "@/config/billing/options";
import { evaluateSubscriptionLifecycle } from "@/domain/billing/subscription/lifecycleMatrix";
import { usePaymentMethodStore } from "@/stores/paymentMethodStore";

function cn(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type SubscriptionTeam = {
  id: string;
  plan: "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
  membershipStatus: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  payProvider: "INICIS" | "KAKAOPAY" | null;
  hasBillingKey: boolean;
};

export default function PaymentMethodClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const surface = searchParams.get("surface") === "resume" ? "resume" : "press";
  const myHref = `/my?surface=${surface}`;
  const product = surface === "resume" ? "CAREER" : "PRESS";

  const payProvider = usePaymentMethodStore((s) => s.payProvider);
  const setPayProvider = usePaymentMethodStore((s) => s.setPayProvider);

  const loading = usePaymentMethodStore((s) => s.loading);
  const changePaymentMethod = usePaymentMethodStore(
    (s) => s.changePaymentMethod
  );

  const [team, setTeam] = useState<SubscriptionTeam | null>(null);
  const [loadingTeam, setLoadingTeam] = useState(false);

  // ✅ 팀 정보(=teamId) 가져오기
  useEffect(() => {
    let alive = true;
    setLoadingTeam(true);
    (async () => {
      try {
        const res = await fetch(`/api/billing/subscriptions?product=${product}`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        const selected = json?.ok ? json?.subscriptions?.[product] : null;
        if (res.ok && selected?.id) setTeam(selected as SubscriptionTeam);
        else setTeam(null);
      } finally {
        if (alive) setLoadingTeam(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const canChange = useMemo(() => {
    if (loadingTeam || loading) return false;
    if (!team) return false;
    return evaluateSubscriptionLifecycle(
      {
        plan: team.plan,
        membershipStatus: team.membershipStatus,
        payProvider: team.payProvider,
        hasBillingKey: team.hasBillingKey,
      },
      { isAdmin: true },
    ).actions.changePaymentMethod.allowed;
  }, [team, loadingTeam, loading]);
  const isPastDue = team?.membershipStatus === "PAST_DUE";

  async function onClickChange() {
    if (!team?.id) return;
    const r = await changePaymentMethod({
      teamId: team.id,
      recoverPastDue: isPastDue,
      surface,
    });
    if (!r.ok) return;
    if (r.redirected) return;

    router.push(myHref);
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <button
        onClick={() => router.push(myHref)}
        className="group mb-6 flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="mr-1 h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        마이페이지로 돌아가기
      </button>

      <h1 className="text-2xl font-semibold">결제수단 변경</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {isPastDue
          ? "미납 상태를 복구하려면 새 결제수단을 등록한 뒤 즉시 복구 결제를 완료해야 합니다."
          : "자동결제에 사용할 결제수단(빌링키)을 새로 등록합니다. 구독 플랜과 만료일은 그대로 유지됩니다."}
      </p>

      <section className="mt-4 border border-border bg-card p-5">
        <div className="text-sm font-semibold">현재 팀 상태</div>
        {loadingTeam ? (
          <div className="mt-2 text-xs text-muted-foreground">불러오는 중…</div>
        ) : team ? (
          <div className="mt-2 text-sm text-muted-foreground space-y-1">
            <div>
              플랜:{" "}
              <span className="text-foreground font-medium">{team.plan}</span>
            </div>
            <div>
              상태:{" "}
              <span className="text-foreground font-medium">
                {team.membershipStatus}
              </span>
            </div>
            <div>
              현재 결제수단:{" "}
              <span className="text-foreground font-medium">
                {team.payProvider ?? "—"}
              </span>
            </div>
            <div>
              빌링키:{" "}
              <span className="text-foreground font-medium">
                {team.hasBillingKey ? "등록됨" : "없음"}
              </span>
            </div>
            {isPastDue ? (
              <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                미납 상태입니다. 새 결제수단을 등록하면 현재 구독을 유지할 수 있도록
                즉시 복구 결제를 시도합니다.
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-2 text-xs text-red-300">
            팀 정보를 불러오지 못했습니다.
          </div>
        )}
      </section>

      <div className="mt-6 space-y-4">
        <div className="border border-border bg-card p-5">
          <div className="text-sm font-semibold">새 결제수단 선택</div>
          <div className="mt-3 grid gap-2">
            {PAY_PROVIDER_OPTIONS.map((opt) => {
              const disabled = !opt.enabled;
              return (
                <label
                  key={opt.id}
                  className={cn(
                    "flex items-center gap-2 border p-3 transition",
                    "border-border hover:bg-muted",
                    payProvider === opt.id && "ring-1 ring-ring/30",
                    disabled && "opacity-60"
                  )}
                >
                  <input
                    type="radio"
                    name="payProvider"
                    disabled={disabled || loading}
                    checked={payProvider === opt.id}
                    onChange={() => setPayProvider(opt.id)}
                  />
                  <div className="text-sm">
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {opt.description}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            * 카드 정보는 Presstuner 서버에 입력하거나 저장하지 않습니다. 선택한 결제사의
            보안창에서 빌링키를 발급한 뒤 결과만 반영합니다.
          </p>
        </div>

        <div className="border border-border bg-card p-5 text-sm text-muted-foreground">
          결제수단 변경을 누르면 {payProvider === "kakaopay" ? "카카오페이" : "이니시스"}{" "}
          빌링키 발급 화면이 열립니다. 발급이 끝나면 현재 팀의 자동결제 수단만
          교체됩니다.
        </div>

        <button
          type="button"
          disabled={!canChange}
          onClick={onClickChange}
          className={cn(
            "inline-flex w-full items-center justify-center px-4 py-3 text-sm font-medium",
            "bg-primary text-primary-foreground hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            !canChange && "opacity-60 cursor-not-allowed"
          )}
        >
          {loading
            ? "처리 중..."
            : isPastDue
              ? "결제수단 갱신 후 구독 복구"
              : "결제수단 변경하기"}
        </button>
      </div>
    </main>
  );
}
