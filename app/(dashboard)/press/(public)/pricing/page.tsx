import PressPricingPlansClient, {
  type PressUiPlan,
} from "@/app/(dashboard)/press/(public)/pricing/PressPricingPlansClient";
import { PageHeader } from "@/components/page/PageHeader";
import { formatAiQuotaSummary, listPricingPlans } from "@/config/billing/plans";
import { ChevronDown } from "lucide-react";

export const metadata = {
  title: "요금제 | brieFFlow Press",
  description: "보도자료 작성량에 맞는 brieFFlow Press 플랜을 확인하세요.",
};

const FAQS = [
  {
    q: "무료 플랜으로 무엇을 할 수 있나요?",
    a: "Free 플랜은 가벼운 AI 사용을 체험할 수 있는 롤링 quota를 제공합니다. 초안 생성처럼 무거운 요청은 더 많은 유닛을 사용합니다.",
  },
  {
    q: "플랜 변경은 언제 적용되나요?",
    a: "상위 플랜 업그레이드는 즉시 적용되고, 낮은 단계로 변경하는 경우 다음 결제일부터 적용됩니다.",
  },
  {
    q: "제공 횟수는 이월되나요?",
    a: "AI 사용량은 5시간/7일 기준으로 자동 회복됩니다. 한도에 도달하면 다음 회복 시간과 업그레이드 안내가 표시됩니다.",
  },
];

export default async function PressPricingPage() {
  const pricingPlans = listPricingPlans();

  const plans: PressUiPlan[] = pricingPlans.map((plan) => {
    const format = (value: number) => value.toLocaleString("ko-KR");
    const discountedAmount = plan.discountedAmountWon ?? plan.monthlyAmountWon;
    const price = discountedAmount === 0 ? "무료" : `₩${format(discountedAmount)}`;
    const originalPrice =
      discountedAmount < plan.monthlyAmountWon && plan.monthlyAmountWon > 0
        ? `₩${format(plan.monthlyAmountWon)}`
        : "";

    return {
      id: plan.id,
      name: plan.name,
      category: plan.category,
      price,
      originalPrice,
      quotaMain: formatAiQuotaSummary(plan, "PRESS"),
      quotaSub: `초안 생성 5유닛 · 검토 3유닛 · 재작성 4유닛`,
      blurb: plan.blurb,
      badge: plan.badge,
      promotionLabel: plan.promotionLabel,
      isFree: plan.monthlyAmountWon === 0,
      cta:
        plan.monthlyAmountWon === 0
          ? { label: "무료로 시작하기", href: "/press/new" }
          : {
              label: "결제하기",
              href: `/billing/checkout?plan=${encodeURIComponent(plan.id)}`,
            },
    };
  });

  return (
    <div className="wongoji-sharp mx-auto w-full max-w-5xl pb-20">
      <header>
        <PageHeader
          eyebrow="Billing"
          title="요금제"
          description="보도자료 작성량에 맞는 플랜을 선택합니다."
        />
      </header>

      <PressPricingPlansClient plans={plans} basePath="/press/pricing" />

      <section className="mt-10" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-lg font-extrabold tracking-tight">
          자주 묻는 질문
        </h2>
        <div className="mt-3 border-t-2 border-foreground">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group border-b border-border">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-1 py-4 text-sm font-bold text-foreground">
                <span>{faq.q}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-1 pb-4 text-sm leading-relaxed text-muted-foreground">
                {faq.a}
              </p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
