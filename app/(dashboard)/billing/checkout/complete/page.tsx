import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTeamContext } from "@/lib/auth";
import { formatYMDHM } from "@/lib/utils/datetime";
import { PrintReceiptButton } from "@/components/billing/PrintReceiptButton";
import { CheckCircle2 } from "lucide-react";
import { RefreshMeOnMount } from "@/components/RefreshMeOnMount";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 날짜 표시용 헬퍼 */
function displayDate(dt: Date | null | undefined) {
  return dt ? formatYMDHM(dt) : "—";
}

export default async function BillingCheckoutCompletePage() {
  let teamId: string | null = null;

  try {
    const { team } = await requireTeamContext();
    teamId = team?.id ?? null;
  } catch (e: any) {
    const status = typeof e?.status === "number" ? e.status : 500;
    if (status === 401) {
      redirect(
        `/login?next=${encodeURIComponent("/billing/checkout/complete")}`
      );
    }
    redirect("/pricing?error=FORBIDDEN");
  }

  if (!teamId) {
    redirect("/pricing?error=NO_TEAM");
  }

  // ✅ 결제 완료 직후 최신 상태를 DB에서 다시 읽기
  const fresh = await prisma.team.findUnique({
    where: { id: teamId },
    select: {
      id: true,
      name: true,
      plan: true,
      membershipStatus: true,
      payProvider: true,
      planExpiresAt: true,
      nextBillingAt: true,
      pendingPlan: true,
      pendingPlanStartsAt: true,
      cancelRequestedAt: true,
      updatedAt: true,
    },
  });

  if (!fresh) {
    redirect("/pricing?error=NOT_FOUND");
  }

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-16">
      <RefreshMeOnMount />
      <div className="flex flex-col items-center text-center">
        <CheckCircle2 className="h-16 w-16 text-emerald-500 mb-4" />
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          결제가 완료되었습니다
        </h1>
        <p className="mt-2 text-muted-foreground">
          {fresh.name} 팀의 플랜이 성공적으로 업데이트되었습니다.
        </p>
      </div>

      {/* ✅ 영수증 카드 (결제 요약) */}
      <section className="mt-10 overflow-hidden border-2 border-primary/10 bg-primary/5 p-0 print:border-none print:bg-transparent">
        <div className="bg-primary/10 px-6 py-3 print:hidden">
          <h2 className="text-xs font-bold uppercase tracking-wider text-primary">
            Payment Receipt
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">결제 수단</span>
            <span className="font-medium text-foreground">
              {fresh.payProvider ?? "카드 결제"}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">처리 일시</span>
            <span className="font-medium text-foreground">
              {displayDate(fresh.updatedAt)}
            </span>
          </div>
          <div className="border-t border-primary/10 pt-4 flex justify-between items-baseline">
            <span className="text-sm font-semibold text-muted-foreground">
              결제 상태
            </span>
            <span className="text-lg font-bold text-primary">성공</span>
          </div>
        </div>
      </section>

      {/* ✅ 구독 상세 정보 카드 */}
      <section className="mt-6 border border-border bg-card p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          현재 구독 정보
        </h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">활성 플랜</span>
            <span className="font-bold text-foreground">{fresh.plan}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">멤버십 상태</span>
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
              {fresh.membershipStatus}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">플랜 만료일</span>
            <span className="text-foreground font-medium">
              {displayDate(fresh.planExpiresAt)}
            </span>
          </div>
          {fresh.nextBillingAt && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">다음 결제 예정일</span>
              <span className="text-foreground font-medium">
                {displayDate(fresh.nextBillingAt)}
              </span>
            </div>
          )}

          {/* 예약된 변경사항이 있는 경우 */}
          {fresh.pendingPlan && (
            <div className="mt-3 border-t border-dashed border-border pt-3">
              <div className="flex justify-between text-amber-600">
                <span>예약된 변경 플랜</span>
                <span className="font-bold">{fresh.pendingPlan}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>변경 적용일</span>
                <span>{displayDate(fresh.pendingPlanStartsAt)}</span>
              </div>
            </div>
          )}

          {/* 해지 요청이 있는 경우 */}
          {fresh.cancelRequestedAt && (
            <div className="mt-3 border-t border-dashed border-border pt-3">
              <div className="flex justify-between text-red-400">
                <span>구독 해지 요청일</span>
                <span>{displayDate(fresh.cancelRequestedAt)}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ✅ 하단 액션 버튼 */}
      <div className="mt-10 flex flex-col gap-3 print:hidden">
        <Link
          href="/my/dashboard"
          className="flex h-12 w-full items-center justify-center bg-primary text-sm font-bold text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98]"
        >
          대시보드로 이동하여 시작하기
        </Link>
        <div className="flex gap-2">
          <Link
            href="/my/billing"
            className="flex-1 flex h-11 items-center justify-center border border-border bg-background text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            결제 및 구독 관리
          </Link>
          <PrintReceiptButton />
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground print:text-black">
        결제 관련 문의는 고객센터 또는 lgh0334@gmail.com으로 연락주시기
        바랍니다.
      </p>
    </main>
  );
}
