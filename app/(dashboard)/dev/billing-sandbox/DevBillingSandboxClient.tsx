"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CreditCard,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";

type PlanOption = {
  id: string;
  name: string;
  category: "PRESS" | "CAREER" | "STANDARD";
  planType: "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
  monthlyAmountWon: number;
};

type TeamPayload = {
  id: string;
  name?: string | null;
  plan: string;
  planId?: string | null;
  membershipStatus: string;
  payProvider?: string | null;
  planExpiresAt?: string | null;
  nextBillingAt?: string | null;
  pendingPlan?: string | null;
  pendingPlanId?: string | null;
  pendingPlanStartsAt?: string | null;
  cancelRequestedAt?: string | null;
  lastPaidAt?: string | null;
  hasBillingKey?: boolean;
};

type SandboxAction =
  | "mock-subscribe"
  | "mock-renewal-success"
  | "mock-renewal-failure"
  | "mock-past-due"
  | "mock-recover-past-due"
  | "mock-schedule-change"
  | "mock-unschedule-change"
  | "mock-cancel"
  | "mock-uncancel"
  | "reset-free";

const ACTION_LABELS: Record<SandboxAction, string> = {
  "mock-subscribe": "선택 플랜 mock 구독 시작",
  "mock-renewal-success": "정기결제 성공 처리",
  "mock-renewal-failure": "정기결제 실패 처리",
  "mock-past-due": "선택 플랜 미납 상태 만들기",
  "mock-recover-past-due": "미납 복구 성공 처리",
  "mock-schedule-change": "선택 플랜으로 변경 예약",
  "mock-unschedule-change": "예약 변경 취소",
  "mock-cancel": "구독 해지 예약",
  "mock-uncancel": "해지 예약 중지",
  "reset-free": "Free 초기화",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function formatWon(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}

function statusTone(status: string) {
  if (status === "ACTIVE") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "PAST_DUE") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "CANCELED") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

