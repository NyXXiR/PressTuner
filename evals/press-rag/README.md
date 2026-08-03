# Press RAG evaluation

이 디렉터리는 Press RAG의 통제된 논리 문서 코퍼스와 버전별 기대 사례를
검증하고, 별도로 수집한 실행 결과를 재현 가능하게 점수화한다. `v1`은 검색,
인용, 근거 충실도, 문서 충돌, 답변 불가능 판정을 측정한다. `v2`는 여기에
FACT/STYLE_POLICY/STYLE_EXAMPLE/IGNORE 역할 격리, 후보 승인, 제외 출처,
최종 증거 선택, 증거 적격성, PASS/WARN/BLOCK 판정을 추가한다.

## 명령

기본 명령과 명시적 v1/v2 검증은 모두 데이터셋 옆의 `corpus.json`을 자동으로
사용한다.

```bash
npm run eval:press-rag
npm run eval:press-rag -- --dataset evals/press-rag/v1/cases.json
npm run eval:press-rag -- --dataset evals/press-rag/v2/cases.json
```

코퍼스나 측정 결과를 명시하고 보고서를 파일로 저장할 수 있다.

```bash
npm run eval:press-rag -- \
  --dataset evals/press-rag/v1/cases.json \
  --corpus evals/press-rag/v1/corpus.json \
  --results evals/press-rag/v1/results-2026-07-23.json \
  --output /tmp/press-rag-v1-report.json

npm run eval:press-rag -- \
  --dataset evals/press-rag/v2/cases.json \
  --corpus evals/press-rag/v2/corpus.json \
  --results path/to/measured-v2-results.json \
  --output path/to/v2-report.json
```

- `--dataset`: 사례 fixture. 기본값은 `evals/press-rag/v1/cases.json`이다.
- `--corpus`: 통제 코퍼스 fixture. 생략하면 선택한 데이터셋과 같은 디렉터리의
  `corpus.json`이다.
- `--results`: 측정 artifact. 생략하면 fixture만 검증한다.
- `--output`: 보고서 경로. 생략하면 표준 출력에 쓴다.

## 측정 artifact 계약

기존 v1 필드는 그대로 유지한다. 기대 문서, 답변 불가능 여부, 충돌 여부는
artifact를 신뢰하지 않고 선택한 데이터셋에서 결합한다.

```json
{
  "datasetVersion": "press-rag-v2",
  "corpusVersion": "press-rag-v2",
  "model": "model-name",
  "judgeModel": "judge-name",
  "promptVersion": "prompt-v3",
  "retrievalVersion": "retrieval-v2",
  "toolsetVersion": "tools-v1",
  "configVersion": "config-v4",
  "collectedAt": "2026-08-03T00:00:00Z",
  "results": [
    {
      "caseId": "role-01",
      "retrievedDocumentIds": ["fact-product"],
      "citations": [{ "documentId": "fact-product", "supported": true }],
      "claims": [{ "grounded": true }],
      "predictedUnanswerable": false,
      "detectedConflict": false,
      "latencyMs": 1200,
      "costMicros": 900,
      "usedRoles": ["FACT"],
      "acceptedCandidateIds": ["fact-product"],
      "usedDocumentIds": ["fact-product"],
      "finalDocumentIds": ["fact-product"],
      "predictedVerification": "PASS"
    }
  ]
}
```

Artifact 수준의 `datasetVersion`, `corpusVersion`, `model`, `judgeModel`,
`promptVersion`, `retrievalVersion`, `toolsetVersion`, `configVersion`,
`collectedAt`은 선택 사항이다. 제공한 문자열은 비어 있으면 안 되고, 두 fixture
버전은 선택한 데이터셋/코퍼스와 일치해야 한다. 보고서는 선택한 두 버전을
항상 기록하고 제공된 실험 식별 필드를 보존한다. 메타데이터는 자체 보고 값이며
설정의 암호학적 증명이 아니다.

각 결과에는 기존 배열/판정과 유한한 0 이상의 `latencyMs`, `costMicros`가
필수다. 모든 사례 ID가 정확히 한 번 있어야 한다. 알 수 없는 사례, 누락 사례,
중복 사례와 ID 배열 안의 중복 값은 점수화 전에 실패한다.

v2 관측 필드는 선택 사항이다.

- `usedRoles`: 실제 사용한 FACT, STYLE_POLICY, STYLE_EXAMPLE, IGNORE 역할
- `acceptedCandidateIds`: 실제 승인한 후보 ID (`user-fact`는 코퍼스 밖에서 허용)
- `usedDocumentIds`: 작성 또는 추론에 실제 사용한 문서 ID
- `finalDocumentIds`: 최종 증거로 선택한 문서 ID
- `predictedVerification`: 실제 PASS, WARN, BLOCK 판정

필드를 생략하면 해당 사례는 그 지표에서 미측정이다. 명시적인 빈 배열은
측정했지만 관측값이 비어 있는 결과이므로 기대 집합과 비교해 성공 또는 실패로
점수화한다.

## 지표 의미

v1 보고서는 기존 아홉 지표 이름과 값을 유지한다. Citation precision은
`supportedCitationCount / citationCount`, grounded-claim rate는
`groundedClaimCount / claimCount`이며 보고서에 네 개의 분자/분모 수도 함께
기록한다. 분모가 0이면 비율은 숫자 `0`이 아니라 `null`이다.

v2 보고서는 다음 여섯 요약을 `v2Metrics`에 추가한다.

