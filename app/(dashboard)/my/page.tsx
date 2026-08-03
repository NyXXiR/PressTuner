"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useMeStore } from "@/stores/useMeStore";
import { useTeamStore } from "@/stores/useTeamStore";
import { evaluateSubscriptionLifecycle } from "@/domain/billing/subscription/lifecycleMatrix";
import clsx from "clsx";
import {
  User,
  CreditCard,
  Calendar,
  AlertTriangle,
  Inbox,
  Check,
  X,
  RefreshCw,
  ExternalLink,
  Trash2,
  Building,
  Briefcase,
  Shield,
  Pencil,
  Save,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

const LEGACY_ACCOUNT_TOOLS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_LEGACY_ROUTES === "true";

// --- Types ---

type TeamInvitation = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELED" | "EXPIRED";
  message?: string | null;
  createdAt: string;
  team?: { id: string; name: string; slug: string };
  inviter?: { id: string; label: string; email?: string | null };
};

type SubscriptionProduct = "PRESS" | "CAREER";

type SubscriptionTeam = {
  id: string;
  slug: string;
  name: string;
  plan: "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
  membershipStatus: "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED";
  planExpiresAt: string | null;
  nextBillingAt: string | null;
  pendingPlan: "FREE" | "BASIC" | "PRO" | "ENTERPRISE" | null;
  pendingPlanStartsAt: string | null;
  payProvider: "INICIS" | "KAKAOPAY" | null;
  lastPaymentId?: string | null;
  lastPaidAt?: string | null;
  cancelRequestedAt?: string | null;
  hasBillingKey?: boolean;
};

// --- Helpers ---

function format(dt: string) {
  try {
    return new Date(dt).toLocaleString();
  } catch {
    return dt;
  }
}
function formatKst(dt: string | null | undefined) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  } catch {
    return dt;
  }
}
function formatKstDate(dt: string | null) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  } catch {
    return dt;
  }
}
function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium",
        "bg-muted/50 text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  );
}
function StatusPill({ status }: { status: TeamInvitation["status"] }) {
  const map: any = {
    PENDING: "border-amber-500/20 bg-amber-500/10 text-amber-600",
    ACCEPTED: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
    REJECTED: "border-red-500/20 bg-red-500/10 text-red-600",
    CANCELED: "opacity-70",
    EXPIRED: "opacity-70",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        map[status] || "bg-muted"
      )}
    >
      {status}
    </span>
  );
}
function PlanBadge({ plan }: { plan: SubscriptionTeam["plan"] }) {
  const map: any = {
    FREE: "bg-muted/50",
    BASIC: "border-sky-500/20 bg-sky-500/10 text-sky-600",
    PRO: "border-violet-500/20 bg-violet-500/10 text-violet-600",
    ENTERPRISE: "border-amber-500/20 bg-amber-500/10 text-amber-600",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold",
        map[plan]
      )}
    >
      {plan}
    </span>
  );
}
function MembershipStatusBadge({
  status,
}: {
  status: SubscriptionTeam["membershipStatus"];
}) {
  const map: any = {
    ACTIVE: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
    PAST_DUE: "border-amber-500/20 bg-amber-500/10 text-amber-600",
    CANCELED: "bg-muted/50",
    EXPIRED: "bg-muted/50",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        map[status]
      )}
    >
      {status}
    </span>
  );
}

// --- Main Page Component ---

function MyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const surface = searchParams.get("surface") === "resume" ? "resume" : "press";
  const surfaceProduct: SubscriptionProduct =
    surface === "resume" ? "CAREER" : "PRESS";
  const pricingHref =
    surface === "resume" ? "/resume/pricing?tab=CAREER" : "/press/pricing";

  // Stores
  const me = useMeStore((s) => s.me);
  const loading = useMeStore((s) => s.loading);
  const fetchMe = useMeStore((s) => s.fetchMe);
  const setSelectedTeamId = useTeamStore((s) => s.setSelectedTeamId);

  // States
  const [inbox, setInbox] = useState<TeamInvitation[]>([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [isCreatingTeam, setIsCreatingTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [switchingTeamId, setSwitchingTeamId] = useState<string | null>(null);

  const [sub, setSub] = useState<SubscriptionTeam | null>(null);
  const [loadingSub, setLoadingSub] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  // User Label Editing State
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editLabelValue, setEditLabelValue] = useState("");
  const [updatingLabel, setUpdatingLabel] = useState(false);

  // Team Name Editing State
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamNameValue, setEditTeamNameValue] = useState("");
  const [updatingTeamName, setUpdatingTeamName] = useState(false);

  // Actions states
  const [canceling, setCanceling] = useState(false);
  const [uncanceling, setUncanceling] = useState(false);
  const [unscheduling, setUnscheduling] = useState(false);
  const [resettingFree, setResettingFree] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  const myTeams = me?.teams || [];
  const userId = me?.userId;

  // Init Effects
  useEffect(() => {
    if (!me && !loading) fetchMe();
  }, [me, loading, fetchMe]);

  useEffect(() => {
    // me 정보가 로드되면 라벨 초기값 설정
    if (me?.userLabel) {
      setEditLabelValue(me.userLabel);
    }
  }, [me?.userLabel]);

  const refreshInbox = async () => {
    setLoadingInbox(true);
    try {
      const res = await fetch("/api/team/invitations/inbox", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (data?.ok && Array.isArray(data.invitations))
        setInbox(data.invitations);
      else setInbox([]);
    } finally {
      setLoadingInbox(false);
    }
  };

  const refreshSubscription = async () => {
    setLoadingSub(true);
    try {
      const res = await fetch(`/api/billing/subscriptions?product=${surfaceProduct}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      const selected = data?.ok ? data?.subscriptions?.[surfaceProduct] : null;
      if (res.ok && selected) setSub(selected as SubscriptionTeam);
      else {
        setSub(null);
        setSubError(data?.message ?? data?.error ?? "구독 정보 없음");
      }
    } finally {
      setLoadingSub(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    refreshInbox();
    refreshSubscription();
  }, [userId]);

  // --- Handlers ---

  const handleUpdateLabel = async () => {
    if (!editLabelValue.trim()) return alert("이름(별칭)을 입력해주세요.");
    if (editLabelValue === me?.userLabel) {
      setIsEditingLabel(false);
      return;
    }

    setUpdatingLabel(true);
    try {
      const res = await fetch("/api/me/label", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabelValue }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.message ?? data?.error ?? "라벨 변경 실패");

      await fetchMe(); // Store 갱신
      setIsEditingLabel(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingLabel(false);
    }
  };

  const handleUpdateTeamName = async (teamId: string) => {
    if (!editTeamNameValue.trim()) return alert("팀 이름을 입력해주세요.");

    setUpdatingTeamName(true);
    try {
      const res = await fetch(`/api/team/${teamId}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editTeamNameValue }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.message ?? data?.error ?? "팀 이름 변경 실패");

      await fetchMe(); // Store 갱신
      setEditingTeamId(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdatingTeamName(false);
    }
  };

  const handleSwitchTeam = async (teamId: string) => {
    if (switchingTeamId) return;
    setSwitchingTeamId(teamId);
    setSelectedTeamId(teamId); // 클라이언트 상태 즉시 업데이트
    try {
      const res = await fetch("/api/team/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });

      if (!res.ok) {
        throw new Error("팀 전환에 실패했습니다.");
      }

      await fetchMe(); // 내 정보 갱신
      router.refresh(); // 서버 컴포넌트 갱신
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSwitchingTeamId(null);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return alert("팀 이름을 입력해주세요.");
    try {
      setIsCreatingTeam(true);
      const res = await fetch("/api/team/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName }),
      });
      const data = await res.json();
      if (!data.ok)
        throw new Error(data?.message ?? data?.error ?? "요청 실패");

      alert("팀이 생성되었습니다.");
      setNewTeamName("");
      await fetchMe();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsCreatingTeam(false);
    }
  };

  const handleDeleteTeam = async (teamId: string, teamName: string) => {
    if (
      !confirm(
        `정말 "${teamName}" 팀을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`
      )
    )
      return;
    try {
      const res = await fetch(`/api/team/${teamId}/delete`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!data.ok)
        throw new Error(data?.message ?? data?.error ?? "요청 실패");

      alert("팀이 삭제되었습니다.");
      await fetchMe();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const respondInvitation = async (id: string, action: string) => {
    try {
      const res = await fetch(`/api/team/invitations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) {
        await refreshInbox();
        await fetchMe();
      }
    } catch {}
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      const isResume = surface === "resume";
      window.location.href = isResume ? "/resume" : "/";
    } catch {}
  };

  // Subscription Actions
  const handleCancelSubscription = async () => {
    if (!isAdmin) return;
    const isPastDueState = sub?.membershipStatus === "PAST_DUE";
    const confirmed = isPastDueState
      ? confirm(
          "자동결제 재시도를 중단하시겠습니까?\n만료일까지는 현재 구독을 그대로 사용할 수 있습니다.",
        )
      : confirm("구독 해지? ");
    if (!confirmed) return;
    setCanceling(true);
    try {
      await fetch("/api/billing/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: surfaceProduct }),
      });
      await refreshSubscription();
      alert(isPastDueState ? "자동결제 재시도가 중단되었습니다." : "해지됨");
    } finally {
      setCanceling(false);
    }
  };
  const handleUncancelSubscription = async () => {
    if (!isAdmin) return;
    if (!confirm("재개?")) return;
    setUncanceling(true);
    try {
      await fetch("/api/billing/subscription/uncancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: surfaceProduct }),
      });
      await refreshSubscription();
      alert("재개됨");
    } finally {
      setUncanceling(false);
    }
  };
  const handleUnscheduleDowngrade = async () => {
    if (!isAdmin) return;
    if (!confirm("취소?")) return;
    setUnscheduling(true);
    try {
      await fetch("/api/billing/subscription/unschedule-downgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: surfaceProduct }),
      });
      await refreshSubscription();
      alert("취소됨");
    } finally {
      setUnscheduling(false);
    }
  };
  const handleResetToFree = async () => {
    if (!isSuperAdmin) return;
    if (!confirm("초기화?")) return;
    const typed = prompt("RESET_FREE");
    if (typed !== "RESET_FREE") return;
    setResettingFree(true);
    try {
      await fetch("/api/billing/subscription/reset-free", {
        method: "POST",
        body: JSON.stringify({ confirm: "RESET_FREE" }),
      });
      await refreshSubscription();
      alert("완료");
    } finally {
      setResettingFree(false);
    }
  };

  // Withdrawal Actions
  const handleWithdrawal = async () => {
    if (!confirm("정말 회원 탈퇴를 예약하시겠습니까? (30일 유예)")) return;
    setIsWithdrawing(true);
    try {
      await fetch("/api/me/withdrawal", { method: "POST" });
      await fetchMe();
      alert("회원 탈퇴가 예약되었습니다.");
    } finally {
      setIsWithdrawing(false);
    }
  };
  const handleCancelWithdrawal = async () => {
    if (!confirm("탈퇴 예약을 취소하시겠습니까?")) return;
    setIsWithdrawing(true);
    try {
      await fetch("/api/me/withdrawal", { method: "DELETE" });
      await fetchMe();
      alert("탈퇴 예약이 취소되었습니다.");
    } finally {
      setIsWithdrawing(false);
    }
  };

  // Variables
  const userLabel = me?.userLabel ?? me?.userLoginId ?? "—";
  const role = me?.userRole;
  const isAdmin = role === "OWNER" || role === "ADMIN";
  const isSuperAdmin = me?.isSuperAdmin === true;
  const isWithdrawalScheduled = !!me?.deleteScheduledAt;
  const lifecycle = sub
    ? evaluateSubscriptionLifecycle(
        {
          plan: sub.plan,
          membershipStatus: sub.membershipStatus,
          payProvider: sub.payProvider,
          hasBillingKey: sub.hasBillingKey,
          planExpiresAt: sub.planExpiresAt,
          pendingPlan: sub.pendingPlan,
          pendingPlanStartsAt: sub.pendingPlanStartsAt,
          cancelRequestedAt: sub.cancelRequestedAt,
        },
        { isAdmin }
      )
    : null;
  const canCancel = !!lifecycle?.actions.cancelSubscription.allowed;
  const canUncancel = !!lifecycle?.actions.uncancelSubscription.allowed;
  const canUnscheduleDowngrade =
    !!lifecycle?.actions.unscheduleDowngrade.allowed;
  const isPastDue = lifecycle?.state === "PAST_DUE";
  const cancelButtonLabel = isPastDue ? "자동결제 재시도 중단" : "구독 해지";

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex flex-col gap-1 mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          마이페이지
        </h1>
        <p className="text-muted-foreground">
          내 계정 정보와 요금제 가입 현황을 관리합니다.
        </p>
      </div>

      <div className="space-y-6">
        {/* 1. Account Info */}
        <section className="border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />내 계정
            </h2>
            {LEGACY_ACCOUNT_TOOLS_ENABLED && (
              <Link
                href="/team/manage"
                className="text-[12px] text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                현재 팀 대시보드 &rarr;
              </Link>
            )}
          </div>
          <div className="p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
              <div className="space-y-3 text-sm flex-1">
                {/* 이름(별칭) 수정 UI */}
                <div className="flex items-center gap-2 h-9">
                  <span className="text-muted-foreground w-20 inline-block shrink-0">
                    이름(별칭)
                  </span>
                  {isEditingLabel ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editLabelValue}
                        onChange={(e) => setEditLabelValue(e.target.value)}
                        className="h-8 w-40 border border-input bg-background px-2 text-sm"
                        placeholder="이름 입력"
                        autoFocus
                      />
                      <button
                        onClick={handleUpdateLabel}
                        disabled={updatingLabel}
                        className="p-1.5 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          setIsEditingLabel(false);
                          setEditLabelValue(me?.userLabel || "");
                        }}
                        className="p-1.5 hover:bg-muted"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <span className="font-medium">{userLabel}</span>
                      <button
                        onClick={() => setIsEditingLabel(true)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-muted text-muted-foreground"
                        title="이름 변경"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-muted-foreground w-20 inline-block">
                    이메일
                  </span>
                  {me?.userEmail || "—"}
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="text-xs text-red-500 hover:bg-red-50 px-3 py-1 rounded border border-red-100"
              >
                로그아웃
              </button>
            </div>
          </div>
        </section>

        {/* 2. Team Management */}
        {LEGACY_ACCOUNT_TOOLS_ENABLED && (
        <section className="border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Building className="h-4 w-4 text-primary" />내 팀 관리
            </h2>
            <button
              onClick={() => fetchMe()}
              disabled={loading}
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw
                className={clsx("h-4 w-4", loading && "animate-spin")}
              />
            </button>
          </div>
          <div className="p-6">
            <form onSubmit={handleCreateTeam} className="flex gap-2 mb-6">
              <input
                type="text"
                placeholder="새로운 팀 이름 입력"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                className="flex-1 h-9 border border-input bg-transparent px-3 text-sm"
              />
              <button
                type="submit"
                disabled={isCreatingTeam || !newTeamName}
                className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {isCreatingTeam ? "생성 중..." : "팀 생성"}
              </button>
            </form>

           <div className="grid gap-3 sm:grid-cols-2">
              {myTeams.length === 0 ? (
                <div className="col-span-2 py-8 text-center border border-dashed bg-muted/20 text-sm text-muted-foreground">
                  소속된 팀이 없습니다.
                </div>
              ) : (
                myTeams.map((team) => {
                  const isCurrent = me?.teamId === team.id;
                  const isSwitchingThis = switchingTeamId === team.id;
                  const isEditingThis = editingTeamId === team.id;

                  return (
                    <div
                      key={team.id}
                      // 🟢 [Fix] group 클래스 추가 및 z-index 문제 방지를 위한 relative/isoalte
                      className={clsx(
                        "relative isolate border p-4 transition-all group",
                        isCurrent
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/30"
                      )}
                    >
                      <div className="flex justify-between items-start mb-2 min-h-[28px]">
                        {/* 🟢 수정 모드일 때 */}
                        {isEditingThis ? (
                          <div className="flex items-center gap-1.5 w-full mr-2 z-10">
                            <input
                              type="text"
                              value={editTeamNameValue}
                              onChange={(e) =>
                                setEditTeamNameValue(e.target.value)
                              }
                              className="flex-1 h-7 border border-input px-2 text-sm bg-background"
                              autoFocus
                              // 엔터키로 저장, ESC로 취소 기능 추가
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleUpdateTeamName(team.id);
                                if (e.key === "Escape") setEditingTeamId(null);
                              }}
                            />
                            <button
                              onClick={() => handleUpdateTeamName(team.id)}
                              disabled={updatingTeamName}
                              className="h-7 w-7 flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                            >
                              <Save className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingTeamId(null)}
                              className="h-7 w-7 flex items-center justify-center bg-muted text-muted-foreground hover:bg-muted/80 shrink-0"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          /* 🟢 일반 모드일 때 */
                          <div className="flex items-center gap-2 max-w-[80%]">
                            <span
                              className="font-semibold text-sm truncate cursor-default"
                              title={team.name}
                            >
                              {team.name}
                            </span>
                            {/* OWNER일 때만 수정 버튼 노출 */}
                            {team.role === "OWNER" && (
                              <button
                                onClick={() => {
                                  // 🟢 버튼 클릭 시 다른 팀의 상태와 섞이지 않도록 명확히 설정
                                  setEditingTeamId(team.id);
                                  setEditTeamNameValue(team.name);
                                }}
                                // 🟢 [Fix] opacity-0 제거 -> 항상 보이도록 변경 (클릭 이슈 해결)
                                className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded p-1 transition-colors cursor-pointer"
                                title="팀 이름 변경"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        {isCurrent && !isEditingThis && (
                          <Badge className="bg-primary text-primary-foreground border-transparent shrink-0">
                            Current
                          </Badge>
                        )}
                      </div>

                      <div className="text-xs text-muted-foreground space-y-1 mb-4">
                        <div className="flex items-center gap-1">
                          <Briefcase className="w-3 h-3" /> {team.role}
                        </div>
                        <div className="flex items-center gap-1">
                          <CreditCard className="w-3 h-3" /> {team.plan}
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-border/10">
                        {!isCurrent && (
                          <button
                            onClick={() => handleSwitchTeam(team.id)}
                            disabled={!!switchingTeamId || !!editingTeamId}
                            className={clsx(
                              "text-xs font-medium hover:text-primary transition-colors",
                              isSwitchingThis && "opacity-70 cursor-wait",
                              !isSwitchingThis &&
                                (!!switchingTeamId || !!editingTeamId) &&
                                "opacity-30 cursor-not-allowed"
                            )}
                          >
                            {isSwitchingThis ? "전환 중..." : "전환하기 →"}
                          </button>
                        )}
                        {team.role === "OWNER" && !isEditingThis && (
                          <button
                            onClick={() => handleDeleteTeam(team.id, team.name)}
                            disabled={!!switchingTeamId || !!editingTeamId}
                            className="text-xs text-muted-foreground hover:text-red-500 flex items-center gap-1 disabled:opacity-30"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
        )}

        {/* 3. Subscription (상세 UI 복원) */}
        <section className="border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              멤버십 / 요금제
            </h2>
            <button
              onClick={refreshSubscription}
              disabled={loadingSub}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={clsx("h-4 w-4", loadingSub && "animate-spin")}
              />
            </button>
          </div>

          <div className="p-6">
            {loadingSub ? (
              <p className="text-sm text-muted-foreground animate-pulse">
                정보를 불러오는 중입니다...
              </p>
            ) : subError ? (
              <p className="text-sm text-red-500">{subError}</p>
            ) : !sub ? (
              <div className="border border-border bg-muted/30 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  구독 정보를 찾을 수 없습니다.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center gap-3">
                  <PlanBadge plan={sub.plan} />
                  <MembershipStatusBadge status={sub.membershipStatus} />
                  {sub.payProvider && (
                    <Badge>결제수단: {sub.payProvider}</Badge>
                  )}
                  {sub.pendingPlan && (
                    <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400">
                      예약 변경: {sub.pendingPlan} (
                      {formatKstDate(sub.pendingPlanStartsAt)})
                    </Badge>
                  )}
                  {sub.cancelRequestedAt && (
                    <Badge className="bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400">
                      해지요청: {formatKst(sub.cancelRequestedAt)}
                    </Badge>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                      <Calendar className="w-3 h-3" />
                      만료 / 배타 경계
                    </div>
                    <div className="mt-2 text-sm font-medium">
                      {formatKst(sub.planExpiresAt)}
                    </div>
                  </div>

                  <div className="border border-border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                      <CreditCard className="w-3 h-3" />
                      {sub.cancelRequestedAt ? "해지 예정" : "다음 결제 예정"}
                    </div>
                    <div className="mt-2 text-sm font-medium">
                      {sub.cancelRequestedAt ? (
                        <span className="text-muted-foreground">
                          만료일 자정까지 이용 가능
                        </span>
                      ) : sub.nextBillingAt ? (
                        formatKst(sub.nextBillingAt)
                      ) : (
                        "—"
                      )}
                    </div>
                  </div>
                </div>

                {me && !isAdmin && (
                  <div className="flex items-start gap-2 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      팀 관리자(ADMIN/OWNER)만 구독 해지/재개 및 결제수단 변경이
                      가능합니다.
                    </p>
                  </div>
                )}

                {isAdmin && isPastDue ? (
                  <div className="flex items-start gap-2 border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      미납 상태입니다. 먼저 결제수단을 갱신해 구독을 복구하거나,
                      자동결제 재시도를 중단하고 만료일까지 현재 구독을 사용할 수
                      있습니다.
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between pt-4 border-t border-border">
                  <Link
                    href={pricingHref}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    요금제 자세히 보기 <ExternalLink className="w-3 h-3" />
                  </Link>

                  <div className="flex flex-wrap gap-2">
                    {sub.pendingPlan && (
                      <button
                        onClick={handleUnscheduleDowngrade}
                        disabled={!canUnscheduleDowngrade || unscheduling}
                        className="h-8 px-3 border border-border text-xs font-medium hover:bg-muted disabled:opacity-50"
                      >
                        {unscheduling ? "처리 중..." : "예약 변경 취소"}
                      </button>
                    )}

                    <button
                      onClick={handleCancelSubscription}
                      disabled={!canCancel || canceling}
                      className={clsx(
                        "h-8 px-3 border border-border text-xs font-medium",
                        "text-red-500 hover:bg-red-500/10 hover:border-red-500/20",
                        "disabled:opacity-50 disabled:cursor-not-allowed"
                      )}
                    >
                      {canceling ? "처리 중..." : cancelButtonLabel}
                    </button>

                    <button
                      onClick={handleUncancelSubscription}
                      disabled={!canUncancel || uncanceling}
                      className="h-8 px-3 border border-border text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      {uncanceling ? "처리 중..." : "자동결제 재개"}
                    </button>

                    <Link
                      href={
                        isAdmin
                          ? `/billing/payment-method?surface=${surface}`
                          : "#"
                      }
                      onClick={(e) => !isAdmin && e.preventDefault()}
                      className={clsx(
                        "h-8 px-3 border border-border text-xs font-medium flex items-center",
                        isAdmin
                          ? "hover:bg-muted"
                          : "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {isPastDue ? "결제수단 갱신 후 구독 복구" : "결제수단 변경"}
                    </Link>
                  </div>
                </div>

                {isSuperAdmin && LEGACY_ACCOUNT_TOOLS_ENABLED && (
                  <div className="border border-red-500/20 bg-red-500/5 p-4 mt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-red-600 dark:text-red-400 mb-1">
                          Danger Zone (운영자)
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          테스트를 위해 결제 상태를 FREE로 강제 초기화합니다.
                        </p>
                      </div>
                      <button
                        onClick={handleResetToFree}
                        disabled={resettingFree}
                        className="h-7 px-3 rounded text-[11px] bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors"
                      >
                        {resettingFree ? "초기화 중..." : "FREE로 강제 초기화"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 4. Inbox Card */}
        {LEGACY_ACCOUNT_TOOLS_ENABLED && (
        <section className="border border-border bg-card overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Inbox className="h-4 w-4 text-primary" />
              내게 온 팀 초대
            </h2>
            <button
              onClick={refreshInbox}
              disabled={loadingInbox}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
            >
              <RefreshCw
                className={clsx("h-4 w-4", loadingInbox && "animate-spin")}
              />
            </button>
          </div>
          <div className="p-6">
            {loadingInbox ? (
              <p className="text-sm text-muted-foreground animate-pulse">
                초대 목록을 불러오는 중...
              </p>
            ) : inbox.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-border bg-muted/20">
                <Inbox className="w-8 h-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm font-medium text-foreground">
                  받은 초대가 없습니다
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {inbox.map((inv) => (
                  <li
                    key={inv.id}
                    className="border border-border p-4 bg-background transition-colors hover:border-primary/30"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">
                            {inv.team?.name || "알 수 없는 팀"}
                          </span>
                          <StatusPill status={inv.status} />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          초대자: {inv.inviter?.label || "—"} ·{" "}
                          {format(inv.createdAt)}
                        </p>
                      </div>
                      {inv.status === "PENDING" && (
                        <div className="flex items-center gap-2 mt-2 sm:mt-0">
                          <button
                            onClick={() => respondInvitation(inv.id, "REJECT")}
                            className="h-8 px-3 flex items-center gap-1.5 border border-border text-xs hover:bg-muted text-muted-foreground"
                          >
                            <X className="w-3 h-3" />
                            거절
                          </button>
                          <button
                            onClick={() => respondInvitation(inv.id, "ACCEPT")}
                            className="h-8 px-3 flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90"
                          >
                            <Check className="w-3 h-3" />
                            수락
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        )}

        {/* 5. Withdrawal Section */}
        <section className="border border-red-500/20 bg-red-500/5 overflow-hidden">
          <div className="p-6">
            <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              회원 탈퇴 관리
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              서비스 이용을 중단하고 회원 탈퇴를 예약합니다. (30일 유예)
            </p>

            <div className="mt-6">
              {isWithdrawalScheduled ? (
                <div className="border border-red-500/20 bg-background p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-red-500 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> 탈퇴 예약됨
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      삭제 예정일: {formatKst(me?.deleteScheduledAt)}
                    </p>
                  </div>
                  <button
                    onClick={handleCancelWithdrawal}
                    disabled={isWithdrawing}
                    className="h-9 px-4 bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isWithdrawing
                      ? "처리 중..."
                      : "탈퇴 예약 취소 (계정 복구)"}
                  </button>
                </div>
              ) : (
                <div className="flex justify-end">
                  <button
                    onClick={handleWithdrawal}
                    disabled={isWithdrawing}
                    className="h-9 px-4 flex items-center gap-2 border border-red-500/30 text-xs font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {isWithdrawing ? "처리 중..." : "회원 탈퇴 신청"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function MyPage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-background" />}>
      <MyPageContent />
    </Suspense>
  );
}
