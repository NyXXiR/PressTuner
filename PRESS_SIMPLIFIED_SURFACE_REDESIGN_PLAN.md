# Press Simplified Surface Redesign Plan

작성일: 2026-06-10

## 목표

`/press/new`를 기본 작성 경험으로 전환한 뒤 새 shell에 편입된 주변 화면들도 같은 제품 철학으로 정리한다.

핵심 방향은 다음과 같다.

- 유저가 보도자료를 빠르게 작성하고, 최근 작업을 확인하고, 완료된 문서를 다시 여는 흐름에 집중한다.
- 팀 선택, 팀 전환, 팀 검토 요청, 팀 승인 큐는 도메인/API 규칙만 유지하고 기본 화면에서는 노출하지 않는다.
- 기존 URL과 서버 로직은 가능한 한 살려두되, 새 simplified 기본 UI에서는 메뉴와 주요 경로를 줄인다.
- 대시보드/목록/공지/요금제는 `/press/new`와 같은 작고 조용한 header, 얇은 구분선, 명확한 primary action, 낮은 장식 밀도를 따른다.

## 결정 사항

### 검토 대기 메뉴는 제거한다

`검토 대기`는 팀 협업/승인 큐 성격이 강하므로 simplified 기본 leftbar에서 제외한다.

- leftbar workspace 메뉴는 `새 보도자료`, `대시보드`, `보도자료 목록`만 유지한다.
- `/my/articles/pending` 페이지와 `/api/my/articles/pending`는 당장 삭제하지 않는다.
- `/my/articles/pending`는 `/my/articles`로 redirect한다.
- 추후 팀 기능을 다시 전면화할 때 팀 전용 영역이나 legacy 영역에서 검토 큐를 다시 노출할 수 있다.

### 보도자료 목록에서 개인 문서 관리를 통합한다

검토 대기 별도 메뉴 대신 `/my/articles`가 기본 문서 관리 화면이 된다.

- 개인 작성 문서의 상태 확인, 이어쓰기, 완료 문서 열기, 삭제를 목록에서 처리한다.
- 팀 변경 UI는 제거한다.
- 일괄 선택/일괄 삭제는 기본 화면에서 과하므로 1차 간소화 범위에서는 제거한다.
- 상태 필터는 `전체`, `초안`, `작성 중`, `완료` 정도로 제한한다.

### 공지사항과 요금제는 공통 메뉴로 유지하되 작업 화면 톤으로 낮춘다

- 공지사항은 운영 정보 확인용 단순 리스트로 유지한다.
- 요금제는 마케팅 랜딩이 아니라 작업 shell 안의 결제/플랜 확인 화면처럼 정리한다.
- `/pricing`, `/resume/pricing` 등 기존 공개/이력서 영역 요금제 화면에는 영향을 주지 않는다.

## 구현 범위

### 1. Leftbar 메뉴 정리

대상:

- `components/press/PressSimplifiedWorkspace.tsx`

작업:

- `NAV_ITEMS`에서 `검토 대기` 항목 제거.
- `Clock` import 제거.
- 모바일 작업 메뉴에서도 검토 대기 버튼이 나오지 않게 한다.
- `COMMON_NAV_ITEMS`는 `공지사항`, `요금제`, `고객지원` 유지.

검증:

- `/my/dashboard`, `/my/articles`, `/press/new` 데스크톱 leftbar에 검토 대기가 없어야 한다.
- 모바일 nav에도 검토 대기가 없어야 한다.
- `서비스` 버튼과 공통 메뉴 드롭다운은 유지되어야 한다.

### 2. 검토 대기 URL 처리

대상:

- `app/(dashboard)/my/articles/pending/page.tsx`

작업:

- 페이지 UI를 제거하고 Next `redirect("/my/articles")` 처리로 바꾼다.
- API `app/api/my/articles/pending/route.ts`는 유지한다.
- 검토 요청 도메인/API는 삭제하지 않는다.

주의:

- 과거 링크나 북마크가 404가 되면 안 된다.
- 팀 기능을 나중에 복구할 수 있도록 API와 서비스는 건드리지 않는다.

검증:

- `/my/articles/pending` 요청 시 `/my/articles`로 redirect.

### 3. 대시보드 간소화

대상:

- `app/(dashboard)/my/dashboard/page.tsx`
- 필요 시 `lib/services/myDashboardService.ts`
- 필요 시 `stores/myDashboardStore.tsx`

현재 문제:

- `검토 대기 중` KPI가 팀 검토 기능을 전면에 노출한다.
- 안내 포스터, 하단 로고, `MarketingFooter`가 작업 화면 안에서 마케팅 페이지처럼 보인다.
- `팀 스타일 가이드 반영`, `누적 데이터 기반 학습` 문구가 지금의 단순 작성 흐름보다 팀/학습 기능을 강하게 암시한다.

작업:

- `검토 대기 중` KPI 카드 제거.
- 대시보드 헤더를 `/press/new`와 같은 밀도로 축소한다.
  - 예: eyebrow `brieFFlow Press`
  - title `보도자료 작업 현황`
  - description `최근 작업과 이번 달 작성 현황만 빠르게 확인합니다.`
- primary CTA `새 보도자료 작성` 유지.
- secondary CTA는 필요하면 `보도자료 목록` 하나만 유지.
- KPI는 `이달 생성`, `이달 완료` 중심으로 유지.
- 가능하면 `작성 중` count를 추가하되, 서비스 레이어 변경이 부담되면 1차 범위에서는 생략한다.
- 최근 작업 리스트는 5건 유지.
- 안내 포스터, 로고 영역, `MarketingFooter` 제거.
- 빈 상태는 `아직 작업한 보도자료가 없습니다`와 `/press/new` CTA로 단순화.

검증:

- 팀/검토/승인 큐 문구가 기본 대시보드에 보이지 않아야 한다.
- 화면 첫 viewport에서 작성 CTA와 최근 작업이 바로 보여야 한다.
- 모바일에서 카드가 과도하게 길어지지 않아야 한다.

### 4. 보도자료 목록 간소화

대상:

- `app/(dashboard)/my/articles/page.tsx`
- 필요 시 `stores/myArticlesStore.tsx`

현재 문제:

- 팀 변경 select가 개인 작업 화면에 노출된다.
- 다중 선택/일괄 삭제가 화면 복잡도를 높인다.
- 유형 필터가 Press 기본 화면에서는 우선순위가 낮다.
- table 중심이라 모바일에서 읽기 어렵고 작업 화면보다 관리 콘솔처럼 보인다.

작업:

- `InlineTeamSelect` 컴포넌트와 `Users` import 제거.
- `updateTeam` 사용 제거.
- 테이블의 `소속 팀 변경` 컬럼 제거.
- 다중 선택 checkbox, 선택 상태 bar, `bulkDeleteSelected`, `setAllOnPage`, `toggleOne`, `clearSelection`, `selectedIds` 사용 제거.
- 상태 탭은 다음만 유지한다.
  - `전체`
  - `초안`
  - `작성 중`
  - `완료`
- 검색은 유지하되 placeholder를 단순화한다.
  - 예: `보도자료 제목 검색`
- `유형 필터`는 제거하거나, 기존 API 제약 때문에 유지해야 하면 접힌 보조 옵션으로 낮춘다.
- 목록 row는 가능하면 table에서 row/card hybrid로 변경한다.
  - 제목
  - 상태 badge
  - 최종 업데이트
  - primary action: `이어쓰기` 또는 `열기`
  - secondary icon action: 삭제
- `/press/${id}/edit` 링크는 유지한다.
- `/articles/${id}` 상세 링크가 필요한 곳은 유지하되, 기본 작업 action은 simplified review/edit로 보낸다.

권장 구현 순서:

1. 팀 변경과 일괄 선택 UI 제거.
2. 테이블 컬럼을 줄여 간단한 리스트로 정리.
3. 모바일에서 각 row가 카드처럼 쌓이도록 responsive class 조정.

검증:

- 팀 관련 UI가 `/my/articles`에 보이지 않아야 한다.
- 문서 삭제는 단건만 가능해야 한다.
- URL 필터 `?status=FINAL&period=current_month`는 기존 대시보드 링크 호환을 위해 계속 동작해야 한다.

### 5. 공지사항 화면 간소화

대상:

- `app/(dashboard)/press/(public)/notices/page.tsx`
- `app/(dashboard)/(public)/notices/NoticesListClient.tsx`
- 필요 시 `app/(dashboard)/press/(public)/notices/[id]/page.tsx`

현재 상태:

- 구조는 단순하지만 카드 radius와 action button이 다른 simplified 화면보다 조금 튄다.
- `보기 ->` 버튼이 모든 row 우측에 있어 행 전체 클릭과 중복된다.

작업:

- header를 `/press/new`와 같은 작은 헤더 패턴으로 맞춘다.
- 리스트 컨테이너는 `rounded-lg border border-border bg-card shadow-sm` 정도로 낮춘다.
- 각 공지는 단순 row로 표현한다.
  - 제목
  - preview
  - 날짜
  - 알림 badge는 유지 가능하되 작게 표시
- row 전체를 링크로 유지하고 우측 `보기 ->` 버튼은 제거한다.
- empty state는 아이콘/이모지 과시를 줄이고 새로고침 버튼만 작게 둔다.

주의:

- `NoticesListClient`는 `/notices`, `/resume/notices`, `/press/notices`에서 공유될 수 있다.
- Press 전용 톤만 적용해야 한다면 `variant="compact"` 같은 prop을 추가한다.
- 공유 컴포넌트를 전역 변경할 경우 resume/public 공지 화면까지 영향이 가므로 반드시 확인한다.

검증:

- `/press/notices`가 simplified shell 안에서 과도한 카드 UI 없이 보인다.
- `/notices`, `/resume/notices` 영향 여부를 확인한다.

### 6. 요금제 화면 간소화

