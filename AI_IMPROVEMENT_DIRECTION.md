# brieFFlow / PressTuner AI Improvement Direction

작성 기준: 2026-06-04 (KST)

이 문서는 `PressTuner` 작업에서 brieFFlow의 제품 방향과 Meerkat Studio의 공통 철학을 유지하기 위한 AI 작업 지침이다. 코드/결제/도메인 규칙은 `AGENTS.md`와 `docs/domain-rules.md`를 우선한다. 브랜드 공통 기준은 `/mnt/d/workspace/meerkat-studio/AI_BRAND_CONTEXT.md`를 읽는다.

## 제품 역할

이 저장소는 brieFFlow / PressTuner의 메인 애플리케이션이다. 공개 제품 관점에서는 brieFFlow가 보도자료와 커리어 문서를 빠르게 시작하고 다듬는 AI 문서 작성 워크스페이스 역할을 한다.

PressTuner라는 저장소명에 끌려 제품을 보도자료 한정 도구로만 좁히지 말고, 현재 서비스가 가진 press track과 resume/career track의 공통 문제를 함께 본다.

## 문제 정의

사용자는 쓸 재료가 있어도 문서의 첫 구조를 잡는 데 시간을 잃는다.

- 보도자료: 출시, 제휴, 행사 소식을 기사형 구조와 팀 톤으로 정리해야 한다.
- 자기소개서/커리어 문서: 경험과 문항을 연결해 설득력 있는 답변 구조로 만들어야 한다.

brieFFlow의 개선 방향은 "AI가 대신 써준다"가 아니라 "빈 화면에서 구조 있는 초안과 검토 흐름으로 빠르게 이동한다"이다.

## 핵심 흐름

```text
러프한 메모/경험 입력 -> 브리프/전략화 -> 초안 생성 -> 다듬기/검토 -> 공유 또는 결제/쿼터 관리
```

AI가 press 또는 resume 화면을 고칠 때는 이 흐름 중 어느 마찰을 줄이는지 먼저 확인한다.

## 우선 개선 방향

- press와 resume이 서로 다른 제품처럼 흩어지지 않도록 "러프 입력 -> 구조화 -> 초안 -> 다듬기"라는 공통 구조를 유지한다.
- 첫 화면과 데모는 사용자가 부담 없이 작은 입력을 해볼 수 있어야 한다.
- 보도자료는 팀 톤, fact/lead, 공유/최종화 흐름을 선명하게 만든다.
- resume은 경험 brick, 문항, 전략, 답변 생성의 관계를 선명하게 만든다.
- 결제/구독/쿼터 UI는 실제 plan catalog와 Team billing snapshot의 의미를 벗어나지 않는다.
- PostHog 지표는 `page_viewed -> demo_brief_started -> demo_brief_generated -> cta_login_from_demo`, `login_completed -> press_new_opened -> draft_generate_clicked -> draft_generated`, 결제 funnel을 중심으로 본다.
- 포트폴리오 관점에서는 AI writing orchestration, billing/quota, team workspace, scheduler-backed operations를 사례로 남긴다.

## 피해야 할 방향

- brieFFlow를 "무엇이든 써주는 AI"처럼 넓게 만드는 카피.
- press와 resume의 공통 구조 없이 기능 탭만 늘리는 작업.
- 결제 의미를 UI에서 임의 재계산하거나 plan catalog와 다르게 설명하는 작업.
- scheduler 영향 없이 billing/schema를 바꾸는 작업.
- 데모/랜딩만 바꾸고 실제 초안 생성/검토 흐름을 개선하지 않는 작업.

## AI 작업 전 체크

1. `AGENTS.md`와 `docs/domain-rules.md`를 읽었는가?
2. billing, plan, quota 변경이면 `config/billing/plans.ts`와 scheduler 영향까지 확인했는가?
3. press 또는 resume 중 어떤 트랙의 어떤 마찰을 줄이는가?
4. 사용자가 작은 입력으로 가치를 확인할 수 있는가?
5. 이벤트/퍼널 또는 수동 시나리오로 개선 효과를 확인할 수 있는가?

## 완료 기준

- 사용자가 빈 화면에서 구조 있는 초안으로 더 빠르게 이동한다.
- press와 resume의 각 맥락은 유지하되 brieFFlow의 공통 제품 정체성이 흐려지지 않는다.
- 결제/쿼터/스케줄러 규칙이 안전하게 유지된다.
- 개선 내용이 "AI 문서 작성 제품을 운영하며 무엇을 배웠는가"라는 회고로 남을 수 있다.