export default function DevBillingSandboxClient({
  initialTeam,
  plans,
}: {
  initialTeam: TeamPayload;
  plans: PlanOption[];
}) {
  const paidPlans = useMemo(
    () => plans.filter((plan) => plan.planType !== "FREE"),
    [plans],
  );
  const defaultPlanId = paidPlans[0]?.id ?? "";
  const [team, setTeam] = useState(initialTeam);
  const [planId, setPlanId] = useState(defaultPlanId);
  const [payProvider, setPayProvider] = useState<"INICIS" | "KAKAOPAY">(
    "INICIS",
  );
  const [amountWon, setAmountWon] = useState("");
  const [busyAction, setBusyAction] = useState<SandboxAction | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPlan = paidPlans.find((plan) => plan.id === planId);
  const effectiveAmount =
    amountWon.trim() === ""
      ? selectedPlan?.monthlyAmountWon ?? 0
      : Math.max(0, Number(amountWon) || 0);

  async function runAction(action: SandboxAction) {
    if (busyAction) return;
    const ok = window.confirm(`${ACTION_LABELS[action]} 작업을 실행할까요?`);
    if (!ok) return;

    setBusyAction(action);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/dev/billing-sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          planId,
          amountWon: amountWon.trim() ? Number(amountWon) : null,
          payProvider,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        throw new Error(json?.message ?? json?.error ?? "SANDBOX_ACTION_FAILED");
      }

      setTeam(json.team);
      setMessage(`${ACTION_LABELS[action]} 완료`);
    } catch (caught) {
      const nextMessage =
        caught instanceof Error ? caught.message : "SANDBOX_ACTION_FAILED";
      setError(nextMessage);
    } finally {
      setBusyAction(null);
    }
  }

  const primaryActions: SandboxAction[] = [
    "mock-subscribe",
    "mock-past-due",
    "mock-renewal-success",
    "mock-renewal-failure",
    "mock-recover-past-due",
  ];

  const managementActions: SandboxAction[] = [
    "mock-schedule-change",
    "mock-unschedule-change",
    "mock-cancel",
    "mock-uncancel",
    "reset-free",
  ];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Dev billing sandbox</div>
            <p className="mt-1 leading-6">
              이 화면은 development 또는 ENABLE_DEV_BILLING_SANDBOX=true
              환경에서 팀 ADMIN/OWNER에게만 열립니다. PortOne을 호출하지 않고
              현재 팀의 결제 상태만 mock 데이터로 전환합니다.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CreditCard className="h-4 w-4" />
            현재 팀 결제 상태
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Team</div>
              <div className="mt-1 text-sm font-medium">{team.name ?? team.id}</div>
            </div>
            <div className="border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Status</div>
              <span
                className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusTone(
                  team.membershipStatus,
                )}`}
              >
                {team.membershipStatus}
              </span>
            </div>
            <div className="border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Plan</div>
              <div className="mt-1 text-sm font-medium">
                {team.plan} {team.planId ? `(${team.planId})` : ""}
              </div>
            </div>
            <div className="border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Payment Method</div>
              <div className="mt-1 text-sm font-medium">
                {team.payProvider ?? "-"} / {team.hasBillingKey ? "billing key 있음" : "없음"}
              </div>
            </div>
            <div className="border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Plan Expires</div>
              <div className="mt-1 text-sm font-medium">
                {formatDate(team.planExpiresAt)}
              </div>
            </div>
            <div className="border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Next Billing</div>
              <div className="mt-1 text-sm font-medium">
                {formatDate(team.nextBillingAt)}
              </div>
            </div>
            <div className="border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Pending Plan</div>
              <div className="mt-1 text-sm font-medium">
                {team.pendingPlanId
                  ? `${team.pendingPlan ?? ""} (${team.pendingPlanId})`
                  : "-"}
              </div>
            </div>
            <div className="border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">Cancel Requested</div>
              <div className="mt-1 text-sm font-medium">
                {formatDate(team.cancelRequestedAt)}
              </div>
            </div>
          </div>
        </section>

        <aside className="border border-border bg-card p-5">
          <div className="text-sm font-semibold">Sandbox Inputs</div>
          <label className="mt-4 block text-xs font-medium text-muted-foreground">
            Target plan
          </label>
          <select
            value={planId}
            onChange={(event) => setPlanId(event.target.value)}
            className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm"
          >
            {paidPlans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} / {plan.category} / {formatWon(plan.monthlyAmountWon)}
              </option>
            ))}
          </select>

          <label className="mt-4 block text-xs font-medium text-muted-foreground">
            Mock amount
          </label>
          <input
            value={amountWon}
            onChange={(event) => setAmountWon(event.target.value)}
            inputMode="numeric"
            placeholder={selectedPlan ? String(selectedPlan.monthlyAmountWon) : "0"}
            className="mt-1 h-10 w-full border border-border bg-background px-3 text-sm"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            구독 시작은 실제 pricing 결과를 사용합니다. 이 값은 미납 상태 세팅,
            mock 정기결제 성공/실패 같은 fixture 액션에서만 적용됩니다. 현재
            입력값: {formatWon(effectiveAmount)}
          </p>

          <label className="mt-4 block text-xs font-medium text-muted-foreground">
            Provider
          </label>
          <div className="mt-1 grid grid-cols-2 border border-border p-1">
            {(["INICIS", "KAKAOPAY"] as const).map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => setPayProvider(provider)}
                className={`h-8 rounded text-xs font-semibold ${
                  payProvider === provider
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {provider}
              </button>
            ))}
          </div>
        </aside>
      </div>

      {message ? (
        <div className="mt-4 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="mt-6 grid gap-5 lg:grid-cols-2">
        <div className="border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <RefreshCw className="h-4 w-4" />
            결제 상태 전환
          </div>
          <div className="mt-4 grid gap-2">
            {primaryActions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => void runAction(action)}
                disabled={!!busyAction}
                className="h-10 border border-border px-3 text-left text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                {busyAction === action ? "처리 중..." : ACTION_LABELS[action]}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <RotateCcw className="h-4 w-4" />
            예약/관리 액션
          </div>
          <div className="mt-4 grid gap-2">
            {managementActions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => void runAction(action)}
                disabled={!!busyAction}
                className={`h-10 border px-3 text-left text-sm font-medium disabled:opacity-50 ${
                  action === "reset-free"
                    ? "border-red-200 text-red-600 hover:bg-red-50"
                    : "border-border hover:bg-muted"
                }`}
              >
                {busyAction === action ? "처리 중..." : ACTION_LABELS[action]}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-6 border border-border bg-card p-5">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            sandbox로 상태를 만든 뒤 실제 사용자 화면에서 확인하세요. 결제 시작
            화면, 마이페이지, 결제수단 변경 화면으로 이동해 표시/차단/복구 안내가
            자연스러운지 검수하면 됩니다.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/billing/checkout?plan=${encodeURIComponent(planId)}`}
            className="bg-foreground px-3 py-2 text-sm font-semibold text-background"
          >
            선택 플랜 checkout 보기
          </Link>
          <Link
            href="/billing/payment-method"
            className="border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"
          >
            결제수단 변경 보기
          </Link>
          <Link
            href="/my?surface=press"
            className="border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"
          >
            Press 마이페이지
          </Link>
          <Link
            href="/my?surface=resume"
            className="border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"
          >
            Resume 마이페이지
          </Link>
        </div>
      </section>
    </main>
  );
}
