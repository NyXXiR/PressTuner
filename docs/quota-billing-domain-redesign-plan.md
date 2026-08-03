# Quota And Billing Domain Redesign Plan

작성일: 2026-06-11 KST

## 목표

brieFFlow의 Press와 Resume AI 사용량을 기존 월간 횟수 차감 모델에서
`Claude Code`나 `Codex`처럼 짧은 rolling window와 긴 rolling window를 함께 쓰는
티어별 quota 모델로 개편한다. 사용자가 한도에 도달하면 AI 요청을 막고, 다음 리필
시각과 업그레이드 CTA를 일관되게 안내한다.

결제 도메인은 기존 구독 lifecycle, 쿠폰, 프로모션, 예약 다운그레이드, 미납 복구,
무료 플랜 복귀 규칙을 유지하되, quota 계산을 구독 snapshot 컬럼에 과도하게 의존하지
않도록 분리한다.

## 현재 구조 요약

- `config/billing/plans.catalog.ts`가 가격, 플랜 카테고리, 판매 여부, quota의 원천이다.
  `config/billing/plans.ts`는 catalog를 감싸는 helper layer다.
- `Team`은 결제 aggregate로서 `planId`, `plan`, `planCategory`,
  `membershipStatus`, `nextPaymentAmount`, `planExpiresAt`, `nextBillingAt`,
  `pendingPlan*`, `limit*`, `usage*`를 snapshot으로 가진다.
- `lib/services/usageService.ts`는 `Team.usageArticleMonthly`와
  `Team.usageResumeMonthly`를 증가시켜 global quota를 차감한다.
- `lib/services/simplifiedPressQuotaService.ts`는 Press simplified flow 전용으로
  한도 도달과 리필 안내 메시지를 일부 제공하지만, 저장 구조는 여전히 월간 counter다.
- `PressTuner-scheduler`는 별도 레포이며 `src/domain/billing.ts`,
  `prisma/schema.prisma` 복사본을 가진다. billing plan catalog는
  `sync-billing-catalog.js`로 앱 repo의 catalog를 동기화한다.

## 새 quota 정책

### 개념

- quota는 `surface`별로 분리한다.
  - `PRESS`: 보도자료, 브리프, 윤문, 리뷰, Press AI 패널
  - `RESUME`: 지원서 초안, 전략, 첨삭, 경험 브릭 추출, Resume AI 패널
- 각 플랜은 surface별 rolling windows를 가진다.
  - 짧은 window 예: `5h`
  - 긴 window 예: `1w`
- AI 요청은 action별 weight를 가진다.
  - 가벼운 chat/guide 요청은 1 unit
  - 초안 생성, parsing, 전체 rewrite처럼 무거운 요청은 더 많은 units
- 요청이 들어오면 모든 window에서 `used + requestedUnits <= limitUnits`를 만족해야 한다.
- 하나라도 초과하면 요청을 실행하지 않고 가장 빠르게 회복되는 `resetAt`을 안내한다.

### 1차 action weights

| Action | Surface | Units | 이유 |
| --- | --- | ---: | --- |
| `press_panel_chat` | PRESS | 1 | 짧은 안내/계획형 요청 |
| `press_brief_normalize` | PRESS | 2 | 입력 정리/구조화 |
| `press_review` | PRESS | 3 | 검토와 제안 생성 |
| `press_rewrite` | PRESS | 4 | 기존 글 rewrite |
| `press_draft_generate` | PRESS | 5 | 전체 보도자료 초안 생성 |
| `resume_chat` | RESUME | 1 | 짧은 지원서 보조 요청 |
| `resume_polish` | RESUME | 2 | 단일 답변 첨삭 |
| `resume_brick_extract` | RESUME | 3 | 경험 추출/정리 |
| `resume_strategy` | RESUME | 3 | 문항 전략 생성 |
| `resume_repolish` | RESUME | 3 | 조건 기반 재작성 |
| `resume_generate` | RESUME | 4 | 단일 답변 초안 생성 |
| `resume_parse` | RESUME | 5 | 파일/긴 이력서 parsing |

## 저장 전략

### 1차 구현

새 schema를 바로 크게 늘리지 않고 기존 `UsageLog`를 quota event ledger로 사용한다.

- `UsageLog.cost`: quota units
- `UsageLog.model`: `quota:${surface}:${action}`
- `UsageLog.meta.quota`: surface, action, units, window 정책 version
- `UsageLog.createdAt`: rolling window 계산 기준

장점:

- migration 없이 5h/week rolling quota를 시작할 수 있다.
- scheduler reset이 필요 없다.
- 기존 `Team.limit*`, `Team.usage*` 컬럼과 병행 가능하다.
- 추후 성능 문제가 생기면 `TeamQuotaBucket` snapshot 테이블로 승격할 수 있다.

