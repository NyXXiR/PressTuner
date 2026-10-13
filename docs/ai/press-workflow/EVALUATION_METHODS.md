# 왜 이 평가 방법을 쓰는가

2026-10-12. 구현 범위는 보도자료 초안의 평가·개선 실험이다. 운영 기사 적용과 agent tool runtime은 별도다.

## 개념과 구현의 구분

G-Eval은 LLM을 이용한 평가 방법이다. 이 프로젝트는 DeepEval 4.2.8의 공식 `GEval`을 사용한다. 기존 JSON prompt judge를 G-Eval로 이름만 바꾸지 않았다. Ragas와 DeepEval 모두 여러 평가를 지원하며, 여기서의 역할 구분은 프로젝트의 설계 선택이다.

| 방법 | 원리와 입력 | 선택 이유 | 한계/대안 |
|---|---|---|---|
| Ragas Faithfulness 0.4.3 | 초안의 주장을 추출하고 FACT 근거가 뒷받침하는 비율 계산 | 근거 일치를 표준 지표 관점으로 비교 | 누락·문체·외부 진실성은 측정하지 않음. claim별 코드 검사는 구조화 수치에 유용; NLI 방식은 별도 한국어 적합성 검증 필요 |
| DeepEval G-Eval 4.2.8 | 고정 evaluation_steps와 0~10 rubric으로 업무별 score/reason 산출, 0~1 정규화 | 사실/누락/혼입/과장/문체를 분리하고 기준·실행을 재사용 | judge 오류·비용·확률성이 남음. 자체 judge, DAG 방식, 사람 pairwise 비교가 대안 |
| 기존 JSON judge | 한 호출에서 5개 기준과 정확한 인용을 구조화 | 비용/호출 수와 evidence 계약의 기준선 | 한 항목의 잘못된 JSON/인용이 전체 결과를 무효화할 수 있음. 비교 대상으로 유지 |
| 코드 guardrail | JSON 구조, 허용 fact ID, 지정 문구 검사 | 싸고 재현 가능한 형식/식별자 검사 | 바꿔 쓴 의미와 근거성 판단을 대신하지 못함 |

Ragas는 STYLE_EXAMPLE을 factual context에 넣지 않는다. G-Eval은 accepted facts와 styleExamples의 역할을 기준에 명시한다. role 분리만으로 judge가 항상 이를 지킨다고 가정하지 않는다.

## G-Eval의 구체적인 선택

`scripts/press-workflow/deepeval/rubric.json`에 기준·steps·rubric·threshold를 고정했다. 이 파일의 canonical hash, 라이브러리 버전, judge model은 각 평가에 남는다. 고정 steps는 실행마다 평가 기준을 새로 생성하는 변동을 줄이지만 모델 결과의 결정성을 보장하지 않는다.

live 어댑터는 DeepEval의 native OpenAIModel 경로를 사용하여 지원 모델의 score-token log probabilities를 활용하는 기본 G-Eval 계산을 유지한다. 모델을 감싼 부분은 호출 상한·timeout·사용량 측정이다. 단순 custom model fallback으로 weighted scoring을 조용히 제거하지 않았다. offline SDK 테스트의 fake model은 배선 검사일 뿐 이 효과의 검증이 아니다.

기준별 한 metric을 실행한다. 한 기준의 provider 오류는 그 기준의 UNCERTAIN/errorCode로 남기고 다른 결과를 보존한다. score가 있으면 0.8 이상을 실험용 PASS로 해석한다. **0.8은 보정된 업무 승인 임계값이 아니다.** 파일에도 UNCALIBRATED_EXPERIMENTAL로 명시했다.

DeepEval reason은 사람이 읽을 관측 설명이다. 구조화된 정확한 quote 계약이 아니므로 reason에서 문자열을 임의 추출해 사실 인용으로 가장하지 않는다. 근거/초안 전체를 함께 열 수 있다. 기존 judge의 정확한 인용이 검증된 경우만 인용 카드로 표시한다.

같은 초안에 대해 모델/threshold/steps가 달라지면 다른 평가기로 취급한다. framework/rubric 정보가 없는 과거 artifact는 기존 custom judge다. Console v1의 제한된 요약은 유지하며 G-Eval 세부 식별과 raw scores는 프로젝트 화면/artifact에 있다. 새 UNCERTAIN_JUDGMENT는 Console v1에 MISSING_REVIEW로 보수적으로 투영하고 checks의 UNCERTAIN을 유지한다.

## 대안 비교에서 실제로 확인한 것

구현 비교: 기존 custom judge와 G-Eval을 **동일한 저장 초안 2개**에 적용하고 기존 사람 라벨 10개를 재사용했다. Ragas도 공식 구현으로 재실행했다. 새 생성 결과에 과거 사람 라벨을 복사하지 않았다.

| 관측 | 과거 custom judge | 이번 G-Eval |
|---|---:|---:|
| 사람과 비교 가능한 기준 | 5/10 | 10/10 |
| 비교 가능한 기준 중 일치 | 3/5 | 8/10 |
| 사람이 지적한 결함 탐지 | 0/3 | 1/3 |
| 비교 가능한 정상 기준의 오탐 | 0/3 | 0/7 |

