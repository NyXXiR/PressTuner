# Judge 연구 백엔드 v1

2026-10-12. 화면 검증을 뒤로 미루고 계획 2~5의 백엔드를 연결한 구현이다. 기존 기사 평가 이력을 출발점으로 기준 데이터·선택형 검토·보정/감사·개선 실험·회귀 판정을 저장한다. 실제 사람 라벨 수집과 정확도/노력 절감 실증은 구현 완료와 다르다.

## 데이터와 권한

- `PressQualityStudy`: 팀에 속한 versioned JSON aggregate, revision, 생성자, 생성 요청 hash. 원문 스냅샷·평가 recipe·검토 revision·실험 단계·사람 결정이 하나의 연구에 묶인다. 팀당 50개, 연구당 표본 60개/실험 10개, 저장 8 MiB 상한이다. 작은 연구를 원자적으로 고정하기 위한 선택이며 대규모 운영에서는 테이블 정규화와 작업 큐가 대안이다.
- `PressQualitySourceAssignment`: 팀 내 기사·공유 document·동일 fact 집합의 source hash와 최초 partition. 다른 연구에서도 같은 원문을 개발/보정/감사/holdout 사이에 섞지 못한다. 연구 삭제로 출처 사용 이력을 지우지 않는다. 아직 partition 재배정은 제공하지 않는다.
- 저장된 `ArticleQualityEvaluation` ID로 서버가 입력을 읽는다. 요청에 점수, 사람 ID, 원문, 임의 그룹 ID를 넣을 수 없다. 현재 기사 권한과 저장 실행의 팀이 모두 맞아야 한다.
- 모든 API가 로그인과 팀 멤버십을 확인한다. 데이터 구성·정책·실험·회귀·보고서·export는 OWNER/ADMIN, 본인의 질문 조회·선택은 팀 멤버가 할 수 있다. 모델 실행 후 권한도 재확인한다.
- 짧은 상태 변경은 팀 advisory lock → 연구 row lock 순서로 저장한다. `expectedRevision` 충돌은 409이며 `idempotencyKey` 재전송은 같은 결과 참조를 반환한다. 모델 호출은 트랜잭션 밖이다.
- 원격 테스트 DB에서 연결이 끊긴 뒤 idle transaction이 잠금을 유지한 실패를 관측했다. 해당 검증 연결만 정리했다. 이후 연구 트랜잭션에는 DB 측 idle 60초·statement 55초·lock wait 10초 제한과 Prisma 60초 제한을 함께 둔다. 다른 DB 세션의 전역 설정은 바꾸지 않는다.

## API

| 경로 | 동작 |
|---|---|
| `GET /api/press/quality-studies` | 현재 팀 연구 목록 |
| `POST /api/press/quality-studies` | `{name, idempotencyKey}`로 생성 |
| `GET /api/press/quality-studies/:id` | 현재 revision·자기 검토 묶음·자기 A/B 질문 복구 |
| `GET .../:id?view=report` | 관리자용 통계·실험/회귀 결과. 조회자의 자동 판정 노출 기록 |
| `GET .../:id?view=dataset` | 고정 입력·출력·평가기와 정확한 범위의 사람 기준 라벨 export |
| `POST .../:id` | 아래 command. 같은 origin의 JSON, 최대 64 KiB |

모든 command는 `action`, `expectedRevision`, `idempotencyKey`를 포함한다. 성공 응답에 새 revision과 `resultRef`가 나온다. 같은 key의 내용/사용자 변경은 거부한다. 연구 저장 상한에 도달하면 새 연구 버전으로 분리한다.