### 2차 후보 schema

트래픽이 늘면 다음 테이블을 추가한다.

- `TeamQuotaBucket`
  - `teamId`
  - `surface`
  - `bucket`
  - `windowKey`
  - `limitUnits`
  - `usedUnits`
  - `windowStartedAt`
  - `windowEndsAt`
- `TeamTrialGrant`
  - `teamId`
  - `userId`
  - `trialPlanId`
  - `claimedAt`
  - `expiresAt`
  - `status`

## 결제 도메인 규칙

- `Team`은 계속 결제 aggregate다.
- 현재 구독 상태의 authority는 `Team` snapshot이다.
- plan catalog 변경은 `config/billing/plans.ts`에서 시작한다.
- scheduler의 billing domain 복사본은 수동 mirror가 필요하다. plan catalog는
  scheduler의 `sync` 스크립트로 앱 repo의 `config/billing/plans.catalog.ts`를 복사한다.
- `team.nextPaymentAmount`는 다음 실제 청구 금액의 source of truth다.
- 할인/쿠폰/프로모션은 quote와 complete가 같은 계산 함수를 사용해야 한다.
- 할인 적용은 다음 두 값을 분리한다.
  - `payNowAmountWon`: 이번 결제 금액
  - `nextPaymentAmount`: 다음 갱신 결제 금액
- 일시 할인은 `payNowAmountWon`에만 반영하고, 반복 할인은 duration metadata와 함께
  다음 결제 금액 계산에도 반영해야 한다.
- 예약 다운그레이드는 지금 결제를 만들지 않고 `pendingPlan*`과
  `nextPaymentAmount`만 안전하게 갱신한다.
- 미납 복구는 실패 직전의 pending plan 적용 여부를 동일하게 판단해야 한다.

## 신규가입 Pro 체험 정책

- 신규가입 직후 자동으로 Pro 체험을 켜지 않는다.
- 신규가입 팀은 `Free` 상태로 시작한다.
- 사용자가 명시적으로 `1개월 Pro 체험 시작`을 누를 때만 1회성 trial을 claim한다.
- trial claim은 결제수단 없이 구독 snapshot을 Pro로 바꾼다.
  - `membershipStatus = ACTIVE`
  - `planId = trial target Pro plan`
  - `planExpiresAt = now + 1 month`
  - `nextBillingAt = null`
  - `billingKey = null`
  - `nextPaymentAmount = 0`
- trial 만료 후 scheduler가 Free로 복귀시킨다.
- trial은 surface별로 분리한다.
  - `PRESS`: `pro_monthly_v1`
  - `RESUME`: `career_pro_v1`
- 같은 사용자는 같은 surface trial을 1회만 claim할 수 있어야 한다.
- 활성 유료 플랜이 이미 있으면 trial claim을 막는다.

## 구현 단계

1. plan catalog에 `aiQuota` policy를 추가한다.
2. `domain/quota`에 rolling window quota service를 만든다.
3. 기존 `usageService`의 global quota 차감 API를 새 quota service로 연결한다.
4. Press simplified quota service를 새 quota service adapter로 바꾼다.
5. Resume 주요 AI 요청에 action별 weight를 연결한다.
6. AI panel rate limit도 rolling quota를 함께 확인하게 한다.
7. pricing/my/header quota copy를 월간 횟수에서 rolling quota copy로 바꾼다.
8. trial claim 도메인/API/UI를 추가한다.
9. coupon/promotion quote/complete 계산을 공통 함수로 수렴한다.
10. `PressTuner-scheduler`의 plan config, billing domain, schema mirror를 갱신한다.
11. tests:
    - quota window 계산
    - quota limit error와 refill 안내
    - weighted action 차감
    - trial claim 1회 제한
    - checkout quote와 complete 금액 일치
    - scheduler renewal/expired/trial downgrade

## 이번 1차 구현 범위

- plan catalog `aiQuota` 추가
- rolling quota domain 추가
- `UsageLog` 기반 quota 조회/차감
- 기존 Press/Resume 주요 AI 차감 API를 새 quota에 연결
- Press simplified quota adapter 교체
- `/api/me` usage summary를 rolling quota 기준으로 노출
- pricing quota copy를 rolling window 기준으로 변경
- `POST /api/billing/trial/claim` API 추가
- `PressTuner-scheduler` plan config mirror 갱신
- 관련 단위 테스트 추가

## 후속 범위

- trial claim UI 노출
- coupon/promotion quote/complete 공통화
- trial claim 서비스 통합 테스트
- scheduler trial 만료/Free 복귀 회귀 테스트 보강
- legacy monthly quota 컬럼 deprecate

