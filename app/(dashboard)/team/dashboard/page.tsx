"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMeStore } from "@/stores/useMeStore";
import { fetchWithLoading } from "@/lib/fetchWithLoading";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { STATUS_LABEL } from "@/lib/constants/articleConstants";
import { formatYMDHMFromISO } from "@/lib/utils/datetime";
import {
  Clock,
  CheckCircle2,
  Users,
  Edit3,
  Calendar,
  Sparkles,
  Check,
} from "lucide-react";

// --- Helpers ---
function statusLabel(s: string) {
  return STATUS_LABEL[s as keyof typeof STATUS_LABEL] || s;
}

// --- Components ---
function KpiCard({
  label,
  value,
  loading,
  onClick,
  icon: Icon,
  iconColor, // 아이콘 색상 클래스 (새로 추가)
  valueColor, // 숫자 색상 클래스 (선택 사항)
}: {
  label: string;
  value: React.ReactNode;
  loading?: boolean;
  onClick?: () => void;
  icon?: any;
  iconColor?: string;
  valueColor?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`border border-border bg-card p-6 transition-all relative overflow-hidden group flex flex-col justify-between h-full ${
        onClick ? "cursor-pointer hover:border-primary/50" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        {Icon && (
          // 아이콘에 전달된 색상을 적용 (기본값은 muted-foreground)
          <Icon
            className={`h-4 w-4 transition-colors ${
              iconColor || "text-muted-foreground group-hover:text-primary"
            }`}
          />
        )}
      </div>
      <div
        className={`mt-2 text-3xl font-bold tracking-tight ${
          // 숫자는 별도 지정 없으면 기본 흰색(foreground) 유지
          valueColor || "text-foreground"
        }`}
      >
        {loading ? "..." : value}
      </div>
    </div>
  );
}

export default function TeamDashboardPage() {
  const router = useRouter();
  const { me, loading: meLoading } = useMeStore();
  const activeTeam = me?.teams?.[0]; // 현재는 첫 번째 팀만 사용

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    stats: {
      pendingCount: number;
      monthCreated: number;
      monthFinalized: number;
    };
    recent: any[];
  } | null>(null);

  useEffect(() => {
    // me가 로드되지 않았거나 팀 정보가 없으면 로딩 중이므로 대기
    if (meLoading || !activeTeam?.id) return;

    const loadDashboard = async () => {
      try {
        setLoading(true);
        const res = await fetchWithLoading(
          `/api/team/${activeTeam.id}/dashboard`
        );
        const json = await res.json();
        if (json.ok) {
          setData(json);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [meLoading, activeTeam?.id]);

  if (meLoading || !activeTeam) {
    return (
      <div className="flex h-[50vh] w-full items-center justify-center">
        <p className="text-sm text-muted-foreground animate-pulse">
          팀 대시보드 정보를 불러오는 중...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* 1. Header Area */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl font-display">
            팀 대시보드
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {activeTeam.name}
            </span>{" "}
            팀의 보도자료 현황을 한눈에 확인하세요.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/press/new"
            className="inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90"
          >
            ✨ 새 보도자료 작성
          </Link>
          <Link
            href="/team/articles"
            className="inline-flex h-11 items-center justify-center border border-border bg-background px-5 text-sm font-medium transition-all hover:bg-muted"
          >
            전체 목록
          </Link>
        </div>
      </header>

      {/* 2. KPI Section (Drill-down) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="진행 중인 문서"
          value={data?.stats.pendingCount ?? 0}
          loading={loading}
          icon={Clock}
          iconColor="text-primary"
          onClick={() => router.push("/team/articles?status=IN_PROGRESS")}
        />
        <KpiCard
          label="이달 생성"
          value={data?.stats.monthCreated ?? 0}
          loading={loading}
          icon={Sparkles}
          iconColor="text-violet-600 dark:text-violet-400"
          onClick={() => router.push("/team/articles?period=current_month")}
        />
        <KpiCard
          label="이달 완료"
          value={data?.stats.monthFinalized ?? 0}
          loading={loading}
          icon={Check}
          iconColor="text-emerald-600 dark:text-emerald-400"
          onClick={() =>
            router.push("/team/articles?status=FINAL&period=current_month")
          }
        />
      </section>

      {/* 3. Main Contents Section */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 최근 팀 작업 이력 (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-semibold">최근 업데이트된 팀 문서</h2>
          </div>

          <div className="border border-border bg-card overflow-hidden">
            {!data || data.recent.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-muted-foreground">
                  최근 활동 내역이 없습니다.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data.recent.map((press) => (
                  <li
                    key={press.id}
                    className="group p-5 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link
                          href={`/team/articles/${press.id}/edit`} // 상세 페이지 대신 편집(상세)으로 바로 연결
                          className="text-[15px] font-semibold hover:underline decoration-primary/50 underline-offset-4 block truncate"
                        >
                          {press.title || "제목 없음"}
                        </Link>
                        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users size={12} /> {press.author}
                          </span>
                          <span>{formatYMDHMFromISO(press.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-[11px] font-medium">
                          {statusLabel(press.status)}
                        </span>
                        <Link
                          href={`/team/articles/${press.id}/edit`}
                          className="p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                        >
                          <Edit3 size={16} />
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 팀 활동 요약 (1/3) */}
        <div>
          <div className="border border-border bg-card p-6 sticky top-10">
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary" />팀 활동 가이드
            </h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              팀원들이 작성한 보도자료를 검토하고 피드백을 남겨보세요. 완성된
              문서는 바로 배포할 수 있습니다.
            </p>

            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 p-3 bg-muted/50 border border-border">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center shrink-0">
                  <Clock size={16} />
                </div>
                <div>
                  <div className="text-xs font-bold">진행 중</div>
                  <div className="text-[10px] text-muted-foreground">
                    작성 중이거나 검토가 필요한 문서
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-muted/50 border border-border">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <div className="text-xs font-bold">완료됨</div>
                  <div className="text-[10px] text-muted-foreground">
                    최종 승인되어 배포 가능한 문서
                  </div>
                </div>
              </div>
            </div>

            <Link
              href="/team/articles"
              className="mt-6 block w-full text-center py-2.5 text-xs font-bold border border-border hover:bg-muted transition-colors"
            >
              팀 문서 전체보기
            </Link>
          </div>
        </div>
      </section>

      {/* Footer Spacer */}
      <div className="h-40 sm:h-64" />

      <MarketingFooter />
    </div>
  );
}
