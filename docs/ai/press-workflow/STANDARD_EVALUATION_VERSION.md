# 표준 평가 버전: 먼저 완성할 범위

2026-10-12 사용자 수정 지시. 성능 테스트·평가기 보정·사람 검증보다 공식 프레임워크를 사용하는 기본 제품 흐름을 우선한다. 첫 범위는 **PressTuner 편집 화면에서 평가 실행과 결과 확인**이다. 초기 구현 뒤 사용자가 실행 검증을 승인해 아래 후속 검증을 진행했다.

## 후속: 평가 이력과 업무 G-Eval 연결

2026-10-12 전체 계획 1단계를 구현했다. 아래 최초 버전의 메모리 보관/Prisma 미변경 설명은 최초 시점의 기록이며, 현재 동작은 이 절을 따른다.

- `ArticleQualityEvaluation`에 기사·근거 스냅샷, 모델/프레임워크/rubric/구현 hash, 실행 상태, 지표별 점수·설명·사용량·시간을 저장한다. 저장된 생성 recipe를 확보하지 못한 기사는 generationVersion을 UNKNOWN으로 기록한다.
- 편집기의 **AI 품질 평가**에서 표준 평가와 **업무 · DeepEval G-Eval**을 별도로 실행하고 최근 10회 이력을 조회한다. 원고/근거 변경은 이전 버전 결과로 표시한다. 각 지표의 원래 0~1 점수와 기준값을 유지하며 점수를 합산하지 않는다.
- 표준 기본 모델은 기존 Luna다. G-Eval은 기존 공식 어댑터의 `gpt-4.1-mini`를 보존하며 `PRESS_GEVAL_MODEL`로 별도 설정한다. 두 실행의 모델/설정을 혼동하지 않는다. G-Eval 0.8은 사람 기준 보정 전 실험값이다.
- 현재 기사에서 신뢰할 수 있는 입력은 active accepted facts이므로 G-Eval의 **사실 근거·과장** 두 기준을 실행한다. 필수 사실, 문체 예시 혼입, 요청 문체는 각각 실제 요구사항/예시 기록이 없으므로 NOT_APPLICABLE로 남긴다. 채택 사실 전체를 필수 사실로 바꾸거나 현재 초안에서 요청 문체를 추론하지 않는다. CLI의 완전한 5기준 입력/실행은 유지한다.
- 실행 전 idempotency key로 DB 예약을 만들고, 같은 요청 재전송은 같은 시도를 반환한다. 다른 payload에 같은 key를 쓰면 409다. 재실행은 새 key/새 시도다. 부분 실패 재시도는 동일 fingerprint/profile에서 완료 항목을 재사용하고 실패·미완료만 호출한다.
- 지표마다 종료 즉시 저장한다. 완료/부분 실패/전체 실패를 구분한다. 최대 8분을 넘긴 RUNNING은 이력 조회나 새 예약 시 INTERRUPTED로 바뀌며 이미 저장된 결과는 유지한다. 늦게 도착한 결과로 종료된 실행을 덮어쓰지 않는다.
- DB 예약 lock으로 여러 Node 프로세스에서도 기사당 1개, 전체 2개 동시 시도를 제한한다. 이는 동기 데모의 실행 상한이며 결제/월별 쿼터 정책이 아니다. 모델 호출 중에는 DB 트랜잭션을 유지하지 않는다.
- 기사 읽기 권한을 확인한 뒤 이력을 제공하고, 모델 호출 뒤에도 권한과 최신 fingerprint를 다시 확인한다. 이력 API는 공개 공유 토큰으로 접근할 수 없다. 최종 확정은 기존 authoritative verification 책임이다.

변경 경계는 기존 기사 평가 API·서비스·컴포넌트, 신규 평가 실행 저장 모델, 실행 파일 tracing이다. Prisma schema는 테스트 DB에 적용했고 scheduler의 공식 `generate` 흐름으로 동기화한다. **일반/운영 DB 반영과 배포는 별도다.** 운영 서버는 기존 Python venv 두 개와 trace에 포함한 실행 소스/lock 파일이 필요하다. 임시 JSON 실행 파일은 운영 저장소가 아니다.

검증 명령:

```powershell
npm run test:press-standard
npm run typecheck:press-standard
node --import tsx scripts/press-workflow/standard-demo.mjs sync-schema
node --import tsx scripts/press-workflow/quality-persistence-check.mjs
node scripts/press-workflow/standard-api-check.mjs
node --import tsx scripts/press-workflow/quality-live-check.mjs --allow-model-spend
node --import tsx scripts/press-workflow/quality-live-check.mjs --read-only
```

`sync-schema`와 persistence 검사는 `_test` DB만 허용한다. live 검사는 localhost:3003의 지정된 합성 데모에 표준·업무 평가 각 1회, 같은 key 재전송, 별도 GET 복구를 확인한다. 기존 증거 파일이 있으면 모델 호출 전에 중단한다. 결과는 [구현 결과](EVALUATION_SYSTEM_RESULTS.md)에 기록하며, 사람 검증이나 신뢰도 개선의 증거로 해석하지 않는다.

## 표준과 업무 확장의 구분

| 계층 | 내용 | 이번 작업 |
|---|---|---|
| 표준 기본 버전 | 공식 Ragas Faithfulness와 DeepEval FaithfulnessMetric, 고정 버전·설정, 공통 입력, 원래 지표별 결과 | 편집기/API 연결 |
| PressTuner 업무 확장 | G-Eval로 사실·누락·문체·혼입·과장 기준 정의, 선택형 검토, 개선/회귀 | 기존 구현 보존; 후속 적용 |
| 효과 검증 | 사람 대비 미탐·오탐, 독립 원문 비교, 사용자 노력 측정 | 이번 작업에서 진행하지 않음 |

G-Eval은 평가 기준을 사용자가 정의하는 방법이므로 현재 PressTuner rubric은 업무 확장에 해당한다. 표준 기본 버전에는 공식 내장 지표를 사용한다.

Ragas Faithfulness는 출력의 주장을 근거가 뒷받침하는지 평가한다. DeepEval Faithfulness는 공식 문서상 근거와 모순되지 않는지에 중점을 두며 기본적으로 애매한 주장을 벌점 처리하지 않는다. 같은 이름의 점수라도 정의가 같다고 설명하거나 평균을 내지 않는다.

실제 검색 순위와 reference 정답이 없는 초안 단계에서는 Contextual Precision/Recall을 실행하지 않는다. 입력한 근거를 retrieval_context에 매핑하되 출처가 '채택한 사실'임을 표시한다.

## 구현 순서와 완료 범위

1. 공통 profile/입력/결과 계약을 만든다. Ragas 0.4.3, DeepEval 4.2.8, 모델·threshold·오류·사용량을 명시한다. 공식 prompt와 점수 계산은 바꾸지 않는다.
2. 기존 Ragas Python bridge를 재사용하고 DeepEval의 내장 FaithfulnessMetric bridge를 추가한다. 실행 시간·출력·호출 수를 제한하고 실패는 점수 없이 기록한다.
3. `/api/articles/[id]/quality-evaluation`에 읽기/실행 API를 추가한다. 소유자·팀 멤버를 확인하고 저장된 원고/active accepted facts를 서버에서 읽는다. 브라우저가 보낸 근거를 신뢰하지 않는다. 원고 변경을 전후로 확인한다.
4. `/press/[id]/edit`의 표준 평가 패널에서 저장된 현재 초안으로 실행하고 결과·근거 수·설명·실행 실패를 확인한다. 자동 실행·사람 검토 요청·최종 확정은 이 패널의 동작이 아니다.
5. 설정/실행 안내와 구현 상태를 기록한다. 이번 지시에서는 모델 호출·테스트·사람 판정·효과 측정을 하지 않는다. 코드 정적 검사 결과와 실행 미검증을 분리해 보고한다.

첫 버전의 평가 결과는 현재 편집 화면에 보관한다. DB의 영속 평가 이력·백그라운드 작업·비용 집계는 별도 후속이다. 이를 운영용 평가 플랫폼 전체 완성으로 표현하지 않는다. 기존 authoritative 원고 검증과 최종 확정 조건은 이 품질 점수로 대체하지 않는다.

## 변경 경계

기존 workflow domain/services/scripts에 표준 계약·실행기를 추가한다. 제품 연결을 위해 `components/press/PressStandardEvaluationPanel.tsx`, `SimplifiedPressReviewFlow.tsx`, `app/api/articles/[id]/quality-evaluation/route.ts`, Node 배포의 Python script 포함 설정을 예외 범위로 허용한다. DB는 기존 원고/멤버십/채택 사실을 읽으며 Prisma·결제·스케줄러 의미는 변경하지 않는다.