이 결과는 원문 1개의 calibration 표본이다. 일부 비교 가능 분모가 다르므로 일치율만으로 우수성을 주장하지 않는다. G-Eval의 판정 가능 범위는 늘었으나 알려진 결함 둘을 여전히 놓쳤다. independent audit나 전체 고객 정확도의 증거는 아니다. 같은 조건의 현재 custom judge를 재실행한 실험이 아니므로 시간에 따른 모델 변화도 통제하지 못했다.

이번 G-Eval 사용량은 입력 9,809 / 출력 844 tokens다. 비용은 가격표를 붙이지 않아 미산정이다. 고정한 동일 텍스트의 Ragas 점수도 이전 0.2143/0.2353에서 이번 0.1429/0.2941로 달라졌다. 이것은 생성 품질 변화가 아니라 재평가 변동의 관측이다. seed나 temperature=0을 재현성 보증이라고 설명하지 않는다.

문헌/설계 대안만 검토한 것: DeepEval DAG, pairwise judge, 별도 NLI 모델. 이들의 우열을 실측했다고 주장하지 않는다. 코드 guardrail은 기존 회귀 테스트로 유지하지만 의미 판정 정확도의 동일 범위 경쟁 지표로 비교하지 않는다.

## 실패 분류에서 개선으로

사람 판정이 있으면 해당 사례의 판단을 우선하고 자동 판정과의 차이는 evaluator 진단에 남긴다. 생성 실패, 평가 실행 실패, 판단 어려움, 내용 위반을 구분한다. 개선안은 criterion에 연결된 생성 지침 후보이며, 제안만 만들었을 때 효과는 NOT_MEASURED다.

recipe는 source artifact, dataset, generator/judge, 구현 hash, instructions와 개발 group을 고정한다. 사람 검토가 전부 끝나거나 모든 judge가 동의해야만 freeze할 수 있는 기존 v1 절차와 별개다. freeze는 신뢰도 인증이 아니다.

같은 holdout 입력으로 baseline과 candidate를 production generator에서 각각 호출한다. 반복을 source group 안에서 묶고, 누락/실행 실패는 coverage에 남긴다. 통계 구간은 기존 탐색적 grouped bootstrap을 재사용한다. 최소 원문 수와 비퇴화 조건을 만족하지 못하면 효과 판단을 보류한다. 다른 기준의 악화를 함께 확인한다.

독립 judge audit는 보정 그룹과 실험 그룹 모두와 겹치지 않아야 한다. `press-judge-audit/v1`은 최소 10 source groups, 기준별 양·음성 최소 3 groups, 충분한 비교 수/coverage, 탐지율/오탐 screen을 요구한다. 이는 버전 고정한 실험 정책이며 통계적 정확도 보증이 아니다. 임의 위험 표본을 독립 무작위 감사로 바꾸지 않는다. 현재 실제 독립 audit는 없다.

## adaptive UX와 효과 측정

- 업무 상태에 따라 수정 확인, 판정 보완, 문체 선택, 검사 결과 확인을 보여준다. framework 점수는 상세 영역에 있다.
- 질문 수 기본값은 두 초안의 모든 기준 10개에서 **최대 3개**로 바뀌었다. 첫 질문은 무작위 점검, 나머지는 위험 우선이다. 두 표본의 선택 방식을 저장한다.
- 기준에 따라 필수 사실 또는 문체 요구를 먼저 보여준다. 누락/사실성을 판단할 때 필요한 전체 초안은 보존한다. 자동 판단을 보지 않은 검토와 분석을 본 뒤의 판단을 혼동하지 않는다.
- 한 번에 질문 하나, 선택 즉시 durable revision 저장, 다음 질문 이동, 이전 선택 변경, 건너뛰기/판단 어려움 구별, 새로고침 복구.
- 최종 설정 결정은 기존 유지/후보로 추가 검증/보류다. local 실험 결정 기록이며 production 적용이 아니다.
- 실제 이벤트의 선택 횟수와 displayedMs를 남긴다. displayedMs는 읽기 시간/노동 시간의 정확한 측정이 아니며 자동 QA 기록으로 사람의 시간 절감을 주장하지 않는다.

브라우저 QA로 구조·저장·복구를 확인했으며 새 UX의 실제 사람 의사결정 시간, 만족도, 오류 누락률 비교는 미측정이다.

## 검색·Agent 평가의 경계

Contextual Precision/Recall은 실제 ranked retrieval와 reference 근거를 필요로 한다. 초안에 공급한 accepted facts로 검색 성능을 주장하지 않는다. ToolCorrectness/TaskCompletion은 실제 tool trace와 명시적 task outcome에 연결해야 한다. Press Agent의 기존 검색/단계/승인 기록을 재사용하는 후속 G 단계이며 이번 초안 어댑터에 이 지표를 실행한 척 추가하지 않았다.

## 공식 참고

- [Ragas Faithfulness](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/)
- [DeepEval G-Eval](https://deepeval.com/docs/metrics-llm-evals)
- [DeepEval evaluation](https://deepeval.com/docs/evaluation-introduction)
- [Tool Correctness](https://deepeval.com/docs/metrics-tool-correctness)
- [Task Completion](https://deepeval.com/docs/metrics-task-completion)
