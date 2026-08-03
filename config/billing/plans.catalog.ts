export type CatalogPlanType = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
export type CatalogQuotaPeriod = "DAILY" | "MONTHLY" | "YEARLY";
export type CatalogPromotionType = "PERCENT" | "FIXED_AMOUNT";
export type CatalogPromotionDuration = "ONCE" | "REPEATING" | "FOREVER";
export type CatalogPlanCategory = "PRESS" | "CAREER" | "STANDARD";
export type CatalogProductLine = "PRESS" | "CAREER";
export type CatalogAiQuotaSurface = "PRESS" | "RESUME";
export type CatalogAiQuotaWindowKey = "5h" | "1w";

export interface CatalogPlanPromotion {
  type: CatalogPromotionType;
  value: number;
  duration: CatalogPromotionDuration;
  durationMonths?: number;
  label?: string;
}

export type CatalogAiQuotaWindowPolicy = {
  key: CatalogAiQuotaWindowKey;
  label: string;
  durationMs: number;
  limitUnits: number;
};

export type CatalogAiQuotaSurfacePolicy = {
  windows: CatalogAiQuotaWindowPolicy[];
  unlimited?: boolean;
};

export type CatalogAiQuotaPolicy = Record<
  CatalogAiQuotaSurface,
  CatalogAiQuotaSurfacePolicy
>;

export type BillingPlanCatalogEntry = {
  id: string;
  code: string;
  name: string;
  category: CatalogPlanCategory;
  product: CatalogProductLine | null;
  planType: CatalogPlanType;
  monthlyAmountWon: number;
  quotaArticle: number;
  quotaArticleGenerates: number;
  quotaPeriod: CatalogQuotaPeriod;
  quotaResume: number;
  aiQuota: CatalogAiQuotaPolicy;
  unlimitedPressUsage?: boolean;
  perBrief: number;
  perPolish: number;
  blurb: string;
  badge?: string;
  promotion?: CatalogPlanPromotion;
  availableForPurchase?: boolean;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function rollingAiQuota(
  press5h: number,
  pressWeek: number,
  resume5h: number,
  resumeWeek: number,
): CatalogAiQuotaPolicy {
  return {
    PRESS: {
      windows: [
        { key: "5h", label: "5시간", durationMs: 5 * HOUR_MS, limitUnits: press5h },
        { key: "1w", label: "7일", durationMs: 7 * DAY_MS, limitUnits: pressWeek },
      ],
    },
    RESUME: {
      windows: [
        { key: "5h", label: "5시간", durationMs: 5 * HOUR_MS, limitUnits: resume5h },
        { key: "1w", label: "7일", durationMs: 7 * DAY_MS, limitUnits: resumeWeek },
      ],
    },
  };
}

function unlimitedPressQuota(policy: CatalogAiQuotaPolicy): CatalogAiQuotaPolicy {
  return {
    ...policy,
    PRESS: {
      ...policy.PRESS,
      unlimited: true,
    },
  };
}

export const BILLING_PLAN_CATALOG = [
  {
    id: "free_v1",
    code: "FREE",
    name: "Free",
    category: "STANDARD",
    product: null,
    planType: "FREE",
    monthlyAmountWon: 0,
    quotaArticle: 3,
    quotaArticleGenerates: 3,
    quotaPeriod: "MONTHLY",
    quotaResume: 10,
    aiQuota: unlimitedPressQuota(rollingAiQuota(16, 40, 15, 40)),
    unlimitedPressUsage: true,
    perBrief: 1,
    perPolish: 1,
    blurb: "기능 체험을 위한 무료 플랜",
  },
  {
    id: "basic_monthly_v1",
    code: "BASIC",
    name: "Press Basic",
    category: "PRESS",
    product: "PRESS",
    planType: "BASIC",
    monthlyAmountWon: 9900,
    quotaArticle: 30,
    quotaArticleGenerates: 30,
    quotaPeriod: "MONTHLY",
    quotaResume: 10,
    aiQuota: rollingAiQuota(60, 300, 15, 40),
    perBrief: 3,
    perPolish: 3,
    blurb: "1인 기업 및 스타트업 추천",
    availableForPurchase: false,
  },
  {
    id: "pro_monthly_v1",
    code: "PRO",
    name: "Press Pro",
    category: "PRESS",
    product: "PRESS",
    planType: "PRO",
    monthlyAmountWon: 29000,
    quotaArticle: 120,
    quotaArticleGenerates: 120,
    quotaPeriod: "MONTHLY",
    quotaResume: 10,
    aiQuota: rollingAiQuota(150, 900, 15, 40),
    perBrief: 5,
    perPolish: 5,
    blurb: "전문 마케터 및 성장하는 팀",
    badge: "Popular",
  },
  {
    id: "enterprise_monthly_v1",
    code: "ENTERPRISE",
    name: "Press Enterprise",
    category: "PRESS",
    product: "PRESS",
    planType: "ENTERPRISE",
    monthlyAmountWon: 99000,
    quotaArticle: 500,
    quotaArticleGenerates: 500,
    quotaPeriod: "MONTHLY",
    quotaResume: 10,
    aiQuota: rollingAiQuota(500, 3000, 15, 40),
    perBrief: 10,
    perPolish: 10,
    blurb: "PR 에이전시 및 대규모 조직",
  },
  {
    id: "career_basic_v1",
    code: "CAREER_BASIC",
    name: "Career Basic",
    category: "CAREER",
    product: "CAREER",
    planType: "BASIC",
    monthlyAmountWon: 5900,
    quotaArticle: 3,
    quotaArticleGenerates: 3,
    quotaPeriod: "MONTHLY",
    quotaResume: 150,
    aiQuota: rollingAiQuota(10, 25, 60, 300),
    perBrief: 1,
    perPolish: 1,
    blurb: "취업 준비의 시작",
    availableForPurchase: false,
  },
  {
    id: "career_pro_v1",
    code: "CAREER_PRO",
    name: "Career Pro",
    category: "CAREER",
    product: "CAREER",
    planType: "PRO",
    monthlyAmountWon: 12900,
    quotaArticle: 3,
    quotaArticleGenerates: 3,
    quotaPeriod: "MONTHLY",
    quotaResume: 2000,
    aiQuota: rollingAiQuota(10, 25, 180, 1200),
    perBrief: 1,
    perPolish: 1,
    blurb: "무제한 합격 패스",
    badge: "Best Value",
  },
  {
    id: "career_enterprise_v1",
    code: "CAREER_ENTERPRISE",
    name: "Career Enterprise",
    category: "CAREER",
    product: "CAREER",
    planType: "ENTERPRISE",
    monthlyAmountWon: 49000,
    quotaArticle: 3,
    quotaArticleGenerates: 3,
    quotaPeriod: "MONTHLY",
    quotaResume: 10000,
    aiQuota: rollingAiQuota(10, 25, 600, 4000),
    perBrief: 1,
    perPolish: 1,
    blurb: "채용 컨설턴트와 대규모 취업 지원 조직",
  },
  {
    id: "standard_pro_v1",
    code: "STANDARD_PRO",
    name: "All-in-One Pro",
    category: "STANDARD",
    product: null,
    planType: "PRO",
    monthlyAmountWon: 39000,
    quotaArticle: 100,
    quotaArticleGenerates: 100,
    quotaPeriod: "MONTHLY",
    quotaResume: 1000,
    aiQuota: rollingAiQuota(160, 900, 160, 900),
    perBrief: 5,
    perPolish: 5,
    blurb: "홍보와 채용을 한 번에",
    availableForPurchase: false,
  },
] satisfies readonly BillingPlanCatalogEntry[];
