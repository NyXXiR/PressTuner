# PostHog Insights

`briefflow`는 아직 단일 PostHog key를 쓰지만, 모든 대시보드와 인사이트는 아래 필터를 기본값으로 둡니다.

- `origin_project = briefflow`
- 필요 시 `environment = production`

## Core Events

- `page_viewed`
- `signup_started`
- `signup_completed`
- `login_started`
- `login_completed`
- `pricing_tab_changed`
- `pricing_plan_selected`
- `coupon_redeemed`
- `checkout_page_viewed`
- `checkout_started`
- `checkout_completed`
- `checkout_failed`
- `checkout_canceled`
- `downgrade_scheduled`
- `press_new_opened`
- `draft_generate_clicked`
- `draft_generated`
- `demo_brief_started`
- `demo_brief_generated`
- `demo_rate_limited`
- `cta_login_from_demo`

## Dashboard Plan

### `[PH][briefflow] Acquisition & Signup`

목적:
- 방문이 회원가입과 로그인으로 얼마나 이어지는지 본다.

권장 타일:
- Trend: `page_viewed`
- Trend: `signup_started`
- Trend: `signup_completed`
- Trend: `login_started`
- Trend: `login_completed`
- Funnel: `page_viewed -> signup_started -> signup_completed`
- Funnel: `page_viewed -> login_started -> login_completed`

해석 포인트:
- `signup_started` 대비 `signup_completed`가 낮으면 가입 폼/약관 단계 이탈을 본다.
- `login_started` 대비 `login_completed`가 낮으면 인증 실패나 리다이렉트 문제를 의심한다.

### `[PH][briefflow] Pricing & Checkout`

목적:
- 어떤 플랜이 선택되고, 실제 결제 완료까지 어디서 막히는지 본다.

권장 타일:
- Trend: `pricing_tab_changed` breakdown by `pricing_tab`
- Trend: `pricing_plan_selected` breakdown by `plan_id`
- Trend: `coupon_redeemed`
- Trend: `checkout_page_viewed` breakdown by `intent`
- Trend: `checkout_started` breakdown by `pay_provider`
- Trend: `checkout_completed` breakdown by `plan_id`
- Trend: `checkout_failed` breakdown by `error_code`
- Trend: `checkout_canceled` breakdown by `stage`
- Trend: `downgrade_scheduled` breakdown by `plan_id`
- Funnel: `pricing_plan_selected -> checkout_page_viewed -> checkout_started -> checkout_completed`

해석 포인트:
- `checkout_page_viewed`는 높고 `checkout_started`가 낮으면 가격/결제수단 UI 문제일 가능성이 높다.
- `checkout_started`는 높은데 `checkout_completed`가 낮으면 PG/결제 승인/완료 API 쪽을 본다.
- `checkout_failed`의 `error_code` 상위값은 운영 대응 우선순위다.

### `[PH][briefflow] Draft Activation`

목적:
- 가입/로그인 이후 사용자가 실제로 초안을 생성하는지 본다.

권장 타일:
- Trend: `press_new_opened`
- Trend: `draft_generate_clicked`
- Trend: `draft_generated`
- Trend: `demo_brief_started`
- Trend: `demo_brief_generated`
- Trend: `demo_rate_limited`
- Funnel: `login_completed -> press_new_opened -> draft_generate_clicked -> draft_generated`
- Funnel: `page_viewed -> demo_brief_started -> demo_brief_generated -> cta_login_from_demo`

해석 포인트:
- 로그인은 되는데 `press_new_opened`가 낮으면 첫 화면 CTA가 약한 것이다.
- `draft_generate_clicked` 대비 `draft_generated`가 낮으면 생성 실패나 속도 문제를 본다.

## Saved Insights

- `[PH][briefflow] Selected Plans by Week`
  - Event: `pricing_plan_selected`
  - Breakdown: `plan_id`

- `[PH][briefflow] Checkout Completion Rate`
  - Funnel: `checkout_page_viewed -> checkout_started -> checkout_completed`
  - Breakdown: `plan_id`

- `[PH][briefflow] Checkout Failures by Error Code`
  - Event: `checkout_failed`
  - Breakdown: `error_code`

- `[PH][briefflow] Provider Mix`
  - Event: `checkout_started`
  - Breakdown: `pay_provider`

- `[PH][briefflow] Draft Generation Activation`
  - Funnel: `login_completed -> press_new_opened -> draft_generate_clicked -> draft_generated`

## Recommended Breakdowns

- `plan_id`
- `plan_category`
- `pay_provider`
- `intent`
- `pricing_tab`
- `has_coupon`
- `environment`

## Caveats

- 결제는 외부 PG를 거치므로 `checkout_canceled`와 `checkout_failed`는 분리해서 봐야 한다.
- `checkout_page_viewed`와 `checkout_started` 사이 이탈은 제품 UX 문제일 가능성이 크고, `checkout_started` 이후 이탈은 결제 연동 문제일 가능성이 크다.