## 2026-06-11 도메인 hardening 반영

- `AiQuotaOverride` 테이블을 추가해 super-admin이 AI quota를 운영 중 조정할 수 있게 한다.
  - window limit override: `planId + surface + windowKey`
  - action weight override: `action`
  - 기본값과 같은 값 또는 빈 값은 override 삭제로 처리한다.
- 런타임 quota 계산은 `config/billing/plans.ts` 기본값을 읽은 뒤 enabled override를 적용한다.
  - 테이블이 아직 없는 환경에서는 기본 catalog로 fallback한다.
  - 호출 코드가 명시적으로 `units`를 넘긴 경우에는 action weight override보다 호출 값을 우선한다.
- 결제 완료는 같은 `attemptId`/external payment id에 대해 멱등 처리한다.
  - 이미 성공한 같은 팀의 완료 요청은 재청구/재연장하지 않는다.
  - 다른 팀이 같은 attempt를 재사용하면 차단한다.
- 할인 쿠폰은 결제 전 `coupon` row lock 안에서 재검증하고, quote와 complete의 할인 결과가
  달라지면 `COUPON_REQUOTE_REQUIRED`로 중단한다.
- AI quota 차감은 팀 row lock 안에서 한도 확인과 `UsageLog` 기록을 함께 수행해 동시 요청의
  초과 사용을 막는다.
- production에서는 legacy 관리 화면뿐 아니라 legacy 관리 API도 proxy에서 404로 차단한다.
  - `/api/team*`, `/api/admin*`, `/api/users*`, `/api/style-guides*`, `/api/guides*`,
    `/api/reviews*`
  - legacy pending/reviewer/approval API
- checkout 결제 시작/완료는 서버 발급 `CheckoutIntent` 기반으로 수렴한다.
  - browser SDK prepare도 intent token을 통해서만 진행한다.
  - direct `/api/portone/payments/prepare`와 `/api/portone/payments/complete`는 production에서
    기본 비활성화한다.
- 결제수단 변경은 카드번호를 Presstuner API로 보내지 않는다.
  - Inicis/KakaoPay 모두 PortOne browser SDK에서 billingKey를 발급한다.
  - 서버에는 `billingKey` attach 요청만 보낸다.
  - 기존 raw-card Inicis issue API는 production에서 기본 비활성화한다.

## 남은 점검 범위

- 공개 demo인 `/api/brief/normalize`는 IP 일일 제한형으로 유지 중이다. 추후 abuse가 보이면
  captcha, anonymous quota bucket, 로그인 유도 정책 중 하나로 강화한다.
- raw-card Inicis issue domain 파일은 dev fallback과 회귀 테스트 용도로 남아 있다. 운영에서
  완전히 제거할 시점이 오면 route와 domain/test를 함께 삭제한다.
- checkout/payment method redirect 완료 화면은 browser SDK redirect 결과를 처리하지만,
  실제 PG별 redirect query shape는 staging에서 한 번 더 확인해야 한다.

## 2026-07-20 Press/Career 제품별 구독 분리 구현 계획

### 배경

2026-07-20 점검 결과, 현재 catalog와 billing snapshot은 Press와 Career를 같은
`Team.plan`, `Team.planId`, `PlanType` 축에 섞어 저장한다. 이 때문에 Career Enterprise로
변경한 팀이 공통 화면이나 Press 문맥에서 `10/10` PRESS AI 유닛을 보게 되고, 사용자는
"Enterprise로 올렸는데 왜 10개인가"로 이해한다.

더 큰 문제는 과금 계산이 `PlanType`을 기준으로 current price를 찾는 부분이다.
`BASIC`, `PRO`, `ENTERPRISE`는 Press와 Career가 공유하는 등급명일 뿐인데,
`monthlyWonOfPlanType(PRO)`처럼 조회하면 Press Pro와 Career Pro 중 어떤 가격을 써야
하는지 결정할 수 없다. 결제와 quota의 source of truth는 `PlanType`이 아니라
`product + planId`여야 한다.

이 섹션은 다른 구현 AI가 Press/Career를 제품별로 독립 과금하고, quota 표시를 일관되게
바꾸기 위한 handoff 문서다.

### Intent Frame

- User goal: Press와 Career를 섞지 않고, 사용자가 현재 어떤 제품의 요금제와 AI 한도를
  보고 있는지 즉시 이해하게 한다.
