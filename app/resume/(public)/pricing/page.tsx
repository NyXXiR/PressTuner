import PricingPlansClient from "@/app/(dashboard)/(public)/pricing/PricingPlansClient";
import { PageHeader } from "@/components/page/PageHeader";
import { formatAiQuotaSummary, listPricingPlans } from "@/config/billing/plans";
import { ChevronDown } from "lucide-react";

export const metadata = {
  title: "Pricing | brieFFlow",
  description:
    "브리프 생성, 보도자료 작성, AI 검토/문장 다듬기까지. brieFFlow 플랜을 확인하세요.",
};

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

export default async function ResumePricingPage() {
  const pricingPlans = listPricingPlans();

  const UI_PLANS = pricingPlans.map((p) => {
    const format = (n: number) => n.toLocaleString("ko-KR");
    const discounted = (p as any).discountedAmountWon ?? p.monthlyAmountWon;
    const price = discounted === 0 ? "무료" : `₩${format(discounted)}`;
    const originalPrice =
      discounted < p.monthlyAmountWon && p.monthlyAmountWon > 0
        ? `₩${format(p.monthlyAmountWon)}`
        : "";

    return {
      id: p.id,
      name: p.name,
      category: p.category,
      price,
      originalPrice,
      quotaMain: formatAiQuotaSummary(p, "RESUME"),
      quotaSub: `초안 생성 4유닛 · PDF 분석 5유닛 · 채팅 1유닛`,
      blurb: p.blurb,
      badge: p.badge,
      promotionLabel: (p as any).promotionLabel,
      isFree: p.monthlyAmountWon === 0,
      cta:
        p.monthlyAmountWon === 0
          ? { label: "무료로 시작하기", href: "/resume/dashboard" }
          : {
              label: "결제하기",
              href: `/billing/checkout?plan=${encodeURIComponent(p.id)}`,
            },
    };
  });

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20 pt-8 sm:pt-10">
      <PageHeader
        className="mb-6"
        eyebrow="Pricing"
        title="심플한 가격, 강력한 기능"
        description="취업 준비생부터 기업 홍보팀까지 목표에 맞는 최적의 플랜을 선택하세요."
      />

      <section className="border border-border bg-card p-5 sm:p-6">
        <PricingPlansClient
          plans={UI_PLANS}
          basePath="/resume/pricing"
          defaultTab="CAREER"
        />
      </section>

      <section className="mt-10 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-6">
          자주 묻는 질문
        </h2>
        <div className="space-y-3">
          {FAQS.map((f, i) => (
            <details
              key={i}
              className="group border border-border bg-card overflow-hidden transition-colors"
            >
              <summary className="flex cursor-pointer items-center justify-between px-6 py-5 font-bold text-lg select-none list-none">
                <span className="text-foreground group-open:text-primary transition-colors">
                  {f.q}
                </span>
                <span className="transition-transform duration-300 group-open:rotate-180 text-muted-foreground">
                  <ChevronDown className="w-5 h-5" />
                </span>
              </summary>
              <div className="px-6 pb-6 pt-0 text-muted-foreground leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="pt-2 border-t border-border/40">
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
  );
}
