# 평가 시스템 커밋 전 정리

기준: 2026-10-13 KST. 대상: PressTuner, 마지막 커밋 `33f2307` 이후 누적 변경. 이 문서는 구현과 로컬 증거를 정리한 인수인계이며 운영 출시 승인이 아니다.

## 전달할 결과

PressTuner 편집기에서 공식 Ragas/DeepEval과 업무별 G-Eval을 실행하고 결과를 보존한다. 일반 작성자는 **원고 확인 → 수정안 요청 → 바뀐 부분 반영/유지/나중에 → 저장**으로 진행한다. 평가기 연구는 고정 데이터셋 → 사람 검토 → 보정·독립 감사 → 개선 비교 → 회귀 판정으로 이어진다.

현재 말할 수 있는 성과는 구현 연결, 오류·오래된 결과 처리, 로컬 실행 재현이다. 현재 Judge의 정확도, 통계적 개선 효과, 실제 사용자 노력 감소는 아직 입증하지 않았다.

## 변경 범위

| 묶음 | 주요 경로 | 내용 |
|---|---|---|
| 평가 방법과 실행 | `domain/press-workflow/evaluation/`, `lib/services/press-workflow/evaluation/`, `scripts/press-workflow/{ragas,deepeval}/` | 공식 SDK bridge, 고정 설정·rubric, 평가기 identity, 실패 분류, 보정·비교·회귀 계약 |
| 저장과 API | `prisma/schema.prisma`, `app/api/articles/[id]/quality-evaluation/`, `app/api/press/quality-studies/` | 기사 평가 이력, 팀 연구 aggregate, source split 보존, 권한·멱등성·revision·실행 복구 |
| 작성자와 연구 UI | `components/press/`, `stores/usePressEditStore.ts` | 단일 확인 행동, 변경 구간별 실제 저장, 저장 실패·늦은 응답 보호, 선택 검토·블라인드 A/B·관리 보고 |
| 로컬 실행·CI | `scripts/press-workflow/`, `.github/workflows/press-quality.yml`, `package.json`, `next.config.ts`, `tsconfig.json`, `.gitignore` | 격리 데모, 무료 계약/브라우저/SDK 검사, 명시적 유료 회귀 job, Python 실행 소스 tracing |
| 설명과 증거 | `docs/ai/press-workflow/`, `evals/press-workflow/{evidence,regression}/` | 선택 이유·대안·실측 한계, 합성 원문 기반 측정 기록, 기존 사람 확인 결함의 회귀 조건 |
| 기존 공유 어댑터 | `lib/services/press/adapters/pressProcessPrismaAdapter.ts` | 기존 잠금 트랜잭션의 제한 시간을 30초로 조정한 앞선 실행 검증 수정 |

전체 누적 변경에는 DB/API 변경이 포함된다. “백엔드 유지”는 마지막 UI 어댑터 작업의 경계다. 결제 정책·FINAL 판정 권한은 평가 점수나 UI 선택으로 대체하지 않는다.

## 유지할 도메인 경계

1. 사실 근거는 서버의 채택된 활성 fact다. 검색 후보와 문체 예시는 사실 정답이 아니다.
2. 평가 결과는 정확한 원고·출처·평가기 버전에 붙는다. 오래된 결과, 실패, 기준 없음은 통과가 아니다. 점수는 0~1이며 threshold 통과도 정확성 보증이 아니다.
3. 일반 편집의 반영은 실제 원고 저장, 연구 PRODUCT 선택은 수정 의견, A/B는 선호다. 이들을 사람 정답으로 자동 승격하지 않는다.
4. Judge 검증의 기준 라벨에는 독립성·노출·원문 그룹·partition 조건이 있다. 불일치·불확실·부족한 분모는 보류한다.
5. 개선 채택은 독립 비교와 회귀 조건을 요구한다. HOLD/UNKNOWN을 성공으로 바꾸지 않으며 후보 선택만으로 운영 설정이 바뀌지 않는다.
6. 원고 저장·수정 반영과 FINAL은 다르다. 기존 authoritative verification의 최신 PASS/WARN 조건을 유지한다.

세부 계약: [도메인 규칙](../../domain-rules.md), [연구 백엔드](QUALITY_STUDY_BACKEND.md), [제품 UI](QUALITY_STUDY_UI.md).

## 검증 상태

이번 갈무리에서 다시 확인한 결과:

- Node 테스트 명령 10종: **96/96 통과**, 실패·건너뜀 0. 격리 브라우저 시나리오 3개 포함. 정확한 명령은 [무료 검사](EVALUATION_SYSTEM_RUNBOOK.md#준비와-무료-검사)에 있다.
- 분리된 SDK 환경: Ragas 2개 + DeepEval 6개, **8/8 통과**. 전체 104개는 구현/SDK 계약 검사이며 평가 정확도 표본 수가 아니다.
- `typecheck:press-workflow`, `typecheck:press-standard` 통과. `npm run lint` 오류 0·기존 경고 76개. `git diff --check` 통과.
- CI YAML 파싱과 npm script 연결, 수정 문서 5개의 상대 링크, 보존 evidence JSON 구문 확인. CI에 연구 UI·연구 브라우저·편집 UI 검사와 `stores/usePressEditStore.ts` 변경 트리거를 추가했다.
- 커밋 후보 111개 파일의 경로와 충돌 표식을 점검했다. 환경 파일·빌드/스크린샷 산출물이 없고, 알려진 키/credential URL 형식의 정적 검색에서 노출 후보가 없었다. 이 검색은 포괄적인 보안 감사가 아니다.
- 불필요한 `.next/standard-build` TypeScript include만 제거하고 데모 서버용 include는 유지했다. 런타임 코드는 바꾸지 않았으며 빌드는 재실행하지 않았다. 직전 빌드 결과는 아래와 같다.

모델 호출, 실사용자 판정, DB 쓰기, 운영 배포는 실행하지 않았다. 전체 출력과 커밋 후보/메시지는 로컬 `C:/Users/ccmedia/artifacts/projects/2026-10-13-evaluation-precommit/`에 보존했다.

기존 2026-10-13 편집 UX 검증:

- 편집 UI 8개, 연구 UI 8개, 연구 domain/service 14개, 연구 브라우저 1개: 총 31개 통과. 격리 브라우저 시나리오 2개 포함.
- 전용 TypeScript 통과, 전체 lint 오류 0·기존 경고 76개.
- `npm run build`는 실행 중인 개발 서버의 Prisma DLL 잠금으로 prebuild 실패. 기존 생성 client와 같은 환경 파일을 이용한 직접 Next production build는 152페이지 생성, 종료 0. 두 결과를 구분한다.
- 실제 테스트 DB 편집기에서 저장된 원고·평가 조회와 배치를 확인했다. 최신 UI의 저장·실패·되돌리기는 합성 HTTP 브라우저 검사로 확인했다.
- 이전 DB/API·실제 SDK 실행 결과는 [결과 이력](EVALUATION_SYSTEM_RESULTS.md), 재현은 [실행 안내](EVALUATION_SYSTEM_RUNBOOK.md)를 따른다.

## 커밋과 배포의 경계

- 이번 변경은 하나의 평가·연구·편집 기능 단위로 묶는다. package scripts, 새 파일, API, schema, CI를 빠뜨린 채 일부만 커밋하지 않는다. Git index는 아직 비어 있고 커밋·푸시는 하지 않았다.
- `.env*`, Python venv/cache, `.next/`, `.agent-work/`, 로컬 `runs/`, 브라우저 산출물은 제외한다. `evidence/`의 검토된 합성 원문 기반 실행 기록과 `regression/`은 포함한다.
- 일반/운영 DB에는 추가 모델 3개(`ArticleQualityEvaluation`, `PressQualityStudy`, `PressQualitySourceAssignment`)를 아직 적용하지 않았다. 저장소의 기존 `db push` 배포 관례에 따라 **대상 DB를 확인한 별도 배포 단계**에서 반영한다. 새 migration 이력은 만들지 않았다.
- Scheduler의 작업 트리 schema는 본체와 byte 단위로 일치한다. Scheduler에는 기존 schema 변경 외에 billing catalog와 knowledge worker 변경도 있으므로 별도 저장소의 커밋 범위를 검토해야 한다. 이번 갈무리에서 그 파일들을 수정하거나 함께 커밋하지 않았다. 앞선 schema 동기화/생성 검증과 운영 반영은 별개다.
- 배포 서버는 Node runtime, 분리된 Python 환경 두 개와 lock 의존성, 실행 파일·환경 설정, 긴 평가 요청을 감당할 실행 시간이 필요하다. Next tracing만으로 Python 환경이 설치되지 않는다.
- 평가 사용량/과금 정책, 다중 인스턴스 실행 한도와 운영 실행 방식도 정해야 한다. 일반 원고 수정은 기존 첨삭·재작성 쿼터를 재사용한다.
- 원격 GitHub Actions 실행과 운영 배포는 미확인이다. PR/push 검사는 무료이며 유료 모델 회귀는 수동 옵션으로만 실행한다.
- 일반 `npm run build`의 정상 종료는 개발 서버를 종료할 수 있는 시점에 다시 확인해야 한다. 지금 사용 중인 데모 서버는 유지했다.

## 다음 작업 순서

| 우선순위 | 남은 일 | 완료 조건 |
|---|---|---|
| 1 — 편집 지속성 | 일반 수정 후보와 유지/보류/되돌리기 상태의 새로고침 복구 | 동일 원고 버전에서 복구하고, 바뀐 원고에는 오래된 후보 적용 차단 |
| 2 — 저장 충돌 | 서버의 원고 버전 기반 저장 조건(CAS) | 두 탭/기기의 늦은 저장이 새 원고를 덮지 않고 충돌 안내. 현재 보호는 로컬 snapshot/직렬화 범위 |
| 3 — 평가 입력 | 필수 사실·요청 문체·문체 예시 기록 연결 | 입력이 있는 기준만 실행하고 identity·freshness에 반영. 현재 G-Eval 해당 3기준은 NOT_APPLICABLE |
| 4 — 실제 증거 | 대표 원문, 독립 사람 판정·두 평가자, 보정/감사·holdout, 실제 수정 품질·선택 시간 측정 | 현재 Judge의 오탐/미탐·일치도·coverage·구간과 개선 전후 결과를 분리 보고. 증거 부족 시 보류 |
| 운영 준비 | DB·Python runtime·사용량 정책·원격 CI·배포 검증 | 위 배포 조건을 실제 대상에서 확인하고 기록 |

연구용 데이터 구성·보정 정책·회귀 명세 관리 일부는 CLI/API 중심이다. Agent 도구 정확성과 검색 precision/recall은 실제 trace/기준 자료가 필요한 별도 확장으로 남는다. 사용자에게 추가 자유 서술이나 JSON 제출을 요구하는 방식으로 빈 부분을 메우지 않는다.

## 제안 커밋 메시지

```text
feat(press): connect quality evaluation, studies and guided editing

- persist Ragas, DeepEval and G-Eval runs with versioned snapshots
- connect human review, calibration, experiments and regression gates
- guide authors through focused revisions with guarded draft saving
- add offline SDK/UI checks, runtime tracing and evaluation handoff docs

Independent judge reliability and user-effort improvements remain unmeasured.
Production DB rollout and remote CI validation are separate follow-ups.
```