- Current behavior:
  - `config/billing/plans.catalog.ts` 한 catalog에 Press/Career/Standard 플랜이 함께 있다.
  - `Team`은 하나의 `planId`, `plan`, `planCategory`, `membershipStatus`, billing cycle,
    pending plan, limit snapshot만 가진다.
  - `/api/me`의 `usage.article`/`usage.resume`은 rolling AI quota를 내려주지만 이름과
    UI copy는 월간 사용량/크레딧처럼 보인다.
  - Header는 pathname에 `/resume`이 없으면 Press quota를 보여준다.
- Target behavior:
  - 한 팀은 Press 구독과 Career 구독을 각각 가질 수 있다.
  - 결제수단과 팀 멤버십은 공유할 수 있지만, product별 plan, status, billing cycle,
    pending change, quota entitlement는 독립이다.
  - Press 화면은 Press 구독과 Press AI 유닛을, Career/Resume 화면은 Career 구독과
    Career AI 유닛을 표시한다.
  - 공통 화면은 현재 보고 있는 product를 명시하거나 두 product 상태를 함께 표시한다.
- Practical boundary:
  - 1차에서는 product별 구독 read/write 경로를 추가하고, 기존 `Team` billing snapshot은
    호환 layer로 유지한다.
  - 기존 결제수단 저장 위치(`Team.billingKey`, `Team.payProvider`)는 즉시 분리하지 않는다.
    구독 분리 후 필요하면 `TeamBillingProfile`로 승격한다.
- Included:
  - plan catalog typing, billing quote/checkout/renewal lifecycle, trial/coupon path,
    `/api/me`, quota state, Header/pricing/my/billing sandbox UI, scheduler mirror plan.
- Excluded:
  - PG 결제수단 발급 방식 변경.
  - 기존 paid user의 약관/가격 변경 자동 고지.
  - `UsageLog`를 `TeamQuotaBucket`으로 승격하는 성능 최적화.

### Domain Terms

- `ProductLine`: 독립적으로 판매/구독/청구되는 제품. 1차 값은 `PRESS`, `CAREER`.
- `PlanTier`: Free/Basic/Pro/Enterprise 같은 등급명. Prisma의 기존 `PlanType`과 대응하지만,
  과금 key로 사용하지 않는다.
- `PlanId`: 실제 SKU id. 예: `pro_monthly_v1`, `career_enterprise_v1`.
- `ProductSubscription`: `teamId + product`에 대한 현재 구독 상태와 billing cycle.
- `AI Surface`: quota가 차감되는 기능 표면. 현재 `PRESS`, `RESUME`.
  `ProductLine.CAREER`는 `AI Surface.RESUME`을 소유한다.
- `AI Unit`: rolling quota 차감 단위. UI에서는 "크레딧"이나 "횟수" 대신 "AI 유닛"으로 부른다.
- `Product Allowance`: 월간/일간 생성량 같은 상품 제공량. 유지한다면 AI Unit과 별도 이름으로
  표시하고 집행한다.

### Domain Rules

- `PlanType` 또는 `PlanTier`만으로 가격, 업그레이드, 다운그레이드, quota entitlement를
  계산하지 않는다.
- 모든 결제 quote는 `currentProductSubscription.planId`와 `targetPlanId`를 기준으로 한다.
- `targetPlanId`의 product와 current subscription의 product가 다르면 plan change가 아니라
  별도 product 구매다.
- 같은 팀은 `PRESS`와 `CAREER` product subscription을 동시에 가질 수 있다.
- product subscription이 없거나 만료되면 해당 product는 product-specific Free plan으로
  fallback한다.
- `/api/me`는 legacy `usage`를 유지하더라도 새 read model `entitlements.press`와
  `entitlements.career`를 제공해야 한다.
- Header에 표시하는 `remaining`, `limit`, `resetAt`은 같은 quota window에서 나온 값이어야
  한다.
- 공통 화면에서 product를 추론할 수 없으면 quota pill을 숨기거나 product selector를 보여준다.
  암묵적으로 Press를 선택하지 않는다.
- `STANDARD`/All-in-One plan은 새 구매 경로에서 제외한다. 기존 데이터가 있으면 migration에서
  명시적으로 Press/Career subscriptions로 분해하거나 legacy bundle로 격리한다.

### Acceptance Contract

- [ ] Given 팀이 Career Enterprise만 구독 중일 때, when 사용자가 `/resume` 또는
  `/resume/write`를 연다, then Header는 Career/Resume AI 유닛 한도를 표시한다.
- [ ] Given 팀이 Career Enterprise만 구독 중일 때, when 사용자가 Press 화면을 연다, then
  Press는 Press Free 또는 별도 Press 구독 한도를 표시하고 Career Enterprise 한도를 섞지 않는다.