| action | 추가 입력 / 효과 |
|---|---|
| `ADD_SAMPLES` | `samples:[{articleId,runId,partition}]`; partition은 DEVELOPMENT/CALIBRATION/AUDIT/HOLDOUT |
| `FREEZE_DATASET` | 입력·출력·평가기·출처 그룹을 고정. 이후 표본 추가 금지 |
| `ASSIGN_REVIEW` | `purpose: PRODUCT/DEVELOPMENT/CALIBRATION/AUDIT`; 최대 3항목, 미완료 묶음 재사용 |
| `SUBMIT_REVIEW` | `review:{batchId,itemId,expectedRevision,choice,priorExposure,reason?}`; 로그인 reviewer로 revision 추가 |
| `FREEZE_CALIBRATION` | 보정 partition만 사용해 임계값 후보를 고정. 부족하면 INSUFFICIENT 상태도 저장 |
| `REEVALUATE_JUDGE` | `sampleId,allowModelSpend:true`; 같은 고정 초안을 현재 설정으로 다시 평가. 생성 호출 없음 |
| `PLAN_EXPERIMENT` | `sampleIds` 최대 20개; 개발 실패 가설·생성/평가 설정을 고정 |
| `RUN_STEP` | `experimentId,allowModelSpend:true`; 대기 중인 생성 또는 평가 한 단계만 수행 |
| `ASSIGN_PAIRWISE` | `experimentId,sampleId`; 실제 생성된 두 초안의 A/B 위치를 무작위로 고정 |
| `SUBMIT_PAIRWISE` | `pairId,choice:A/B/TIE/UNCERTAIN/SKIP,priorExposure,voteRevision` |
| `PROMOTE_REGRESSION` | `sampleId,metricId`; 사람 확인 개발 결함만 회귀 조건으로 승격 |
| `DECIDE` | `experimentId,choice:KEEP_BASELINE/MORE_EVIDENCE/HOLD/SELECT_CANDIDATE`; 결정과 보고서 hash 고정. 후보 선택은 screening 충족 때만 가능 |

예: 데이터 고정 뒤 질문 요청.

```json
{"action":"ASSIGN_REVIEW","purpose":"CALIBRATION","expectedRevision":2,"idempotencyKey":"review-request-0001"}
```

## 검토와 기준 데이터

PRODUCT는 위험 우선 순서로 자동 설명을 보여 주고 APPLY/KEEP/DEFER **의도만 기록**한다. 원고를 실제로 수정하거나 기준 정답으로 승격하지 않는다. 원고 적용 UX는 후속이다.

나머지는 남은 표본/기준에서 균등 비복원으로 최대 3개를 뽑고 포함 확률·pool 크기를 보존한다. 자동 모델명·점수·설명은 질문 payload에서 제외한다. PASS/FAIL/UNCERTAIN/SKIP을 구별하고 이유는 선택이다. 감사 질문은 보정 정책을 고정한 뒤에만 시작한다.

실제 reviewer, timestamp, revision, 표시 방식, 사전 노출 NONE/SEEN_JUDGE/UNKNOWN을 기록한다. 해당 자동 평가의 실행자, 제품 설명을 본 사용자, 연구 보고서를 본 사용자는 노출 이력을 우선 적용한다. 이 기록은 앱 밖에서 점수를 보지 않았다는 보증은 아니다.

기준 라벨은 정확한 출력·metric에만 붙는다. 불확실/건너뛰기/노출·노출 불명은 reference에서 제외하고, 독립 판정끼리 충돌하면 reference를 만들지 않는다. 수정 전 판정도 보존한다. 원문 전체가 검증됐다고 표시하지 않는다. 두 번째 독립 검토자가 없으면 inter-rater는 미측정이다. 불일치 후 공식 합의 절차와 세밀한 문장별 기준 정답은 아직 별도 확장이다.

## 통계와 보정

- profile hash와 metric, partition별 혼동행렬·미탐·오탐·precision·coverage·분모를 보고한다. FAIL을 결함 positive로 정의한다. 자동 평가 실패는 0점/통과로 바꾸지 않는다.
- 보정은 0.00~1.00의 고정 grid에서 원문 그룹에 동일 가중치를 주고 미탐 비용 2, 오탐 비용 1인 탐색을 한다. 이것은 실험 정책이며 업무별 최적 손실 함수를 입증하지 않는다. 최소 10그룹, 정상/결함 각 3그룹은 탐색용 조건이다.
- 감사 데이터는 threshold 튜닝에 들어가지 않는다. 정책 고정 이후 보정 라벨 수정도 금지한다. `OBSERVED_AUDIT_ONLY`는 관측치를 계산할 분모가 있다는 뜻이며 정확도 합격 인증이 아니다.
- 구간은 원문 그룹을 재표집하는 1,000회 percentile bootstrap을 사용한다. 10그룹 미만, 분모 부재, 상수 결과에는 구간을 꾸미지 않는다. 원문이 반복된 초안 수를 독립 표본 수로 쓰지 않는다.
- 동일 항목을 독립적으로 평가한 두 사람의 raw agreement와 Cohen’s kappa 및 marginals를 제공한다. 상수 분포에서는 kappa가 null이다.
- 선택된 benchmark의 조건부 결과다. 위험 우선 제품 질문이나 운영자 선정 연구를 전체 고객 모집단의 오류율로 일반화하지 않는다.
- Ragas의 전체 출력 PASS/FAIL 라벨은 주장별 정답이나 연속 점수의 정확도 검증과 다르다. 표준 Faithfulness와 G-Eval 업무 기준의 라벨을 섞지 않는다.

