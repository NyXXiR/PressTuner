# PressTuner 워크플로우 개발 및 AI 인수인계

작성: 2026-09-23. 작업 저장소: `D:\workspace\PressTuner`.

## 목표

사용자가 팀 기본값을 이번 요청에 맞게 바꿨을 때, 그 의도가 초안에 반영되고 제공한 사실이 유지되는 보도자료 작성 흐름을 만든다. 화면을 붙이기 전에 실제 생성 코어를 웹 서버 없이 실행하면서 프롬프트, 요구사항, 평가 기준을 다듬는다.

장기 목표는 실제 도입 가능한 도메인이다. 이번에 완료할 범위는 **초안 생성 한 단계의 실행·비교 기반**이다. 전체 보도자료 생성/검증/최종화 프로세스를 구현했다는 의미가 아니다. 기술적 깊이는 설정의 우선순위, 실행 증거의 보존, 평가의 한계, 이후 필요한 저장·동시성 문제에서 쌓는다.

첫 사용자 사례: “팀 기본 문체는 공식적이지만 이번에는 친근하게 써 줘. 출시일은 바꾸지 말고, 근거 없는 ‘업계 최고’ 표현은 쓰지 마.”

## 다른 AI의 시작 순서

1. 저장소 루트 `AGENTS.md`, 이 문서, `docs/domain-rules.md`의 Grounded press releases를 읽는다.
2. `git status --short`와 현재 diff를 확인한다. 초기 구현은 커밋되지 않은 변경으로 남을 수 있으므로 덮어쓰지 않는다.
3. `npm run test:press-workflow`와 `npm run typecheck:press-workflow`로 현재 경계를 확인한다. 이 명령에는 DB, API 키, Next.js가 필요 없다. 일반 `npm test`는 DB 사전 검사가 있어 이 작업의 빠른 시작 명령과 다르다.
4. `npm run workflow:press`로 모의 비교 결과를 만든다. 기본 산출물 경로는 git에서 제외한 `evals/press-workflow/runs/`이다.
5. 아래 후속 작업 중 하나를 선택하고 변경 목적·완료 기준부터 갱신한다. UI나 범용 빌더부터 확장하지 않는다.

일시 작업 상태는 `.agent-work` 프로토콜에 맡긴다. 이 문서는 완료 후에도 남는 인수인계 기준이며, 특정 AI의 lease/owner를 영구적으로 예약하지 않는다.

## 수정할 폴더 범위

| 경로 | 책임과 수정 범위 |
|---|---|
| `domain/press-workflow/` | 입력/설정 계약, 우선순위, 스냅샷, 순수 규칙 검사와 단위 테스트. DB/Next.js/모델 SDK를 넣지 않는다. 기존 canonical hash 유틸만 재사용한다. |
| `lib/services/press-workflow/` | 설정 확정 → 실제 생성기 호출 → 검사 → 실행 기록. 외부 의존성은 주입한다. 향후 API도 이 진입점을 호출한다. |
| `scripts/press-workflow/` | CLI 인자, 파일 입출력, 모의/실제 모델 어댑터. 비즈니스 규칙을 여기에 복사하지 않는다. |
| `evals/press-workflow/` | 합성 입력 사례와 설정. `runs/`는 로컬 결과이며 커밋하지 않는다. 실제 사용자 자료를 예제로 추가하지 않는다. |
| `docs/ai/press-workflow/` | 목표, 결정 이유, 완료 기준, 검증 결과, 후속 작업. |

허용한 공유 파일은 `lib/llm/articleGenerator.ts`, `lib/llm/articleGenerator.test.ts`, `lib/llm/prompts/press-release.ts`, `package.json`의 관련 scripts, `.gitignore`의 실행 결과 경로, 루트 `AGENTS.md`의 진입 링크다. 생성기를 통째로 복제하지 않는다.

현재 범위 밖: `app/`, `components/`, `stores/`, `prisma/`, 결제·쿼터·인증, legacy StyleGuide 컴파일러, 기존 `domain/press-agent/` 실행 엔진과 `domain/press-ai-debugger/` 레지스트리, `ai-process-console` 및 `PressTuner-scheduler` 저장소. 이 경계를 넘기는 후속 작업은 먼저 이 문서에 변경 이유·대상·검증 계획을 명시한다. 범위가 커졌다는 이유만으로 이미 허용된 작업의 승인을 다시 요청할 필요는 없다.

## 현재 구조와 결정

```text
JSON 사례: 입력 + 기본 설정 + 요청별 변경
  → resolveDraftConfiguration (필드별 대체)
  → runDraftWorkflow
      → generateArticleWithLLM (실제 서비스와 공유)
      → raw JSON 구조 검사 + 생성기의 정규화
      → 문구/채택된 fact ID 검사
  → 기본 설정 실행과 요청 적용 실행의 JSON 비교 기록
```

