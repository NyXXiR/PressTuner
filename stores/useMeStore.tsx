import { create } from "zustand";

import type { QuotaStatus } from "@/lib/quota/quotaView";

/**
 * 역할 정의
 */
type TeamRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST" | string;

export type MyTeamInfo = {
  id: string;
  slug: string;
  name: string;
  role: TeamRole;
  plan: string;
};

// ✅ [NEW] 개별 쿼터 타입 (usage-service.ts와 일치)
export type GlobalQuotaUsage = {
  unlimited?: boolean;
  limit: number;
  usage: number;
  remaining: number;
  resetAt?: string;
  resetLabel?: string;
  status?: QuotaStatus;
};

/**
 * ✅ [NEW] 백엔드 UsageSummary와 일치하는 타입 정의
 */
export type UsageResponse = {
  effectivePlanType: string;
  effectivePlanId: string | null;
  effectivePlanName: string;
  planCategory: "PRESS" | "CAREER" | "STANDARD"; // 추가됨

  membershipStatus: string;
  planExpiresAt: string | null;
  isSubscriptionActive: boolean;

  // ✅ [변경] 중첩된 객체 구조로 변경
  article: GlobalQuotaUsage;
  resume: GlobalQuotaUsage;

  quotaPeriod: string; // 'DAILY' | 'MONTHLY'
  periodStart: string;
  periodEnd: string;
};

/**
 * 서버 API 응답 타입
 */
type ApiMeResponse = {
  ok: boolean;
  isSuperAdmin?: boolean;
  error?: string;
  message?: string;
  user?: {
    id: string;
    loginId: string;
    label: string;
    email?: string | null;
    avatarUrl?: string | null;
    deleteScheduledAt?: string | null;
  };
  team?: {
    id: string;
    slug: string;
    name: string;
    plan: string;
    planId?: string | null;
    membershipStatus?: string | null;
    planExpiresAt?: string | null;
    nextBillingAt?: string | null;
    pendingPlan?: string | null;
    pendingPlanStartsAt?: string | null;
    cancelRequestedAt?: string | null;
  };
  teams?: Array<MyTeamInfo>;
  usage?: UsageResponse;
};

/**
 * 컴포넌트에서 사용하기 쉽게 평면화(Flatten)된 데이터 타입
 */
export type MeFlat = {
  isSuperAdmin: boolean;
  teamId?: string;
  teamSlug?: string;
  teamName?: string;

  teamPlan?: string;
  teamPlanId?: string | null;
  teamMembershipStatus?: string | null;
  teamPlanExpiresAt?: string | null;
  teamNextBillingAt?: string | null;
  teamPendingPlan?: string | null;
  teamPendingPlanStartsAt?: string | null;
  teamCancelRequestedAt?: string | null;

  userId?: string;
  userLabel?: string;
  userEmail?: string | null;
  userLoginId?: string;
  avatarUrl?: string | null;
  deleteScheduledAt?: string | null;
  userRole?: TeamRole;

  // ✅ [변경] Usage 관련 평면화 (보도자료 vs 자소서 분리)
  usagePlanCategory?: "PRESS" | "CAREER" | "STANDARD";

  usageArticleLimit?: number;
  usageArticleRemaining?: number;
  usageArticleResetAt?: string;

  usageResumeLimit?: number;
  usageResumeRemaining?: number;

  usagePeriod?: string;
  usagePeriodEnd?: string;

  user?: ApiMeResponse["user"];
  team?: ApiMeResponse["team"];
  teams?: Array<MyTeamInfo>;
  usage?: UsageResponse;
};

type AuthStatus = "unknown" | "authed" | "guest";

/**
 * 서버 데이터를 MeFlat 구조로 변환하는 헬퍼 함수
 */
export function toFlat(data: ApiMeResponse): MeFlat {
  const user = data.user;
  const team = data.team;
  const usage = data.usage;
  const teams = data.teams ?? [];

  const currentTeamId = team?.id;
  const currentRole = teams.find((t) => t.id === currentTeamId)?.role;

  return {
    isSuperAdmin: data.isSuperAdmin === true,
    teamId: team?.id,
    teamSlug: team?.slug,
    teamName: team?.name,

    teamPlan: team?.plan,
    teamPlanId: team?.planId ?? null,
    teamMembershipStatus: team?.membershipStatus ?? null,
    teamPlanExpiresAt: team?.planExpiresAt ?? null,
    teamNextBillingAt: team?.nextBillingAt ?? null,
    teamPendingPlan: team?.pendingPlan ?? null,
    teamPendingPlanStartsAt: team?.pendingPlanStartsAt ?? null,
    teamCancelRequestedAt: team?.cancelRequestedAt ?? null,

    userId: user?.id,
    userLabel: user?.label,
    userEmail: user?.email ?? null,
    userLoginId: user?.loginId,
    avatarUrl: user?.avatarUrl ?? null,
    deleteScheduledAt: user?.deleteScheduledAt ?? null,
    userRole: currentRole,

    // ✅ [변경] Usage 매핑 로직 수정
    usagePlanCategory: usage?.planCategory,

    usageArticleLimit: usage?.article.limit,
    usageArticleRemaining: usage?.article.remaining,
    usageArticleResetAt: usage?.article.resetAt,

    usageResumeLimit: usage?.resume.limit,
    usageResumeRemaining: usage?.resume.remaining,

    usagePeriod: usage?.quotaPeriod,
    usagePeriodEnd: usage?.periodEnd,

    user,
    team,
    teams,
    usage,
  };
}

// ... Store 로직은 그대로 유지 ...
type MeStoreState = {
  me: MeFlat | null;
  loading: boolean;
  error: string | null;
  authStatus: AuthStatus;
  checked: boolean;
  fetchMe: () => Promise<void>;
  clearMe: () => void;
};

export const useMeStore = create<MeStoreState>((set, get) => ({
  me: null,
  loading: false,
  error: null,
  authStatus: "unknown",
  checked: false,

  clearMe: () =>
    set({
      me: null,
      loading: false,
      error: null,
      authStatus: "guest",
      checked: true,
    }),

  fetchMe: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });

    try {
      const res = await fetch("/api/me", {
        method: "GET",
        cache: "no-store",
        headers: { "Cache-Control": "no-store" },
      });

      if (res.status === 401) {
        set({
          me: null,
          loading: false,
          error: null,
          authStatus: "guest",
          checked: true,
        });
        return;
      }

      let data: ApiMeResponse | null = null;
      try {
        data = (await res.json()) as ApiMeResponse;
      } catch {
        data = null;
      }

      if (!res.ok || !data || !data.ok) {
        const msg = data?.message ?? data?.error ?? "me 정보를 불러오지 못했습니다.";
        set({
          me: null,
          loading: false,
          error: msg,
          authStatus: "guest",
          checked: true,
        });
        return;
      }

      set({
        me: toFlat(data),
        loading: false,
        error: null,
        authStatus: "authed",
        checked: true,
      });
    } catch (e) {
      console.error(e);
      set({
        me: null,
        loading: false,
        error: "네트워크/서버 오류로 me 정보를 불러오지 못했습니다.",
        authStatus: "guest",
        checked: true,
      });
    }
  },
}));
