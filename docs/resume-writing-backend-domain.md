# 자기소개서 작성 백엔드 도메인

## 목표

자기소개서 작성 화면을 단순한 AI 글쓰기 도우미처럼 만들 수 있도록, 화면보다
먼저 백엔드의 사용자 행동 단위를 단순화한다.

핵심 루프는 다음과 같다.

1. 지원서 작업대를 연다.
2. 한 문항에서 AI와 대화하며 초안과 수정 방향을 만든다.
3. 사용자가 확인한 변경만 답변에 반영한다.
4. 문항을 완료하면 재사용할 경험 후보를 찾는다.
5. 사용자가 승인한 후보만 새 경험 브릭으로 만들거나 기존 브릭에 보강한다.
6. 다음 지원서에서는 축적된 브릭을 다시 사용한다.

## 현재 구조에서 확인한 문제

- 작성 상태, AI 대화, 완료, 경험 추출 API가 서로 다른 세부 기능으로 노출돼 있다.
- 전체 완료 화면이 문항별 추출과 반영을 브라우저에서 순차 실행한다.
- 추출 후보는 응답에만 존재해 페이지를 벗어나면 승인 대기 상태를 복구하기 어렵다.
- AI 실패가 저장 실패처럼 보이면 사용자는 완성한 답변이 사라졌다고 느끼기 쉽다.
- 장기 생산성 지표인 보유 브릭, 작성 중 추출한 브릭, 실제 재사용 브릭 수를 한 번에
  조회할 계약이 없다.

## 도메인 경계

### WritingWorkspace

기존 `Application`을 작성 작업대 aggregate root로 사용한다. 새 Prisma 모델은 만들지
않는다.

- 회사와 직무
- 전체 문항과 현재 진행 상태
- 첫 미완료 문항
- 완료율
- 승인 대기 경험 후보
- 생산성 지표
- 다음 권장 행동

작업 단계는 서버가 다음 네 값으로 투영한다.

- `COLLECT`: 문항이 없음
- `PLAN`: 문항은 있으나 작성이 시작되지 않음
- `DRAFT`: 하나 이상의 답변이 작성 중이거나 완료됨
- `COMPLETE`: 모든 문항이 완료됐거나 지원서 상태가 완료/제출임

### Question

한 문항은 에디터와 대화의 작업 단위다.

- `not_started`: 답변 없음
- `drafting`: 답변은 있으나 완료 전
- `completed`: 사용자가 완료 확정

### ConversationTurn

자연어 요청을 즉시 실행하지 않고 기존 AI command planner로 실행 계획을 만든다.
사용자 메시지와 계획은 `QuestionAiMessage`에 함께 남긴다. 모든 변경 계획은 기본적으로
확인 후 실행한다.

### ExperienceCapture

완료 답변에서 발견한 경험 후보다. 새 테이블 대신 `QuestionAiMessage`의
`SUGGESTION/APPLY/DISCARD`와 버전이 있는 JSON meta를 사용한다.

- `create`: 새 브릭 생성 후보
- `augment`: 기존 브릭 보강 후보
- `link`: 기존 브릭 재사용 연결

제안 메시지 ID가 `captureId`이며, 적용이나 제외 메시지가 이 ID를 참조한다. 따라서
새 화면을 열어도 승인 대기 후보를 다시 조회할 수 있다.

## UX 불변식

1. 답변 완료 저장은 AI 경험 추출보다 먼저 일어난다.
2. AI, 할당량, 네트워크 오류가 발생해도 완료 답변은 유지된다.
3. 추출 실패는 `deferred`로 반환해 나중에 재시도할 수 있다.
4. AI가 제안한 수정이나 경험 후보는 사용자의 승인 전까지 영구 변경하지 않는다.
5. 경험 후보는 저장된 제안에서 선택하므로 클라이언트가 임의의 브릭 payload를 만들지
   않는다.
6. 동일 capture에 대한 두 번째 apply/dismiss는 `already_resolved`로 처리한다.
7. 권한과 application-question 소속을 확인한 뒤에만 AI 할당량을 사용한다.

## 신규 테스트 API

현재 화면은 이 API를 호출하지 않는다. 새 디자인을 붙이기 전에 독립적으로 시험하기
위한 additive surface다.

### 작업대 열기

`GET /api/resume/writing-workspaces/:applicationId`

반환 내용:

- 단계와 완료율
- 현재 문항과 문항별 상태
- 선택 브릭 수
- 승인 대기 경험 후보
- 전체/AI 추출/재사용 브릭 수
- `add_questions`, `draft_question`, `continue_question`,
  `review_experience_captures`, `review_application` 중 다음 행동

### 대화 턴 계획

`POST /api/resume/writing-workspaces/:applicationId/turns`

```json
{
  "questionId": "question-id",
  "message": "성과 수치가 더 드러나게 고쳐줘"
}
```

기존 command planner의 다중 action 계획을 반환하고 대화 이력을 저장한다. 아직 답변을
직접 바꾸지 않는다.

### 문항 완료와 경험 후보 생성

`POST /api/resume/writing-workspaces/:applicationId/questions/:questionId/complete`

```json
{
  "answer": "최종 답변"
}
```

완료 저장 후 결과의 `capture.kind`는 다음 중 하나다.

- `none`: 새 후보 없음
- `pending_approval`: 저장된 승인 대기 후보와 `captureId` 있음
- `deferred`: 완료는 저장됐지만 추출 또는 후보 저장을 나중에 재시도해야 함

### 경험 후보 승인 또는 제외

`POST /api/resume/writing-workspaces/:applicationId/captures/:captureId`

적용:

```json
{
  "action": "apply",
  "selectedPreviewIds": ["preview-1"]
}
```

제외:

```json
{
  "action": "dismiss"
}
```

## 이번 뼈대의 비범위

- autosave/local draft 동기화 UI
- AI 실행 계획의 범용 서버 실행기

## 완성 답변 추출 복구

문항 완성은 먼저 권위 있는 `Question.answer`를 검증하고 완료 상태로 만든다.
그 뒤 owner, question, answer hash, revision 키로
`CareerFinalAnswerCaptureTask`를 upsert하고 동기 추출을 시도한다. 작업에는 답변
본문을 복사하지 않는다. provider 호출 전 완료된 문항을 다시 읽어 snapshot이
다르면 provider를 호출하지 않고 `SUPERSEDED`로 전환한다.

상태 흐름은 `PENDING -> PROCESSING -> SUCCEEDED`다. 실패한 첫 두 번은 1분,
5분 뒤 `PENDING`으로 돌아가며 세 번째 자동 실패는 `FAILED`가 된다. 2분이
지난 처리 lease는 회수할 수 있고 수동 재시도는 `FAILED`도 다시 claim한다.

성공해도 결과는 검토가 필요한 `CareerCaptureProposal`과
`CareerExperienceCandidate`일 뿐이다. 사용자의 명시적 승인만 신뢰 기억으로
승격한다. `PENDING`/`FAILED` task는 지원서 완료를 막지 않고 `PROCESSING`과
미해결 성공 proposal은 막는다. `DONE` 지원서에서 수동 재시도하려면 명시적으로
다시 열어야 한다.