## 개선 실험과 회귀

개발 partition의 사람 확인 결함 또는 자동 실패 지적을 기존 taxonomy/개선 지침에 연결하며 원인은 HYPOTHESIS로 표시한다. baseline/candidate는 같은 facts와 재구성한 기본 요청에서 production `runDraftWorkflow`/article generator로 새로 생성한다. 기존 기사의 원래 생성 recipe를 복원했다고 주장하지 않는다. 기본 생성 모델은 기존 headless 실험과 같은 4.1 mini이며 `PRESS_EXPERIMENT_MODEL`로 별도 지정한다. 표준 judge Luna, G-Eval 4.1 mini와 독립된 설정이다.

한 `RUN_STEP`은 생성 한 번(최대 출력 2,000 tokens, 재시도 없음) 또는 공식 평가 한 번이다. 모델/생성 구현/평가 profile hash가 바뀌면 고정 recipe 실행을 거부한다. 연구당 한 작업만 실행하고, 7분 lease와 token으로 늦은 결과를 차단한다. 완료 출력/평가는 저장된다. 실패·만료를 자동 재호출하지 않으며 새 실험을 명시적으로 준비해야 한다. UI 종료 후 계속 실행해 주는 상주 worker는 아직 아니다.

Pointwise 차이는 개발/holdout을 나누고 그룹별 대응 차이와 기존 bootstrap 함수를 사용한다. Pairwise는 실제 새 A/B 출력, 무작위 위치, 동률/불확실, reviewer 노출과 revision을 별도로 보존한다. 문체 선호로 사실 결함을 상쇄하지 않는다.

관리자 실험 보고서의 `recipe`는 고정 시각, 생성 모델/구현 hash, evaluator 종류·모델·profile hash, 대상 표본, 개발 출처 그룹, 개선 가설의 지침과 연결 사례를 반환한다. `operational`은 각 출력 hash와 평가 실행 ID·profile·지표 점수·이유·사용량을 보존한다. 결과 점수와 함께 변경 이유·설정을 검토할 수 있으며, 일반 검토자의 블라인드 질문에는 이 정보를 넣지 않는다.

회귀 명세에는 사람 판정 revision, 원문·입력 hash, evaluator hash, metric/threshold가 들어간다. 결과가 없거나 입력/평가기/출력이 맞지 않으면 UNKNOWN(exit 2), 확인된 결함이면 REGRESSION(exit 1), 모두 충족하면 PASS(exit 0)다. 기존 CLI 회귀와 같은 의미를 유지한다.

실험 screening은 완료된 실행, 알려진 회귀 PASS, 별도 감사의 관측 recall/오탐 조건, 목표 기준의 양의 holdout 구간, 최소 10그룹의 후보 우세 pairwise를 함께 요구한다. 모두 충족해도 `READY_FOR_OPERATOR`이며 최종 결정은 사람에게 남는다. `SELECT_CANDIDATE`는 연구 결정 기록이고 운영 prompt 변경이나 원고 FINAL을 실행하지 않는다. 이 screening 정책 자체의 업무 타당성은 실제 사용자/실패 비용을 근거로 추후 검증해야 한다.

## 재현과 배포

```powershell
npm run test:press-study
npm run test:press-system
npm run test:press-standard
npm run typecheck:press-workflow
npm run typecheck:press-standard
node --import tsx scripts/press-workflow/standard-demo.mjs sync-schema
node --import tsx scripts/press-workflow/study-persistence-check.mjs
node --import tsx scripts/press-workflow/study-api-check.mjs
```

DB/API 검증은 `_test` DB와 임시 합성 기록만 쓰며 새 사람 판정·모델 호출을 만들지 않는다. 표준/G-Eval 실행 환경은 기존 venv와 lock을 재사용한다. Next trace에 평가 소스/lock과 생성 소스를 명시적으로 포함한다. 모델 실행에는 서버 feature flag와 API key가 필요하다. 일반/운영 DB 동기화와 원격 CI 실행은 이번 로컬 검증에 포함하지 않는다.

