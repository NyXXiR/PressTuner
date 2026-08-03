# Billing Lifecycle Matrix

현재 구독 라이프사이클은 `evaluateSubscriptionLifecycle()`를 기준으로 해석한다.

- 구현: `domain/billing/subscription/lifecycleMatrix.ts`
- 테스트: `domain/billing/subscription/lifecycleMatrix.test.ts`
- 서버 강제: `domain/billing/subscription/commands.ts`

## State Keys

| State | 조건 | 비고 |
| --- | --- | --- |
| `FREE` | `plan === FREE` | 무료 팀 |
| `ACTIVE` | 유료 플랜 + `membershipStatus === ACTIVE` + 만료 전 | 정상 자동결제 상태 |
| `ACTIVE_PENDING_DOWNGRADE` | `ACTIVE` + `pendingPlan*` 존재 | 다음 회차부터 다운그레이드 예약 |
| `CANCELED_ACTIVE` | `membershipStatus === CANCELED` 또는 `cancelRequestedAt` 존재 + 만료 전 | 해지 예약됨, 잔여 기간 사용 가능 |
| `PAST_DUE` | `membershipStatus === PAST_DUE` + 만료 전 | 정기결제 실패, 유예 기간 |
| `EXPIRED` | 유료 플랜 + 만료 지남 | scheduler cleanup 전 stale 상태 포함 |

## Screen Actions

| Action | FREE | ACTIVE | ACTIVE_PENDING_DOWNGRADE | CANCELED_ACTIVE | PAST_DUE | EXPIRED |
| --- | --- | --- | --- | --- | --- | --- |
| 구독 해지 | 불가 | 가능 | 가능 | 불가 | 가능 | 불가 |
| 자동결제 재개 | 불가 | 불가 | 불가 | 가능, 단 billingKey/provider 필요 | 불가 | 불가 |
| 예약 변경 취소 | 불가 | 불가 | 가능 | 불가 | 불가 | 불가 |
| 결제수단 변경 | 불가 | 가능 | 가능 | 가능 | 가능 | 불가 |
| 미납 복구 | 불가 | 불가 | 불가 | 불가 | 가능 | 불가 |
| 서비스 사용 | 가능 | 가능 | 가능 | 가능 | 가능 | 불가 |

## Checkout Target Actions

체크아웃은 현재 상태만으로 결정되지 않고 `targetPlanId`가 필요하다.  
현재 기준 로직은 `computeSubscriptionQuote()`와 `completeWithBillingKey()`가 결정한다.

- 무료/만료 상태에서 유료 플랜 선택: 신규 구독
- 활성 주기 중 상위 플랜 선택: 즉시 업그레이드
- 활성 주기 중 동일 SKU 선택: 연장
- 활성 주기 중 하위 플랜 선택: 다운그레이드 예약
- 같은 `planType`라도 SKU/카테고리가 다르면 즉시 연장이 아니라 `플랜 전환 예약`으로 해석한다.
- `CANCELED_ACTIVE`의 기본 CTA는 checkout이 아니라 `자동결제 재개`다.
- `PAST_DUE`에서는 일반 checkout/즉시 플랜 변경을 금지한다.
  - 허용 액션 1: 결제수단 갱신 후 기존 구독 복구
  - 허용 액션 2: 자동결제 재시도 중단 후 만료일까지 사용

## Server Guarantees

다음 경로는 이제 UI 뿐 아니라 서버에서도 라이프사이클 규칙을 강제한다.

- 무료 팀은 해지할 수 없음
- 만료된 유료 팀은 결제수단을 변경할 수 없음
- billing key/provider 없는 `CANCELED_ACTIVE` 팀은 자동결제 재개 불가
- `PAST_DUE` 팀은 일반 checkout quote를 만들 수 없음
- `PAST_DUE` 팀은 결제수단 갱신 시 같은 구독을 즉시 복구 결제할 수 있음

## Notes

- `PAST_DUE` 복구 결제는 스케줄러 갱신과 같은 규칙으로 다음 회차 대상 플랜을 계산한다. 따라서 실패 직전 이미 예약된 다운그레이드가 있었다면, 복구 결제도 그 예약 플랜 기준으로 청구된다.