실행 검증 후속에서 기존 저장 경로가 느린 DB의 기본 5초 트랜잭션 제한으로 실패했다. `lib/services/press/adapters/pressProcessPrismaAdapter.ts`의 제한 시간을 30초로 명시하는 최소 예외를 추가한다. advisory lock·상태 전이·권한 검사는 유지한다. 원고 저장 HTTP 응답과 기존 어댑터 테스트로 확인한다. 잠금의 최대 유지 시간도 늘어나는 운영상 차이가 있다.

재현용 demo/build 출력은 `.next/standard-demo`, `.next/standard-build`로 분리한다. Next.js가 추가한 두 출력 폴더의 route type 경로를 루트 `tsconfig.json`에 포함한다. `package-lock.json`과 실제 환경 파일은 변경하지 않는다.

## 공식 참고

- [Ragas Faithfulness](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/)
- [DeepEval Faithfulness](https://deepeval.com/docs/metrics-faithfulness)

## 선택 이유와 대안

| 선택 | 이번 구현에서 얻는 기능 | 대안과 적용 시점 |
|---|---|---|
| Ragas Faithfulness | 주장을 분해해 채택 사실이 이를 뒷받침하는 비율을 공식 구현으로 측정 | 문자열/숫자 일치 검사는 저렴하고 확정적이지만 바꿔 쓴 표현과 의미 관계를 다루는 범위가 좁다. 병행 가능하다. |
| DeepEval FaithfulnessMetric | 내장 기준에 따른 점수, 기본 threshold 판정, 평가 이유를 함께 반환 | G-Eval은 누락·문체·과장 등 업무 기준이 필요할 때 사용한다. 기존 PressTuner G-Eval은 이 확장에 남겨 둔다. |
| 두 프레임워크의 같은 입력 | 근거 지지와 비모순이라는 정의 차이를 보존한 채 각각의 결과를 볼 수 있다 | 비용을 줄이려면 하나의 프레임워크를 기본값으로 택할 수 있다. 현재는 학습·구현 비교가 목적이며 점수의 평균이나 다수결을 사용하지 않는다. |
| 채택 사실을 context로 제공 | 제품이 이미 승인한 FACT에 대한 초안의 충실도를 평가 | 실제 검색기의 품질은 검색 순위·질문·reference가 준비된 후 Contextual Precision/Recall로 별도 평가한다. STYLE_EXAMPLE을 사실 근거로 넣지 않는다. |

위 표의 효과는 **구현된 기능**이다. 사용자 품질 개선, 평가기 정확도, 비용 우위는 아직 측정하지 않았다. 이 점수만으로 사실의 외부 진위, 필수 내용의 완전성, 배포 가능 여부가 입증되지 않는다.

## 실행 준비

Node 서버에서 Python 자식 프로세스를 실행할 수 있어야 한다. 두 프레임워크의 의존성을 격리하고 lock 파일로 설치한다. 다음은 Windows PowerShell 기준이며 Linux에서는 실행 파일 경로가 `bin/python`이다.

```powershell
python -m venv .venv-press-eval
.venv-press-eval/Scripts/python.exe -m pip install -r scripts/press-workflow/ragas/requirements-lock.txt
python -m venv .venv-press-deepeval
.venv-press-deepeval/Scripts/python.exe -m pip install -r scripts/press-workflow/deepeval/requirements-lock.txt
```

| 환경 변수 | 의미 / 기본값 |
|---|---|
| `OPENAI_API_KEY` | 서버에서만 사용하는 평가 모델 키. 브라우저에 전달하지 않는다. |
| `PRESS_EVALUATION_MODEL` | 기본 `gpt-6-luna`. 두 지표에 같은 모델을 쓴다. `gpt-4.1-mini`로 명시하면 이전 모델도 사용할 수 있다. 그 외 모델의 응답·파라미터 호환성은 별도 확인이 필요하다. |
| `PRESS_EVALUATION_ROOT` | 스크립트와 profile이 있는 저장소 루트. 기본 Node의 현재 작업 폴더. |
| `PRESS_RAGAS_PYTHON` | 기본 `<root>/.venv-press-eval/Scripts/python.exe` 또는 `bin/python`. 명시할 때는 절대 경로를 사용한다. |
| `PRESS_DEEPEVAL_PYTHON` | 기본 `<root>/.venv-press-deepeval/Scripts/python.exe` 또는 `bin/python`. 명시할 때는 절대 경로를 사용한다. |
| `PRESS_STANDARD_EVALUATION_ENABLED` | 개발 환경은 키/파일이 있으면 사용 가능. `false`면 비활성. production에서는 명시적으로 `true`여야 활성. |

공식 prompt와 점수 정의는 유지하되 실행 모델, temperature 0, 동기 실행, 호출/시간 제한은 프로젝트가 명시한다. 따라서 모든 라이브러리 기본 설정을 그대로 쓴다는 뜻은 아니다. DeepEval 기본 threshold는 0.5이며 `penalize_ambiguous_claims=false`, `strict_mode=false`다. Ragas 연결은 점수를 반환하고 별도 합격 threshold나 설명을 만들지 않는다. DeepEval은 공식 `metric.measure`를 사용하며 Confident AI 호스팅·전체 `evaluate()` 리포팅을 연결한 것은 아니다.

## 저비용 평가 모델 — 2026-10-12

표준 편집기의 기본 judge는 `gpt-6-luna`다. `standard-profile.json` v2에 기본 모델과 모델별 요청 설정을 함께 기록한다. 기존 `gpt-4.1-mini` 실행 증거는 당시 모델 그대로 보존하며, 별도 G-Eval 실험과 원고 생성 모델은 이번 교체 범위에 포함하지 않는다.

- 선택 이유: [공식 Luna 문서](https://developers.openai.com/api/docs/models/gpt-6-luna)의 일반 처리·짧은 컨텍스트 단가는 입력/출력 100만 토큰당 $0.10/$0.50이다. [4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)의 $0.40/$1.60 대비 같은 토큰 수에서 입력 75%, 출력 68.75% 절감한다. 캐시·추론·재시도 등 실제 사용량에 따른 청구 비용의 실측 절감률은 별도다.
- 호환성: [공식 이전 안내](https://developers.openai.com/api/docs/guides/latest-model#migration-quickstart)에 따라 기존 비추론 호출의 역할을 유지하도록 `reasoning_effort=none`, `temperature=0`, `max_completion_tokens=3000`을 명시한다. Ragas/DeepEval SDK가 모델명에 따라 바꾸는 기본값 뒤에서 두 bridge에 같은 설정을 적용한다. 공식 프롬프트·점수 계산·DeepEval threshold는 유지한다.
- 대안: 환경 변수 `PRESS_EVALUATION_MODEL=gpt-4.1-mini`로 이전 호출 조건을 사용할 수 있다. 자동으로 비싼 모델에 재시도하지 않는다. 추론을 사용하는 모델이나 다른 모델명은 호환성·비용·판정 검증 뒤 추가한다.
- 검증 범위: 오프라인 실제 SDK 요청에서 Luna/이전 모델의 파라미터, 구조화 출력, 점수·사용량, 기존 호출 상한을 확인한다. 합성 원고 실행 성공은 사람 판정과의 일치도나 평가 정확도 동등성을 입증하지 않는다.

공유 Ragas bridge가 이 profile의 모델 설정을 읽으므로 기존 실험 CLI의 구현 해시에도 profile을 포함한다. 이전 모델의 호출 설정은 유지하지만 기존 동결 recipe는 변경된 구현을 감지하므로 새 실험에는 다시 동결한 recipe가 필요하다.

실행 확인(14:05:09 KST): 분리된 테스트 DB의 동일 데모 원고에서 Luna로 Ragas 1.000(13.2초, 입력/출력 1,767/307 tokens), DeepEval 1.000(15.0초, 1,643/230 tokens)을 반환했다. 화면의 모델명·저장 완료·사용량을 확인했다. 집계 증거는 `evals/press-workflow/evidence/2026-10-12-standard-luna.json`에 보존한다.

검증: Python SDK 계약 5개, 표준 결과 계약 5개, 공유 bridge의 동결 실험 CLI 5개 통과. 표준 타입 검사 통과. 전체 lint는 기존 경고 76개·오류 0개이며 변경 TypeScript 파일은 경고도 없다. `npm run build`는 실행 중인 개발 서버의 Prisma DLL 잠금(EPERM)으로 prebuild가 실패했고, 같은 코드의 직접 Next 빌드(`NEXT_DIST_DIR=.next/standard-build`)는 전체 타입 검사와 151개 페이지 생성까지 통과했다.

## 제품에서 사용하는 순서

1. 로그인한 팀 멤버가 채택 사실과 초안이 있는 보도자료의 `/press/<articleId>/edit`을 연다. 이 경로는 실제 Next.js 제품이며 기존 `8766/decisions` 로컬 검토 서버와 다르다.
2. **표준 AI 평가 → 표준 평가 실행**을 누른다. 화면을 여는 것만으로는 모델을 호출하지 않는다. 원고를 저장한 뒤 서버가 DB에서 원고와 active ArticleFact를 읽어 두 지표를 실행한다.
3. 각 카드에서 원래 점수, DeepEval threshold 충족 여부, 설명과 버전·소요 시간·사용량을 확인한다. 한 지표가 실패해도 다른 지표 결과는 유지되며 실패 점수를 0으로 만들지 않는다.
4. 원고를 수정하면 이전 결과 표시가 나온다. 서버는 실행 전후 원고·근거 fingerprint와 접근 권한을 다시 확인한다. 현재 UI는 저장 상태 변화와 창 포커스 복귀 때 상태를 다시 읽으며, 다른 사용자의 변경을 실시간 구독하지는 않는다.

키 또는 Python 환경이 없거나 초안/채택 사실이 없으면 실행할 수 없는 이유를 표시한다. 팀에 속하지 않은 개인 원고에는 현재 ArticleFact가 없어 평가 근거를 마련해야 한다. 첫 버전에서는 원고·사실을 임의로 잘라내거나 근거를 자동 채택하지 않는다.

## 실행 경계와 남은 작업

- 실행 입력: 제목 포함 초안 20,000자, 채택 사실 1–20개·각 3,000자, 전체 bridge JSON 128 KiB 이내. 사용자에게 입력 한도를 표시한다.
- Ragas는 최대 4회 호출·bridge 100초, DeepEval은 최대 8회 호출·bridge 260초로 제한한다. 각 응답의 최대 토큰은 3,000이다. 실패/시간 초과 뒤 소비량을 받지 못했다면 `사용량 미확인`으로 표시한다.
- 한 Node 프로세스에서 원고별 중복 실행을 막고 동시에 최대 2개 원고만 실행한다. 분산 잠금·계정별 사용량/결제 쿼터·백그라운드 작업은 포함하지 않는다. 운영 배포 전 이 경계를 정해야 한다.
- API는 Node runtime, 최대 360초를 선언한다. 전후 DB 읽기는 각각 최대 30초다. 배포 서버에도 Python·패키지와 충분한 요청 실행 시간이 필요하다. Next 파일 추적은 script/profile을 포함할 뿐 Python 환경을 설치하지 않는다. 로컬 평가 결과·작업 상태·Python 환경·Python 테스트 파일은 이 API의 배포 추적에서 제외한다. Edge·정적 호스팅만으로는 실행할 수 없다.
- 현재 편집 화면의 결과만 보관한다. 새로고침하면 사라지며 DB 이력·JSON 내보내기는 이번 범위 밖이다. 원고 확정은 기존 authoritative 검증을 계속 따른다.

## 초기 코드 구현의 확인 상태 — 2026-10-12

공통 profile/결과 계약, 공식 지표 bridge, 인증 API, 편집기 패널과 배포 파일 추적을 구현했다. 이번 사용자 지시에 따라 모델 호출, 브라우저 실행 확인, 자동 테스트, 성능 측정과 사람 검토는 하지 않았다. 이전 실험 결과를 이 표준 버전의 검증 결과로 사용하지 않는다.

- `npm run typecheck:press-standard`: 통과. 새 API·편집기·서비스와 직접 참조한 모듈을 포함하는 정적 검사다. 전체 앱 빌드 성공을 뜻하지 않는다.
- `npm run lint`: 종료 코드 0, 오류 0, 기존 경고 76개. 변경 파일 대상 검사에서도 오류/경고가 없었다.
- Python `ast.parse`: 새 `deepeval/faithfulness.py` 구문 통과. 라이브러리 import나 평가 실행 없이 소스만 검사했다.
- `git diff --check`: 통과.
- 전체 앱 빌드, SDK 실행, 인증 API 요청, 브라우저 확인과 실측 평가는 이번에 실행하지 않았다. **코드 연결 구현 완료 / 실행 검증 보류** 상태다.

## 후속 실행 검증 — 2026-10-12

사용자 승인 뒤 분리된 `presstuner_test` DB에 합성 계정·팀·원고·USER 사실 3개를 만들고 실제 Next.js 편집기에서 실행했다. 서비스 DB의 원고는 변경하지 않았다. 사람의 검토 결과나 실제 고객 품질 사례가 아니다.

- 수정: DeepEval `OpenAIModel`의 구조화 응답 `parse()` 호출이 `create()`를 거치지 않아 사용량 집계와 호출 상한이 빠졌다. 실제 설치 SDK + 오프라인 HTTP 응답을 이용한 두 실패 테스트로 재현했고 두 경로를 함께 제한해 통과했다.
- 수정: 느린 DB에서 준비 조회와 기존 원고 저장이 기본 5초 트랜잭션 제한으로 실패했다. 읽기/저장 경계에 30초 제한을 명시했다. 연결 실패 시 결과를 유지하고 **연결 다시 확인**으로 상태 조회를 재시도할 수 있다.
- 제품 실행: 개발용 로그인 → 원고 저장 HTTP 200 → 표준 평가 HTTP 200 → 두 결과 표시 → 연결 재확인 후 오류 해제까지 확인했다. 합성 원고에서 Ragas 1.000, DeepEval 1.000. Ragas 입력/출력 1,787/354 tokens, DeepEval 1,664/214 tokens. 화면상 지표 소요 시간은 각각 18.3초/17.0초였다. 두 지표는 병렬 실행한다.
- API 방어: 미인증 401, 정상 준비 조회 200, 다른 Origin 403, 깨진 JSON 422, 브라우저 제공 contexts 422, 큰 요청 413, 오래된 원고 409 확인. 이 요청 검사 자체는 모델을 호출하지 않는다.
- 핵심 TypeScript 테스트 5개, 기존 저장 어댑터 테스트 3개, 새 DeepEval SDK 회귀 2개 통과. 기존 Ragas/DeepEval 어댑터 계약 3개도 통과했다.
- 타입 검사와 변경 파일 lint 통과. `npm run build`는 실행 중인 개발 서버가 Prisma DLL을 잠가 prebuild에서 실패했다. 같은 설치 클라이언트를 사용해 별도 출력 폴더에서 직접 실행한 Next.js 프로덕션 빌드는 통과했다. npm wrapper 자체의 정상 종료와 혼동하지 않는다.
- 최종 전체 lint도 오류 0, 기존 경고 76개로 통과했다. 배포 추적 제외 설정 후 다시 빌드해 필수 Python bridge/profile 포함과 로컬 평가 결과·작업 상태·Python 환경·환경 파일 제외를 확인했다.

이번 실측은 기능 연결 증거다. 세 사실을 그대로 담은 원고 하나에서 1.000을 받았다는 사실로 미탐률, 평가기 신뢰도, 개선 효과를 주장하지 않는다. 로컬 DB 응답이 느려 저장 약 24.5초, 평가 API 약 37.3초가 걸렸으며 운영 지연 최적화는 남아 있다.

### 검증 화면 다시 열기

```powershell
npm run seed:press-standard
npm run demo:press-standard
```

`http://localhost:3003/press/standard-evaluation-demo/edit`에서 개발 계정 로그인 후 실행한다. seed는 test 이름의 DB에만 쓰며 같은 원고가 있으면 덮어쓰지 않는다. 이 서버는 기존 `.env`를 바꾸지 않고 `DATABASE_URL`만 테스트 DB로 바꿔 실행한다. 후속 영속화 구현으로 평가 결과는 DB에 저장되고 새로고침 뒤 최신 10회를 조회한다. 일반 수정 카드의 후보·유지/보류 상태는 화면 내부 상태이며 이 평가 이력과 다르다.

재현 검사: `npm run test:press-standard`, `npm run check:press-standard-api`(위 서버 필요), `.venv-press-deepeval/Scripts/python.exe -m unittest discover -s scripts/press-workflow/deepeval -p test_faithfulness.py`. SDK 회귀 테스트는 오프라인 transport만 사용한다. 실제 모델 호출은 편집기의 실행 버튼에서 별도로 시작한다.