2026-10-12 재개 검증: 인증 HTTP 저장·검토·보고/export 14개와 임시 데이터 정리가 통과했다. 검토 저장 검사는 SKIP/UNCERTAIN의 합성 선택만 사용하며 사람 정답을 만들지 않는다. 초기 DB 연결 오류와 재개 결과는 [결과 문서](EVALUATION_SYSTEM_RESULTS.md)에 함께 보존했다. 이어 합성 한 원문의 실제 유료 모델 왕복도 완료했으며 결과와 관측한 평가 한계는 같은 문서의 마지막 절을 따른다.

인증된 운영자는 `PRESS_QUALITY_SESSION_COOKIE`를 환경에 설정하고 `study-client.mjs`로 보고서/command/회귀 결과를 새 파일에 저장할 수 있다. 쿠키를 argv에 넣거나 출력하지 않는다. 예: `node scripts/press-workflow/study-client.mjs regression STUDY_ID EXPERIMENT_ID result.json`. 모델 호출 command는 body에 `allowModelSpend:true`를 명시한다. 무료 CI에는 새 study 계약 검사를 추가했으며 기존 유료 모델 회귀의 수동 opt-in을 유지한다.

### 제한된 실제 모델 왕복 검사

`study-live-check.mjs`는 격리 데모 서버에서 새 합성 기사 한 개로 전체 모델 경로를 검사한다. 기존 화면의 기사는 수정하지 않는다. 의도적인 가격 모순·근거 없는 실적을 넣은 초안을 STANDARD/GEVAL로 평가하고, 두 실행을 DEVELOPMENT로 고정한 뒤 STANDARD 동일 출력 재평가와 GEVAL 생성 개선 실험을 실행한다.

```powershell
# 현재 데모 서버와 _test DB, 기존 평가 venv/API key를 사용한다.
node --import tsx scripts/press-workflow/study-live-check.mjs --allow-model-spend UNIQUE_EVIDENCE_NAME
# 완성된 결과를 별도 로그인/조회로 복구한다. 모델 작업은 실행하지 않는다.
node --import tsx scripts/press-workflow/study-live-check.mjs --read-only UNIQUE_EVIDENCE_NAME
```

상한은 생성 2개(각 출력 2,000 tokens), 평가 job 5개(적용 가능한 metric 합계 10개)다. 합계 7개 유료 API 작업이며 SDK 내부 HTTP 호출 수와 같은 숫자는 아니다. 각 작업의 요청 key를 JSONL에 먼저 기록하고, 같은 증거 파일명으로 재실행하지 않는다. 실패하면 호출 의도/저장 결과를 확인해야 하며 무조건 새 파일명으로 재호출해서는 안 된다.

별도 JSON에는 실제 source 점수·실험 보고서·설정 hash·사용량·완료한 검사를 저장한다. 합성 기사는 재조회와 후속 검토를 위해 테스트 DB에 남긴다. 사람 선택을 만들지 않으므로 reference는 없고 회귀는 UNKNOWN이다. 독립 감사/holdout/선호 판정도 없으므로 채택 가능 상태가 될 수 없다. 생성 후보의 자동 점수가 낮아졌다면 REGRESSION, 그렇지 않아도 HOLD로 남는다. 이 한 원문의 실행 결과는 평가기 정확도·통계적 개선 효과의 실증이 아니다.

## 선택 근거와 대안

사람 기준과 Judge 결과를 같은 출력에서 비교하는 절차는 [Google Cloud judge 평가 문서](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/evaluate-judge-model)의 pointwise/pairwise 구분을 따른다. 업무 기준은 이미 연결된 [DeepEval G-Eval](https://deepeval.com/docs/metrics-llm-evals)의 고정 평가 단계를 사용하고, 표준 Faithfulness 점수와 구분한다. 라이브러리 기본 threshold는 보정된 업무 기준이 아니다.

관리형 평가 서비스는 검토/모니터링 운영을 대신할 대안이고, 독자 judge prompt는 세부 제어가 필요한 대안이다. 이번 구현은 기존 프레임워크의 점수 의미를 유지하면서 우리 제품의 권한·검토 비용·이력·선택에 연결하는 경험을 확보하기 위해 직접 orchestration을 구현했다. 효과는 현재 실행 가능한 기능이며 실제 정확도/개선/사람 노력 감소는 미측정이다.