- 기본 설정의 `revision`과 요청 변경의 `revision`은 각각 보존한다. 지정한 필드만 대체하며 문자열이나 배열을 누적하지 않는다. 빈 문자열/빈 배열은 명시적 제거다.
- `tone`과 `stylePolicy`는 서로 다른 필드다. `tone`만 바꾸면 기존 `stylePolicy`는 유지된다. 문체를 바꾸는 사례에서는 둘 다 명시한다. 자유문장 내부의 상충 규칙까지 자동 해석·해결하지는 않는다.
- 스냅샷은 입력과 분리해 복사·freeze하고 내용 해시를 붙인다. 같은 revision 문자열 아래 내용을 바꿔도 해시가 달라진다. 이것은 실행 증거의 구별이며, 저장소 수준에서 revision 불변성을 강제하는 버전 관리 기능은 아직 아니다.
- 전체 적용 프롬프트·모델·temperature·response format과 요청 해시를 저장한다. 입력/설정 해시, workflow/evaluator revision, 고정 시각, 로컬 시간대, 원본 응답, 정규화 결과, 오류·검사 이유도 남긴다. 모델 호출 자체는 비결정적이다.
- 모의 실행은 실제 프롬프트를 조립하고 고정된 합성 응답을 주입한다. 기본/변경 실행에 같은 응답을 써서 문체 개선 효과를 꾸며내지 않는다. 모의 기록은 `synthetic`, 실제 모델 실행 기록은 `measured`지만, 양쪽 모두 의미적 품질은 `NOT_EVALUATED`다.
- 실행 성공, 좁은 규칙 검사, 결과의 유용성을 분리한다. 모의 테스트 통과나 `guardrailStatus: PASS`는 출시 허가/실제 사실 검증/요청 충족 판정이 아니다.
- CLI는 한 파일에 두 실행을 저장하며 기존 파일을 덮어쓰지 않는다. 실제 모델 호출 전에 출력 파일을 예약한다. 프로세스 강제 종료 시 빈 파일이 남을 수 있으므로 파일 존재만으로 완료를 판단하지 않는다. JSON의 두 실행 상태를 확인한다.

공유 생성기의 변경: 고정된 통신사 문체 대신 선택한 톤을 시스템 프롬프트에도 적용한다. 사용자 문자열의 `$&`/`{{...}}`를 치환 문법으로 재해석하지 않는다. 시제 판단도 주입된 시간을 사용한다. **이 세 변경은 기존 웹 호출자에도 적용된다.** 새 워크플로우의 설정 UI나 서비스 연결은 아직 추가하지 않았다.

## 평가가 말할 수 있는 범위

| 검사 | 현재 판단 | 하지 못하는 판단 |
|---|---|---|
| 원본 JSON 구조 | 잘못된 응답을 실행 실패로 기록 | 문장이 좋은가 |
| `usedFactIds` | 채택된 ID 이외의 참조는 BLOCK | 허용 ID를 붙인 문장의 사실성, 누락된 인용 |
| 필수 문구 | 문자 그대로 없으면 WARN | 바꿔 쓴 동의 표현, 문맥·수치의 정확성 |
| 피할 문구 | 문자 그대로 있으면 WARN | 우회 표현, 전체 문체 만족도 |
| 사실 근거/요청 문체 | NOT_EVALUABLE | 향후 사람 검토 또는 검증된 평가기가 필요 |

FACT와 STYLE_EXAMPLE은 분리된 프롬프트 영역에 넣지만 프롬프트만으로 예시의 숫자 유출 방지를 입증하지 않는다. 최종화는 기존 authoritative verification 서비스의 책임이다. RAG의 검색/채택/권한은 이 실행기의 책임이 아니다. `acceptedFacts`는 지금은 합성 파일에서 공급하며, 실제 API에 연결할 때 브라우저가 보내는 사실을 신뢰하지 말고 서버에서 팀 범위의 채택된 사실을 읽어야 한다.

## 실행 방법

저장소 루트에서:

```powershell
npm run test:press-workflow
npm run typecheck:press-workflow
npm run workflow:press
npm run workflow:press -- --case evals/press-workflow/friendly-launch.json --out evals/press-workflow/runs/my-review.json
npm run workflow:press -- --help
```

실제 모델을 비교할 때만 환경에 `OPENAI_API_KEY`를 설정하고 다음을 실행한다. CLI는 `.env`를 자동으로 읽지 않는다. 모델은 사례의 설정값을 사용한다. 한 번에 기본/변경 설정을 각각 한 번 호출하며 자동 재시도는 없다. 이 초기 구현 검증에서는 실제 모델을 호출하지 않았다.

```powershell
npm run workflow:press -- --mode live --allow-model-spend --out evals/press-workflow/runs/live-review-01.json
```

