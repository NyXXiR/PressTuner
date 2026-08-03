# brieFFlow Simplified Navigation Follow-up Plan

작성일: 2026-06-09

## 배경

brieFFlow Press의 simplified MVP 플로우는 기존 화면을 건드리지 않고 `/press/simplified` 계열 라우트로 분리되어 있다.

현재 핵심 작성 흐름은 다음과 같다.

```text
메모 입력 -> 정리 내용 확인 -> 초안 생성 -> 첨삭 또는 바로 완료 -> 최종 문서
```

최근 작업으로 simplified 전용 작업공간 레이아웃이 추가되었다.

- `components/press/PressSimplifiedWorkspace.tsx`
- `components/press/SimplifiedPressFlow.tsx`
- `components/press/SimplifiedPressReviewFlow.tsx`
- `components/press/SimplifiedPressComplete.tsx`

현재 `PressSimplifiedWorkspace`는 다음을 담당한다.

- simple `Header` 렌더링
- desktop 좌측 workspace nav
- mobile 가로 workspace nav
- 본문 영역 정렬
- 하단 fixed action bar 정렬용 `PressSimplifiedBottomBar`

현재 workspace nav 항목은 아래 3개다.

- 새 보도자료: `/press/simplified`
- 대시보드: `/my/dashboard`
- 보도자료 목록: `/my/articles`

## 방향

네비게이션 역할을 명확히 분리한다.

### 좌측 Workspace Nav

보도자료 작업 공간 내부의 생산 흐름만 둔다.

- 새 보도자료
- 대시보드
- 보도자료 목록

팀 관리, 스타일 가이드, 멤버 관리 등 팀 단위 기능은 당장 노출하지 않는다. 팀 도메인은 유지하되 simplified 화면에서는 배경화한다.

### Header / Profile Menu

공지사항, pricing, 고객지원 같은 공통 화면은 좌측 nav가 아니라 헤더 또는 프로필 메뉴 쪽에 둔다.

추천 배치:

- 알림: 기존 헤더 알림 아이콘 유지
- 공지사항: 프로필 팝업에 `공지사항` 링크 추가
- 요금제: 프로필 팝업에 `요금제` 링크 추가
- 고객지원: 프로필 팝업에 `고객지원` 링크 추가
- 마이페이지: 기존 프로필 팝업 유지
- 결제/구독 관리: 필요하면 프로필 팝업에 `구독 관리`로 추가

주의:

- 헤더 우측에 텍스트 버튼을 계속 늘리지 않는다.
- pricing은 한도 근접/도달 배너에서도 노출될 수 있으므로 중복 노출이 과하지 않게 한다.
- 좌측 nav는 "작업을 어디서 시작/관리하나"에만 답하게 한다.

## 다음 구현 범위

이번 후속 작업은 아래 두 가지까지만 한다.

1. 공통 화면 링크를 simple header의 프로필 메뉴에 추가
2. 좌측 workspace nav를 접고 펼칠 수 있는 토글 추가

## 구현 상세

### 1. Header 프로필 메뉴 공통 링크 추가

대상 파일:

- `components/layout/Header.tsx`

현재 `Header`는 `variant="simple"`을 지원한다.

simple variant에서 프로필 팝업 안에 아래 링크를 추가한다.

권장 링크:

```text
공지사항 -> /press/notices
요금제 -> /press/pricing
고객지원 -> /press/contact
```

선택 링크:

```text
구독 관리 -> /my/billing
```

구현 기준:

- `variant === "simple"`일 때만 press simplified용 공통 링크를 추가한다.
- 기존 default header의 메뉴 구조는 최대한 건드리지 않는다.
- 기존 `마이페이지`, `로그아웃`, `관리자 페이지` 동작은 유지한다.
- 링크는 프로필 팝업 안에서 `마이페이지` 아래, PRESS/CAREER 전환 링크 위쪽이나 아래쪽에 배치한다.
- 아이콘은 `lucide-react`를 사용한다. 예: `Megaphone`, `CreditCard`, `HelpCircle`.

### 2. 좌측 Workspace Nav 접기/펼치기

대상 파일:

- `components/press/PressSimplifiedWorkspace.tsx`

요구사항:

- desktop 좌측 nav만 접고 펼칠 수 있게 한다.
- mobile 가로 nav에는 collapse 토글을 적용하지 않는다.
- 접힌 상태에서는 아이콘만 보인다.
- 펼친 상태에서는 현재처럼 라벨까지 보인다.
- 하단 action bar도 nav 폭 변화에 맞춰 정렬되어야 한다.