- [ ] Given 팀이 Press Pro와 Career Free를 동시에 가진 상태, when Press Pro에서 Career Pro를
  구매한다, then 기존 Press Pro 구독은 유지되고 Career product subscription만 활성화된다.
- [ ] Given 현재 Career Pro이고 target이 Career Enterprise일 때, when quote를 계산한다, then
  현재가는 `career_pro_v1.monthlyAmountWon`이고 Press Pro 가격을 쓰지 않는다.
- [ ] Given 현재 Press Pro이고 target이 Career Pro일 때, when checkout을 시작한다, then 이는
  같은 tier 변경이 아니라 Career product 신규 구매로 처리된다.
- [ ] Given rolling quota의 5시간 window와 7일 window가 서로 다른 reset/remaining을 가질 때,
  when `/api/me`가 quota를 반환한다, then 대표 `remaining/limit/resetAt`은 같은
  `bindingWindow`에서 온다.
- [ ] Given `/dev/billing-sandbox` 같은 공통 화면, when plan/quota를 표시한다, then 화면은
  현재 product를 명시하거나 Press/Career를 분리해서 표시한다.
- [ ] Given AI 유닛이 3 남고 자소서 초안 생성 cost가 4유닛일 때, when UI가 남은 사용량을
  안내한다, then "3회 남음"이 아니라 "3 AI 유닛 남음" 또는 "초안 생성 불가"로 표시한다.
- [ ] Given 기존 `Team.planId`만 있는 데이터, when migration이 실행된다, then product별
  subscription이 생성되고 기존 checkout/renewal은 이행 기간 동안 깨지지 않는다.

### Target Data Model

1차 schema 추가안:

```prisma
enum ProductLine {
  PRESS
  CAREER
}

model TeamProductSubscription {
  id                 String   @id @default(cuid()) @map("id")
  teamId             String   @map("team_id")
  product            ProductLine @map("product")

  planId             String?  @map("plan_id")
  planTier           PlanType @default(FREE) @map("plan_tier")
  membershipStatus   MembershipStatus @default(ACTIVE) @map("membership_status")

  payProvider        SubscriptionPayProvider? @map("pay_provider")
  nextBillingAt      DateTime? @map("next_billing_at")
  nextPaymentAmount  Int?     @default(0) @map("next_payment_amount")
  planExpiresAt      DateTime? @map("plan_expires_at")

  pendingPlanId       String?   @map("pending_plan_id")
  pendingPlanTier     PlanType? @map("pending_plan_tier")
  pendingPlanStartsAt DateTime? @map("pending_plan_starts_at")

  cancelRequestedAt  DateTime? @map("cancel_requested_at")
  lastPaymentId      String?   @map("last_payment_id")
  lastPaidAt         DateTime? @map("last_paid_at")

  createdAt          DateTime @default(now()) @map("created_at")
  updatedAt          DateTime @updatedAt @map("updated_at")

  team Team @relation(fields: [teamId], references: [id], onDelete: Cascade)

  @@unique([teamId, product])
  @@index([product, membershipStatus])
  @@index([nextBillingAt])
  @@index([planExpiresAt])
  @@map("team_product_subscription")
}
```

Notes:

- `Team.billingKey` and `Team.payProvider` remain the shared billing profile in phase 1.
- `Team.planId`, `Team.plan`, `Team.planCategory`, `Team.membershipStatus`, `pendingPlan*`,
  `nextBillingAt`, `nextPaymentAmount`, `limit*`, `usage*` remain legacy compatibility fields until
  all readers are migrated.
- Do not add product-specific monthly usage counters unless Product Allowance remains a separate
  business rule. Rolling AI quota should continue to use `UsageLog`.
- Add `Team.productSubscriptions` relation to `Team`.
- Mirror the schema to `PressTuner-scheduler` only after the app schema and migration are stable.

### Plan Catalog Changes

Target typing:

```ts
export type ProductLine = "PRESS" | "CAREER";
export type PlanTier = "FREE" | "BASIC" | "PRO" | "ENTERPRISE";

export type BillingPlanCatalogEntry = {
  id: string;
  product: ProductLine;
  tier: PlanTier;
  name: string;
  monthlyAmountWon: number;
  aiQuota: CatalogAiQuotaPolicy;
  productAllowance?: {
    articleGenerateMonthly?: number;
    resumeGenerateMonthly?: number;
  };
  availableForPurchase?: boolean;
};
```

Implementation rules:

- Keep existing plan ids stable during migration. Do not rename persisted ids in the same change.
- Add a `product` field to every purchasable plan. Existing `category` can be mapped, but new code
  should use `product`.
- `free_v1` should become a legacy alias only. Add product-specific Free ids before final cleanup:
  `press_free_v1`, `career_free_v1`.
