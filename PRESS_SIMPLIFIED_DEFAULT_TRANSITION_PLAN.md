# brieFFlow Press Simplified Default Transition Plan

작성일: 2026-06-10

## 목표

semantic press URL(`/press/new`, `/press/[id]/edit`, `/press/[id]/final`)을 brieFFlow Press의 기본 simplified 작성 경험으로 전환한다.

기존 화면과 로직은 당장 제거하지 않고 `/legacy/press/new`, `/legacy/press/[id]/edit`, `/legacy/press/[id]/final`에 보존한다. `/press/simplified` 계열은 compatibility redirect로 유지한다.

## 결정 사항

### 팀 선택은 simplified에서 노출하지 않는다

- 유저 피로도와 화면 복잡도를 낮추기 위해 simplified 작성 화면에는 팀 선택 UI를 추가하지 않는다.
- 작성/생성은 현재 세션의 기본 팀 컨텍스트를 기준으로 처리한다.
- 팀 생성, 팀 전환, 팀 초대, 팀 검토 요청 등은 도메인/API 규칙은 유지하되 simplified 기본 흐름에서는 배경화한다.
- legacy `/legacy/press/new`의 팀 선택 UI는 구 화면 보존 차원에서 유지한다.

### 최종 화면에는 공유 기능을 제공한다

- 바이럴/외부 전달을 위해 simplified complete 화면에 기존 `ShareModal`을 재사용한다.
- 공유 링크 생성, 링크 복사, Kakao 공유 동작은 기존 구현을 그대로 따른다.

### 팀 피드백/검토 기능은 제외한다

- `FeedbackPanel`, `FeedbackList`는 simplified complete에 추가하지 않는다.
- 검토/결재 요청 모달은 simplified review에 추가하지 않는다.
- 관련 legacy 화면과 API는 유지한다.

### 원문/편집본 토글은 부담이 낮으면 적용한다

- 최종 문서 확인에서 raw input을 확인할 수 있도록 기존 `ArticleBody`의 편집본/원문 토글을 재사용한다.
- 기본값은 편집본이다.
- raw input이 있을 때만 토글이 보인다.

### 스타일가이드는 작은 writing skill로 다룬다

- 스타일가이드는 강한 도메인 규칙이나 명사 치환 규칙이 아니라, 사용자/팀에 붙는 작은 문체 스킬로 취급한다.
- 프롬프트에 과도한 영향을 주지 않도록 기존 compiler의 문체/문법 중심 제약을 유지한다.
- 스타일가이드 관리 UI는 이번 범위에 넣지 않는다.
- simplified preview에는 스타일가이드가 반영되었다는 작은 신뢰 신호를 추가한다.

## 구현 범위

1. `/press/new`는 simplified 작성 화면을 렌더링한다.
2. `/press/[id]/edit`는 simplified review 화면을 렌더링한다.
3. `/press/[id]/final`은 simplified complete 화면을 렌더링한다.
4. 기존 화면은 `/legacy/press/new`, `/legacy/press/[id]/edit`, `/legacy/press/[id]/final`에 보존한다.
5. `/press/simplified`, `/press/simplified/[id]/review`, `/press/simplified/[id]/complete`는 새 semantic URL로 redirect한다.
6. simplified complete 화면에 `ShareModal`을 추가한다.
7. simplified complete 화면 본문 렌더링을 `ArticleBody` 기반으로 바꿔 편집본/원문 토글을 제공한다.
8. simplified preview 화면에 스타일가이드 적용 안내를 작게 노출한다.
9. 팀 선택, 팀 검토 요청, 최종 피드백 UI는 이번 범위에서 제외한다.

## 추가 보완 범위

1. `/press/new`와 같은 simplified shell을 legacy를 제외한 Press 작업 화면에 적용한다.
2. `/my/dashboard`, `/my/articles`, `/my/articles/pending`, `/articles/[id]`는 같은 header/leftbar 레이아웃을 사용한다.
3. `/press/notices`, `/press/pricing`, `/press/contact`도 기존 공개 탭 대신 같은 header/leftbar 레이아웃을 사용한다.
4. leftbar에는 팀 메뉴를 넣지 않고 작업 메뉴와 공통 서비스 메뉴만 둔다.
5. 데스크톱에서는 공통 서비스 메뉴를 leftbar 하단에 노출한다.
6. 모바일에서는 작업 메뉴는 가로 스크롤하되, `서비스` 버튼은 우측에 항상 보이게 두고 공지사항/요금제/고객지원은 드롭다운으로 제공한다.
7. 데스크톱 leftbar는 접기/펼치기를 지원하며 사용자 설정을 유지한다.

## 검증

```bash
npx eslint components/press/SimplifiedPressFlow.tsx components/press/SimplifiedPressReviewFlow.tsx components/press/SimplifiedPressComplete.tsx components/press/PressSimplifiedWorkspace.tsx components/layout/Header.tsx
npm run build
```

수동 확인:

- `/press/new`
- `/press/[id]/edit`
- `/press/[id]/final`
- `/press/simplified` redirect
- `/press/simplified/[id]/review` redirect
- `/press/simplified/[id]/complete` redirect
- `/legacy/press/new`
- `/legacy/press/[id]/edit`
- `/legacy/press/[id]/final`
- `/press/notices`
- `/press/pricing`
- `/press/contact`

링크 확인:

- dashboard/list/marketing CTA가 기본적으로 `/press/new` 또는 `/press/[id]/edit`를 가리키는지 확인한다.
- legacy 보존 목적의 `/legacy/press/new`, `/legacy/press/[id]/edit`, `/legacy/press/[id]/final` 참조는 제거하지 않는다.
- 모바일 폭에서 `서비스` 버튼이 가로 스크롤 끝으로 밀리지 않고 우측에 유지되는지 확인한다.
