import PricingPlansClient from "./PricingPlansClient";
import { formatAiQuotaSummary, listPricingPlans } from "@/config/billing/plans";
import { getSessionContext, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { TeamRole } from "@prisma/client";
import { ChevronDown } from "lucide-react"; // 아이콘 사용을 위해 Client로 넘길 수도 있지만, 여기선 HTML 구조로 처리

export const metadata = {
  title: "Pricing | brieFFlow",
  description: "월 구독 요금 안내",
};

export type UiPlan = {
  id: string;
  name: string;
  category: string;
  price: string;
  originalPrice: string;
  quotaMain: string;
  quotaSub?: string;
  blurb: string;
  cta: { label: string; href: string; disabled?: boolean } | null;
  badge?: string;
  promotionLabel?: string;
  isFree: boolean;
};

// ✅ [수정] FAQ 데이터: 다운그레이드 예약 내용 추가
const FAQS = [
  {
    q: "플랜을 낮은 단계로 변경(다운그레이드)할 수 있나요?",
    a: "네, 가능합니다. 높은 가격의 플랜(예: 29,000원)을 이용하시다가 낮은 가격(예: 5,900원)으로 변경하시면, 즉시 바뀌지 않고 **'변경 예약'** 상태가 됩니다. 현재 이용 중인 플랜의 기간이 끝난 후, 다음 결제일부터 변경된 금액으로 결제됩니다.",
  },
  {
    q: "플랜을 높은 단계로 변경(업그레이드)하면요?",
    a: "업그레이드는 **즉시 적용**됩니다. 기존 플랜의 남은 기간에 대한 차액을 계산하여 추가 결제하시면 바로 상위 플랜의 혜택을 이용하실 수 있습니다.",
  },
  {
    q: "무료 플랜의 제한사항은 무엇인가요?",
    a: "Free 플랜은 가벼운 AI 사용을 체험할 수 있는 롤링 quota를 제공합니다. 초안 생성, PDF 분석처럼 무거운 요청은 더 많은 유닛을 사용합니다.",
  },
  {
    q: "제공된 쿼터(횟수)는 이월되나요?",
    a: "AI 사용량은 5시간/7일 기준으로 자동 회복됩니다. 한도에 도달하면 다음 회복 시간과 업그레이드 안내가 표시됩니다.",
  },
  {
    q: "언제든지 해지할 수 있나요?",
    a: "네, 설정 > 멤버십 관리 메뉴에서 위약금 없이 언제든 해지하실 수 있습니다. 해지하더라도 남은 기간 동안은 혜택이 유지됩니다.",
  },
];

function fmtKRW(won: number) {
  return won === 0 ? "0" : `₩${won.toLocaleString("ko-KR")}`;
}

export default async function PricingPage() {
  const pricingPlans = listPricingPlans();
  const ctx = await getSessionContext();
  const authed = !!ctx?.user?.id;
  const currentPlanId = ctx?.team?.planId;

  let role: TeamRole | null = null;
  if (authed && ctx?.team?.id) {
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId: ctx.team.id, userId: ctx.user.id } },
      select: { role: true },
    });
    role = member?.role ?? null;
  }
  const canCheckout = !!role && isAdmin(role);

  const UI_PLANS: UiPlan[] = pricingPlans.map((p) => {
    const isFree = p.monthlyAmountWon === 0;
    const isCurrent = currentPlanId === p.id;
    const originalPrice = fmtKRW(p.monthlyAmountWon);
    const currentPriceVal =
      (p as any).discountedAmountWon ?? p.monthlyAmountWon;
    const currentPrice = fmtKRW(currentPriceVal);

    let quotaMain = "";
    let quotaSub: string | undefined = undefined;

    if (p.category === "CAREER") {
      quotaMain = formatAiQuotaSummary(p, "RESUME");
      quotaSub = "초안 생성 4유닛 · PDF 분석 5유닛 · 채팅 1유닛";
    } else if (p.category === "PRESS") {
      quotaMain = formatAiQuotaSummary(p, "PRESS");
      quotaSub = "초안 생성 5유닛 · 검토 3유닛 · 재작성 4유닛";
    }

    let cta = null;
    if (!isFree) {
      let label = "시작하기";
      let href = `/billing/checkout?plan=${p.id}`;
      let disabled = false;

      if (isCurrent) {
        label = "이용 중";
        disabled = true;
      } else if (!authed) {
        label = "로그인";
        href = `/login?next=${encodeURIComponent(href)}`;
      } else if (!canCheckout) {
        label = "관리자 권한 필요";
        disabled = true;
      }
      cta = { label, href, disabled };
    }

    return {
      id: p.id,
      name: p.name,
      category: p.category,
      price: currentPrice,
      originalPrice,
      quotaMain,
      quotaSub,
      blurb: p.blurb,
      badge: p.badge,
      promotionLabel: (p as any).promotionLabel,
      isFree,
      cta,
    };
  });

  return (
    <div className="w-full min-h-screen bg-background">
      <div className="container max-w-7xl py-20 px-4 sm:px-6">
        <div className="text-center mb-16 space-y-4">
          <h1 className="text-4xl font-extrabold tracking-tight lg:text-5xl text-foreground">
            심플한 가격, 강력한 기능
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            취업 준비생부터 기업 홍보팀까지
            <br className="sm:hidden" />
            목표에 맞는 최적의 플랜을 선택하세요.
          </p>
        </div>

        <PricingPlansClient plans={UI_PLANS} basePath="/pricing" />

        {/* ✅ [수정] FAQ Section (Toggle/Accordion 스타일) */}
        <section className="mt-32 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">
            자주 묻는 질문
          </h2>
          <div className="space-y-4">
            {FAQS.map((f, i) => (
              <details
                key={i}
                className="group border border-border/60 bg-card overflow-hidden transition-all hover:border-border open:border-primary/20"
              >
                <summary className="flex cursor-pointer items-center justify-between px-6 py-5 font-bold text-lg select-none list-none">
                  <span className="text-foreground group-open:text-primary transition-colors">
                    {f.q}
                  </span>
                  {/* 화살표 아이콘 (CSS로 회전) */}
                  <span className="transition-transform duration-300 group-open:rotate-180 text-muted-foreground">
                    <ChevronDown className="w-5 h-5" />
                  </span>
                </summary>
                <div className="px-6 pb-6 pt-0 text-muted-foreground leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="pt-2 border-t border-border/40">
                    {/* 줄바꿈 처리 */}
                    {f.a.split("\n").map((line, idx) => (
                      <p key={idx} className="mt-2">
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