- `standard_pro_v1` remains unavailable for purchase. Migration must either:
  - split it into Press and Career subscriptions with an explicit legacy note, or
  - keep it as a legacy bundle that cannot be changed except by admin-assisted migration.
- Replace `monthlyWonOfPlanType()` with:

```ts
getMonthlyAmountByPlanId(planId: string | null | undefined): number
getPlanProduct(planId: string): ProductLine
listPricingPlansByProduct(product: ProductLine): BillingPlan[]
getFreePlanIdForProduct(product: ProductLine): PlanId
```

`monthlyWonOfPlanType()` should be deleted or marked test-failing deprecated so no billing path can
call it.

### Billing Flow Changes

Add a product-aware read/write layer before changing route handlers:

```ts
getProductSubscription(teamId, product)
getEffectiveProductSubscription(teamId, product)
buildProductSubscriptionPatch(targetPlanId, product, ...)
computeProductSubscriptionQuote({ product, targetPlanId, currentSubscription })
```

Rules:

- Checkout must receive or derive `product` from `targetPlanId`.
- Quote must reject mismatched `product + targetPlanId`.
- Upgrade/downgrade tier comparison only applies within the same product.
- Press subscription cancellation must not cancel Career subscription.
- Career trial claim must not mutate Press subscription.
- Coupon validation must validate against `targetPlanId`, not `PlanType`.
- Renewal scheduler must iterate product subscriptions, not teams with a single active plan.
- During phase 1 dual-write, checkout/renewal should update both:
  - `TeamProductSubscription` for the target product.
  - legacy `Team` snapshot only when needed for old screens.

Priority file audit:

- `domain/billing/subscription/policy.ts`
- `domain/billing/subscription/pricing.ts`
- `domain/billing/subscription/lifecycle.ts`
- `domain/billing/subscription/completeWithBillingKey.ts`
- `domain/billing/subscription/complete.ts`
- `domain/billing/subscription/quote.ts`
- `domain/billing/subscription/commands.ts`
- `domain/billing/subscription/pastDueRecovery.ts`
- `lib/services/billing/subscriptionService.ts`
- `lib/services/billing/devBillingSandboxService.ts`
- `lib/services/trialService.ts`
- `lib/services/couponRedeemService.ts`
- scheduler repo billing renewal and catalog mirror files.

### Quota And Entitlement API Changes

Current issue:

- `getUsageSummaryForTeam()` comments say DB snapshot usage/limit, but implementation uses rolling
  AI quota.
- `article`/`resume` response names are feature names, not product subscriptions.
- Header copy calls AI units "크레딧" or "횟수".

Target `/api/me` read model:

```ts
type MeEntitlements = {
  press: ProductEntitlementView;
  career: ProductEntitlementView;
};

type ProductEntitlementView = {
  product: "PRESS" | "CAREER";
  planId: string;
  planName: string;
  tier: "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
  membershipStatus: string;
  isSubscriptionActive: boolean;
  aiQuota: {
    surface: "PRESS" | "RESUME";
    status: "available" | "near_limit" | "limited";
    requestedUnits: number;
    bindingWindow: {
      key: "5h" | "1w";
      label: string;
      limitUnits: number;
      usedUnits: number;
      remainingUnits: number;
      resetAt: string;
      resetLabel: string;
    };
    windows: AiQuotaWindowState[];
  };
};
```

Implementation rules:

- Keep legacy `usage.article` and `usage.resume` for one release, but populate them from
  `entitlements.press.aiQuota.bindingWindow` and `entitlements.career.aiQuota.bindingWindow`.
- Fix `domain/quota/aiQuota.ts` so representative `remainingUnits`, `limitUnits`, `usedUnits`, and
  `periodEnd` all come from one `bindingWindow`.
- `getAiQuotaStateForSurface()` should resolve plan by product subscription:
  - `PRESS` surface -> `ProductLine.PRESS`
  - `RESUME` surface -> `ProductLine.CAREER`
  - fallback to product-specific Free plan.
- Do not use `Team.planId` as the primary quota plan after the product subscription read path exists.

### UI Surface Rules

- Press workspace routes show Press plan/quota.
- Resume/Career routes show Career plan/quota.
- Pricing pages list only their product plans:
  - `/press/pricing` -> Press plans.
  - `/resume/pricing` -> Career plans.
  - generic `/pricing` must either have tabs or route to a product-specific page.
- Header quota pill:
  - product workspace: show one product's AI unit status.
  - common/billing/sandbox/my pages: show explicit product selector, two compact rows, or no pill.
  - do not infer Press just because pathname is not `/resume`.