- `roleIsolation`: 실제 역할 집합과 기대 역할 집합의 일치
- `candidateAcceptance`: 실제 승인 후보와 기대 후보 집합의 일치
- `excludedSourceAvoidance`: 사용 문서가 제외 문서와 겹치지 않음
- `finalDocumentSelection`: 실제 최종 문서와 기대 최종 문서 집합의 일치
- `finalEvidenceEligibility`: 모든 최종 문서가 검색되었고 FACT 역할임
- `verificationSeverityAccuracy`: 실제와 기대 PASS/WARN/BLOCK의 일치

각 요약은 `eligibleCaseCount`, `measuredCaseCount`, `passedCaseCount`,
`coverage`, `score`를 가진다. Coverage는 `measured / eligible`, score는
`passed / measured`다. 측정 사례가 없으면 score는 `null`이다. 측정된 사례만의
높은 score가 전체 품질을 뜻하지 않으므로 coverage와 반드시 함께 비교한다.

이 harness는 통제된 논리 ID benchmark의 계약 위반을 구분할 뿐이다. 프로덕션
트래픽, 모델 judge 신뢰도, 검색 튜닝, 실시간 Agent 품질을 측정하지 않으며,
Agent 품질이 개선되었다는 주장을 성립시키지 않는다. 실제 실험은 같은 fixture
버전으로 별도 측정하고 기존 baseline을 덮어쓰지 않는다.

## 통제된 개선 사이클 artifact

`improvement/controlled-replay-v1.json`은 엄격한
`agent-improvement-cycle/v1` 계약의 재현 가능한 데모다. 다음 명령은 v1
cases, corpus, historical result를 다시 검증한 뒤 같은 JSON을 두 칸 들여쓰기와
마지막 줄바꿈으로 생성한다.

```bash
npm run generate:press-rag-improvement
npm run generate:press-rag-improvement -- --output /tmp/controlled-replay.json
```

측정 시점과 replay 시점은 서로 다른 timeline이다. `source.historicalCollectedAt`
`2026-07-23T09:21:12.369Z`는 원래 30-case 실행의 실제 수집 시각이다.
`lifecycle[].occurredAt`과 `generatedAt`은 artifact를 byte-for-byte 재현하기 위한
고정 replay epoch에서 나온 시각이며 새 모델 실행이나 프로덕션 관측 시각이 아니다.

Historical result에서 citation precision은 `31/78`, grounded-claim rate는
`20/41`, 비용은 `36,079 μUSD`였다. Observe/triage 단계는 실패 case와 metric의
조합마다 signal을 하나 만든다. 따라서 unsupported citation 사례 12개와
ungrounded claim 사례 15개에서 27개 signal이 생기며, 두 실패 유형이 겹치는
case를 합쳐 19개 regression candidate를 만든다. 각 signal은 원본 case ID,
실패한 0-based item index, citation document ID, metric 분자/분모와 result 경로를
보존한다.

Candidate experiment는 검색이나 생성을 다시 실행하지 않는다. 원래 case 결과를
복제하고 unsupported citation과 ungrounded claim만 제거한다. 그 결과 품질 비율은
`31/31`, `20/20`이지만 citation 47개와 claim 21개를 삭제해 retention은 각각
`31/78`, `20/41`에 불과하다. Historical 비용 값은 비교 모양을 유지하기 위해
candidate에도 그대로 놓지만 `reused_baseline` 증거다. 새 candidate 비용 측정이
아니므로 비용 gate를 통과시킬 수 없다.

`controlled-replay-demo-policy/v1`은 production policy가 아닌 버전 고정 데모
정책이다. 품질 delta 최소값은 `0`, citation/claim retention 최소값은 각각
`0.8`, 독립 측정된 비용 증가 상한은 `0.1`이다. 현재 artifact는 두 품질 check가
PASS, 두 retention check가 FAIL, cost check가 NOT_EVALUABLE이므로 automated
disposition은 REVIEW_REQUIRED다. Human review는 PENDING이며 reviewer, decision,
decision timestamp, notes가 모두 null이고 `deploymentAuthorized`는 항상 false다.
승인은 이 계약 안에서도 metadata일 뿐 배포 동작을 실행하지 않는다.

향후 live producer는 replay-derived candidate observation을 실제 candidate
configuration의 독립 실행 결과로 교체하고 latency/cost도 다시 측정해야 한다.
또한 production traffic과 judge 신뢰도를 검증해 새 policy version의 retention과
cost threshold를 보정해야 한다. 이 artifact는 prompt, model, retrieval, database,
runtime run, deployment system을 읽거나 변경하지 않는다.

## v3 deterministic experiment

`v3/cases.json` covers retrieval, tool choice, malformed arguments, conflicts,
unanswerable requests, retries, timeouts, approval, cancellation, budgets,
tenant isolation, terminal verification, and prompt injection. Run it without
credentials:

```bash
npm run experiment:press-rag -- --executor deterministic \
  --baseline evals/press-rag/configurations/baseline-v1.json \
  --candidate evals/press-rag/configurations/candidate-v2.json \
  --dataset evals/press-rag/v3/cases.json \
  --output /tmp/press-rag-experiment.json
```

The output path is append-only: an existing different artifact is rejected.
`improvement/manifest.json` pins the controlled replay and two chronological
deterministic cycle records. `npm run verify:press-rag-artifacts` fails on drift.
Cycle 001 demonstrates why deleting useful output is rejected; cycle 002 records
a controlled synthetic quality candidate. Neither artifact authorizes deployment.