권장 방식:

- `PressSimplifiedWorkspace` 내부에서 `collapsed` state를 둔다.
- `localStorage`에 상태를 저장한다.
- key 예시: `press-simplified-nav-collapsed-v1`
- collapse 상태는 `PressSimplifiedWorkspace`와 `PressSimplifiedBottomBar`가 같이 알아야 한다.

현재 구조상 `PressSimplifiedBottomBar`는 별도 컴포넌트로 호출되고 있으므로 선택지는 두 가지다.

#### 선택 A: CSS custom property 사용 권장

`document.documentElement` 또는 wrapper에 CSS variable을 둔다.

예:

```tsx
const navWidthClass = collapsed ? "w-16" : "w-52";
```

다만 bottom bar는 별도 컴포넌트라 state 공유가 필요하다. 이 경우 작은 Zustand store를 추가하거나, `PressSimplifiedWorkspace`를 page 전체 provider로 키우는 방식이 필요하다.

#### 선택 B: 작은 Zustand store 추가 권장

새 파일:

- `stores/usePressSimplifiedLayoutStore.ts`

예상 state:

```ts
type Store = {
  navCollapsed: boolean;
  hydrated: boolean;
  hydrate: () => void;
  toggleNavCollapsed: () => void;
};
```

장점:

- `PressSimplifiedWorkspace`와 `PressSimplifiedBottomBar`에서 같은 collapse 상태를 읽을 수 있다.
- 현재 구조를 크게 바꾸지 않아도 된다.

구현 기준:

- collapsed false 기본값
- hydrate 전에는 expanded로 렌더링해도 무방
- 토글 버튼은 desktop nav 상단 `Workspace` 라벨 오른쪽에 둔다.
- 접힌 상태 버튼 tooltip/title 제공
- 접힌 상태 nav item도 `title` 제공

권장 폭:

```text
expanded: w-52
collapsed: w-16
```

접힌 상태 nav item:

- `justify-center`
- 라벨 숨김
- `Workspace` 텍스트 숨김 또는 짧은 아이콘/토글만 표시

하단 action bar:

- expanded일 때 좌측 spacer `w-52`
- collapsed일 때 좌측 spacer `w-16`
- mobile에서는 spacer 숨김 유지

## UX 기준

- 좌측 nav는 기능 목록이 아니라 작업공간 방향키처럼 보여야 한다.
- 접기 토글은 사용자가 화면 폭을 확보하고 싶을 때 쓰는 보조 기능이다.
- 현재 작성/첨삭 액션보다 시각적으로 강하면 안 된다.
- 공지사항/pricing은 작업 흐름의 1차 nav가 아니므로 좌측 nav에 넣지 않는다.
- simple header는 복잡해지면 안 되므로 공통 링크는 프로필 팝업 내부에 둔다.

## 검증 방법

수정 후 아래를 확인한다.

```bash
npx eslint components/layout/Header.tsx components/press/PressSimplifiedWorkspace.tsx components/press/SimplifiedPressFlow.tsx components/press/SimplifiedPressReviewFlow.tsx components/press/SimplifiedPressComplete.tsx
npm run build
```

Playwright 또는 브라우저 수동 확인:

- `/press/simplified`
- `/press/simplified/[id]/review`
- `/press/simplified/[id]/complete`

확인 항목:

- desktop에서 좌측 nav가 보인다.
- collapse 토글로 `w-52 <-> w-16` 전환된다.
- 접힌 상태에서 아이콘만 보이고 hover/title로 의미를 알 수 있다.
- 본문 시작 x 좌표와 하단 action bar 시작 x 좌표가 일치한다.
- mobile에서 좌측 nav는 숨고 가로 nav만 보인다.
- 프로필 팝업에 공지사항/요금제/고객지원 링크가 보인다.
- 기존 알림, 다크모드, 프로필, 로그아웃 동작이 깨지지 않는다.

## 현재 주의사항

- dev 서버가 변경된 컴포넌트를 바로 반영하지 않는 경우가 있었다. 실제 화면이 소스와 다르게 보이면 `localhost:3003`의 Next dev 프로세스를 재시작하고 다시 확인한다.
- 기존 dirty 파일이 있을 수 있다. unrelated 변경은 되돌리지 않는다.
- `AGENTS.md`, `AI_IMPROVEMENT_DIRECTION.md` 등 기존 사용자/이전 작업 파일은 건드리지 않는다.