- Copy vocabulary:
  - Use `AI 유닛` for rolling quota.
  - Use `생성량` or `월간 생성 제공량` for Product Allowance if retained.
  - Avoid `크레딧` unless a purchasable credit ledger is reintroduced.
  - Avoid `횟수` unless the UI computes action-specific count: `Math.floor(remainingUnits / actionUnits)`.

Priority file audit:

- `components/layout/Header.tsx`
- `stores/useMeStore.tsx`
- `app/(dashboard)/(public)/pricing/page.tsx`
- `app/(dashboard)/press/(public)/pricing/page.tsx`
- `app/resume/(public)/pricing/page.tsx`
- `app/(dashboard)/dev/billing-sandbox/DevBillingSandboxClient.tsx`
- `app/(dashboard)/my/page.tsx`
- `app/resume/write/components/WriteFlowRoot.tsx`

### Migration Plan

Phase 0: guardrail fixes before schema split

- Add failing tests for Career Pro -> Career Enterprise price delta.
- Replace `monthlyWonOfPlanType()` usages in active billing paths with planId-based pricing.
- Add `bindingWindow` to `AiQuotaState` and make legacy fields use it.
- Update copy from credits/counts to AI units where quota is rolling AI quota.

Phase 1: catalog and types

- Add `ProductLine`/`product` to catalog entries.
- Add product-specific Free plan ids.
- Add helpers that list and resolve plans by product.
- Make `STANDARD` unavailable in all new purchase paths.
- Add tests that Press/Career plan ids cannot be mixed in one quote.

Phase 2: schema and backfill

- Add `ProductLine` enum and `TeamProductSubscription` model.
- Add migration/backfill script:
  - `planCategory = PRESS`: create active Press subscription from `Team.planId`; create Career Free.
  - `planCategory = CAREER`: create active Career subscription from `Team.planId`; create Press Free.
  - `planCategory = STANDARD` and `planId = free_v1`: create both product Free subscriptions.
  - `planCategory = STANDARD` and paid legacy plan: create explicit legacy handling report before
    auto-migration. Do not silently change paid entitlements.
- Add unique `(teamId, product)` enforcement.
- Add repository functions and tests for fallback behavior.

Phase 3: billing domain switch

- Change quote/checkout/complete/renewal/cancel/trial/coupon services to use product subscription.
- Dual-write legacy `Team` snapshot only for compatibility.
- Add product to billing history/order metadata.
- Ensure idempotency keys include product where necessary.

Phase 4: quota and API switch

- Change `getAiQuotaStateForSurface()` plan resolution to product subscription.
- Add `/api/me.entitlements`.
- Keep legacy `/api/me.usage` mapped from the new view.
- Change Header and stores to consume `entitlements`.

Phase 5: UI and sandbox

- Product-specific pricing and checkout entry points.
- Billing sandbox product selector and product-specific subscribe/renew/cancel actions.
- My/Billing pages show Press and Career subscriptions separately.
- Header/common surface rule implemented.

Phase 6: scheduler mirror

- Sync Prisma schema to scheduler repo.
- Change renewal job to process `TeamProductSubscription`.
- Change past-due recovery and expired-to-free rules per product.
- Keep KST cycle rules unchanged.

Phase 7: legacy cleanup

- Remove active use of `Team.planId`, `Team.plan`, `Team.planCategory`, `Team.membershipStatus`,
  `pendingPlan*`, `limit*`, `usage*` from app readers.
- Update `docs/domain-rules.md` after implementation: `Team` becomes account/team aggregate;
  `TeamProductSubscription` becomes billing subscription aggregate.
- Delete deprecated helpers only after tests prove no references remain.

### Change Boundary

- Touch:
  - `config/billing/plans.catalog.ts`
  - `config/billing/plans.ts`
  - `prisma/schema.prisma`
  - `domain/billing/subscription/*`
  - `domain/quota/aiQuota.ts`
  - `lib/services/usageService.ts`
  - `lib/services/meService.ts`
  - billing/trial/coupon services
  - Header/pricing/my/billing sandbox UI
  - scheduler mirror after app changes stabilize
- Do not touch in the same first PR:
  - PG card issuing flow.
  - unrelated Resume writing domain files.
  - unrelated Press simplified editor behavior.
  - AI model/provider selection.
- Risky coupling:
  - `Team` currently acts as billing aggregate and many UI stores read it directly.
  - scheduler has mirrored schema/domain code.
  - legacy `STANDARD` plans may exist in local/dev data.
- Rollback strategy:
  - Phase 0 can be reverted independently.
  - Phases 1-3 should keep legacy Team snapshot dual-write so UI can fall back.
  - Do not drop legacy columns until production has run with product subscriptions for at least one
    billing cycle.

### Verification Strategy