대상:

- `app/(dashboard)/press/(public)/pricing/page.tsx`
- `app/(dashboard)/(public)/pricing/PricingPlansClient.tsx`
- 권장 신규 파일: `components/press/PressPricingPlansClient.tsx` 또는 `app/(dashboard)/press/(public)/pricing/PressPricingPlansClient.tsx`

현재 문제:

- `/press/pricing`이 마케팅 랜딩처럼 보인다.
- `기업 홍보`, `취업 / 이직`, `올인원` 탭은 Press 작업 shell에서 불필요하다.
- 카드 shadow, rounded-3xl, 큰 히어로, 긴 FAQ가 `/press/new`의 조용한 작업 화면과 맞지 않는다.

권장 작업:

- Press 전용 pricing client를 새로 만든다.
- 기존 `PricingPlansClient`는 `/pricing`, `/resume/pricing` 호환을 위해 건드리는 범위를 최소화한다.
- `/press/pricing`에서는 Press category 플랜과 Free만 표시한다.
- 탭 제거.
- 히어로 축소.
  - eyebrow `Billing`
  - title `요금제`
  - description `보도자료 작성량에 맞는 플랜을 선택합니다.`
- 플랜 카드는 `rounded-lg border bg-card` 정도로 낮춘다.
- 각 카드 정보는 다음으로 제한한다.
  - 플랜명
  - 가격
  - 월 보도자료 quota
  - 기사당 브리프/문장 다듬기 quota
  - CTA
- 쿠폰 적용 영역은 유지하되 하단의 작은 section으로 낮춘다.
- FAQ는 2~3개만 유지하거나 접힌 보조 section으로 둔다.

주의:

- 결제 링크 `/billing/checkout?plan=...`는 유지한다.
- 로그인 필요 flow는 유지한다.
- coupon redeem 권한 처리도 유지한다.

검증:

- `/press/pricing`에 career/resume 탭이 보이지 않아야 한다.
- `/pricing`, `/resume/pricing` 기존 탭 화면은 유지되어야 한다.

## 비범위

이번 작업에서 하지 않는다.

- 팀 생성/전환/초대 UI 복구
- 팀 검토 요청 UI 신규 설계
- 팀 스타일가이드 관리 화면 변경
- `/api/my/articles/pending`, `/api/reviews/*` 삭제
- `/team/*` 화면 변경
- `/pricing`, `/resume/pricing`의 마케팅용 pricing 화면 개편

## 예상 파일 변경 목록

- `components/press/PressSimplifiedWorkspace.tsx`
- `app/(dashboard)/my/articles/pending/page.tsx`
- `app/(dashboard)/my/dashboard/page.tsx`
- `app/(dashboard)/my/articles/page.tsx`
- `app/(dashboard)/press/(public)/notices/page.tsx`
- `app/(dashboard)/(public)/notices/NoticesListClient.tsx`
- `app/(dashboard)/press/(public)/pricing/page.tsx`
- 신규 Press pricing client 파일
- 필요 시 `stores/myArticlesStore.tsx`
- 필요 시 `stores/myDashboardStore.tsx`
- 필요 시 `lib/services/myDashboardService.ts`

## 구현 순서

1. Leftbar에서 `검토 대기` 제거.
2. `/my/articles/pending` redirect 처리.
3. 대시보드 간소화.
4. 보도자료 목록에서 팀 변경/일괄 선택 제거.
5. 공지사항 리스트 톤 정리.
6. Press 전용 요금제 화면 정리.
7. 모바일/데스크톱 검증.

## 검증 명령

```bash
npx eslint components/press/PressSimplifiedWorkspace.tsx \
  'app/(dashboard)/my/dashboard/page.tsx' \
  'app/(dashboard)/my/articles/page.tsx' \
  'app/(dashboard)/my/articles/pending/page.tsx' \
  'app/(dashboard)/press/(public)/notices/page.tsx' \
  'app/(dashboard)/press/(public)/pricing/page.tsx'

npm run build
```

## 수동 확인 경로

- `/press/new`
- `/my/dashboard`
- `/my/articles`
- `/my/articles?status=FINAL&period=current_month`
- `/my/articles/pending`
- `/press/notices`
- `/press/notices/[id]`
- `/press/pricing`
- `/pricing`
- `/resume/pricing`

## 완료 기준

- simplified leftbar에 `검토 대기`가 없다.
- `/my/articles/pending`는 `/my/articles`로 redirect된다.
- `/my/dashboard`에서 팀/검토 큐 중심 KPI와 마케팅성 하단 영역이 사라진다.
- `/my/articles`에서 팀 변경, 다중 선택, 일괄 삭제가 사라진다.
- `/press/notices`는 단순 공지 리스트로 보인다.
- `/press/pricing`은 Press 플랜만 보여주며 `/pricing`, `/resume/pricing`은 기존 동작을 유지한다.
- 375px 모바일 폭에서 nav, 검색, 리스트, CTA가 가로 overflow 없이 표시된다.