결과에는 원문과 프롬프트가 들어간다. 로컬에서 확인하고 Console이나 공개 보고서로 그대로 전송하지 않는다. 종료 코드 1은 실행 실패 또는 BLOCK이며 JSON에서 이유를 확인한다. WARN과 미평가 항목은 종료 코드 0이어도 남아 있다.

## 이번 기반 작업의 완료 기준

- 웹 서버/DB/키 없이 실행과 자동화 테스트가 동작한다.
- 요청의 문체·규칙 대체와 명시적 제거를 확인할 수 있다.
- 실제 사용 프롬프트와 설정을 실행 결과에서 추적할 수 있다.
- 잘못된 응답, 허용되지 않은 근거 ID, 문구 누락/위반을 구분한다.
- 검증하지 않은 사실성·문체 품질을 성공으로 표시하지 않는다.
- 같은 생산 코드 생성기를 호출하며 후속 AI가 위 폴더 안에서 작업을 시작할 수 있다.

## 후속 작업: 가장 먼저 할 일

다음 목표는 **설정 변경이 실제로 더 유용한 초안을 만드는지 확인하는 것**이다. 코드 구조를 더 늘리기 전에 아래 사례와 사람 검토 기준을 구체화한다.

1. 공식 → 친근한 문체, 필수 날짜 유지, 근거 없는 과장 금지, 예시의 숫자/인물명 유출, 팀 기본값 제거를 포함한 작은 사례집을 만든다. 요구사항마다 기대 결과와 평가할 수 없는 부분을 기록한다.
2. 동일 입력의 기본/변경 결과를 사람이 비교해 “요청 문체 충족, 사실 보존, 수정할 부분”을 남긴다. 모의 실행과 별도로 실제 모델 비교가 필요하며 한 쌍의 결과로 개선을 일반화하지 않는다.
3. 사실/문체 평가를 추가한다면 현재 검사와 구분된 결과·근거·평가기 revision을 남긴다. 먼저 기존 `domain/article/verificationPolicy.ts`와 검증 서비스의 재사용 경계를 검토한다. LLM judge 하나의 점수를 진실로 취급하지 않는다.
4. 사용자 사례가 납득할 수준으로 동작하면 기존 생성 서비스에 진입점을 연결한다. 서버에서 권한과 채택된 사실을 공급하고, 그 뒤 화면에서 설정을 편집하게 한다.
5. 저장이 필요해질 때 immutable configuration revision, 실행 snapshot 참조, 동시 편집의 optimistic version check를 설계한다. DB 락은 구체적인 경쟁 조건과 트랜잭션 경계가 생겼을 때 선택한다.

범용 노드/엣지 편집기, 임의 코드 실행, 모델 자동 튜닝, Console을 실행 엔진으로 바꾸는 작업은 다음 목표가 아니다. Console 연결은 프로젝트가 평가한 사실을 기존 버전 계약으로 내보내는 후속 작업이다.

## 검증 기록

2026-09-23 초기 구현 검증:

- `npm run test:press-workflow`: **13/13 통과**. 설정 대체·제거, 스냅샷 보존, 실제 프롬프트 캡처, 모의 증거 구분, 잘못된 응답 처리, 근거 ID/문구 검사, CLI 무자격증명 실행과 결과 덮어쓰기 방지를 포함한다.
- `npm run typecheck:press-workflow`: **통과**. 전용 tsconfig는 워크플로우와 공유 생성기의 타입을 검사하며 앱 전체의 설치 상태와 분리되어 있다.
- `node --import tsx --test domain/evaluation/experimentRunner.test.ts domain/evaluation/pressTransitionEvaluator.test.ts`: **기존 회귀 검사 4/4 통과**.
- `npm run workflow:press -- --out <새 파일>`: 모의 baseline/candidate 모두 `COMPLETED/PASS`, 의미적 품질은 `NOT_EVALUATED`. 결과 원문을 확인했다. `--help`도 정상 동작한다.
- `npm run lint`: 종료 코드 0, 오류 없음. 당시 77개 경고 중 새 CLI의 미사용 import 1개는 제거했다. 변경 범위 대상으로 재실행한 eslint는 기존 생성기의 미사용 catch 변수 경고 1개만 남았다.
- `git diff --check`: 통과.
- `npm run build`: **미통과**. 기존 Windows build wrapper의 `spawnSync("npm", ...)`가 `ENOENT`로 실패한다. 진단 명령으로 동일하게 재현했다.
- `npm run build:next`: wrapper를 우회했지만 **미통과**. 현재 설치된 의존성에 `@daypicker/react`와 `@react-pdf/renderer`가 없어 기존 날짜 UI/PDF 모듈에서 멈춘다. 이 작업에서는 설치 환경과 앱 빌드 스크립트까지 수정하지 않았다.

실제 모델 호출, DB 테스트, 실제 검색, UI 연결, 배포는 미실시다. 위 PASS를 문체 개선이나 사실 보존의 실증 결과로 인용하지 않는다. 새/변경 파일은 커밋되지 않은 상태로 인계한다.