Focused unit tests:

- `domain/billing/subscription/policy.test.ts`
  - Career Pro -> Career Enterprise uses Career Pro price.
  - Press Pro -> Career Pro is not same-product tier change.
  - same-product same-tier SKU switch schedules next-cycle change only within product.
- `config/billing/plans.test.ts` or existing equivalent
  - every purchasable plan has exactly one product.
  - no new purchase path lists `STANDARD`.
  - product-specific free plans exist.
- `domain/quota/aiQuota.test.ts`
  - `bindingWindow` is coherent.
  - representative legacy fields equal `bindingWindow`.
  - Press surface resolves Press product plan; Resume surface resolves Career product plan.
- product subscription repository/service tests
  - missing subscription falls back to product Free.
  - expired subscription falls back to product Free for entitlement.
  - Press/Career subscriptions coexist.

Integration/API tests:

- `/api/me` returns `entitlements.press` and `entitlements.career`.
- legacy `usage.article` and `usage.resume` are still present during compatibility period.
- checkout quote rejects mismatched product and target plan.
- trial claim mutates only the requested product subscription.
- coupon redeem validates target plan id/product.

Manual QA:

- `/dev/billing-sandbox`: switch Career to Enterprise; verify Career quota changes and Press quota
  remains Press Free.
- `/resume/write`: Header and near-limit banner use Career/Resume AI units.
- Press workspace: Header uses Press AI units.
- `/my` or billing page: Press and Career subscriptions are visually separate.
- pricing pages: each product page lists only its product plans.

Suggested commands:

```bash
npx tsx --test domain/billing/subscription/policy.test.ts
npx tsx --test domain/quota/aiQuota.test.ts
npx tsx --test lib/services/billing/devBillingSandboxService.test.ts
npx tsc --noEmit
npm test
npm run build
```

### User Flow QA

- Persona: 팀 owner가 Career Enterprise만 구매한 사용자.
- Entry point: `/dev/billing-sandbox`, `/resume/write`, Press workspace, `/my`.
- Happy path:
  - Career Enterprise 구매 후 Resume 화면에서 Career quota를 본다.
  - Press 화면에서는 Press Free quota를 본다.
  - `/my`에서 Press와 Career 구독 상태가 별도 줄로 보인다.
- Blocked path:
  - Press Pro를 가진 상태에서 Career Pro로 checkout하면 "Press Pro -> Career Pro 변경"이
    아니라 Career product 신규 구매로 설명된다.
  - product mismatch plan id로 quote API를 호출하면 400 계열 domain error를 반환한다.
- State continuity:
  - 새로고침 후 `/api/me.entitlements`가 같은 product별 상태를 반환한다.
  - pending downgrade/cancel은 해당 product에만 남는다.
- Verdict:
  - Phase별 자동 테스트와 브라우저 QA가 끝나기 전에는 legacy Team snapshot 제거 금지.

### Implementation Checklist

- [ ] Phase 0 guardrail tests 작성.
- [ ] `monthlyWonOfPlanType()` active billing path 제거.
- [ ] `AiQuotaState.bindingWindow` 추가 및 legacy field coherence 보장.
- [ ] catalog에 `product`와 product-specific Free plan 추가.
- [ ] product-aware plan helper 추가.
- [ ] Prisma `TeamProductSubscription` 추가.
- [ ] backfill migration/script 작성.
- [ ] product subscription repository/service 추가.
- [ ] quote/checkout/complete/renewal/cancel/trial/coupon product-aware 전환.
- [ ] `/api/me.entitlements` 추가.
- [ ] Header/store/pricing/my/sandbox UI 전환.
- [ ] scheduler schema/domain mirror 갱신.
- [ ] `docs/domain-rules.md`를 구현 완료 상태에 맞게 갱신.
- [ ] legacy Team billing snapshot 제거 여부를 별도 PR로 결정.

### Known Implementation Traps

- `PlanType`이 같다는 이유로 같은 tier 변경으로 처리하면 안 된다. product가 다르면 독립 구매다.
- `planCategory`는 기존 데이터 보정용 힌트일 뿐, 새 domain key가 아니다.
- `quotaResume: 10000` 같은 Product Allowance와 rolling AI unit을 같은 UI 숫자로 합치면 안 된다.
- `remainingUnits = Math.min(all windows)`를 쓰면서 `limitUnits`를 다른 window에서 가져오면 안 된다.
- Header에서 `!pathname.includes("/resume")`를 Press로 해석하면 공통 화면에서 다시 혼란이 생긴다.
- scheduler mirror를 빼먹으면 앱에서는 성공해도 갱신/만료 시점에 Team snapshot이 다시 깨질 수 있다.
