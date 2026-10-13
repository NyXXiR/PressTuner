# 평가 → 개선 → 회귀 실행 안내

저장소 root에서 실행한다. JSON 출력은 새 경로만 허용한다. 이미 있는 결과를 덮어쓰지 않는다. 원본과 사람 라벨은 보존한다. `.env`를 출력하거나 결과에 포함하지 않는다.

## 준비와 무료 검사

```powershell
python -m venv .venv-press-eval
.venv-press-eval/Scripts/python.exe -m pip install -r scripts/press-workflow/ragas/requirements-lock.txt
python -m venv .venv-press-deepeval
.venv-press-deepeval/Scripts/python.exe -m pip install -r scripts/press-workflow/deepeval/requirements-lock.txt
npm run test:press-system
npm run test:press-quality
npm run test:press-evaluation
npm run test:press-workflow
npm run test:press-standard
npm run test:press-study
npm run test:press-study-ui
npm run typecheck:press-workflow
npm run typecheck:press-standard
npx playwright install chromium
npm run test:press-quality-browser
npm run test:press-study-browser
npm run test:press-edit-ui
.venv-press-eval/Scripts/python.exe -m unittest discover -s scripts/press-workflow/ragas -p 'test_*.py'
.venv-press-deepeval/Scripts/python.exe -m unittest discover -s scripts/press-workflow/deepeval -p 'test_*.py'
```

두 Python 환경은 Ragas의 기존 OpenAI 1.x 의존성과 DeepEval의 새 의존성을 분리한다. 위 SDK 검사는 오프라인 transport를 사용한다. Linux에서는 Scripts 대신 bin을 사용한다. 브라우저 검사는 격리된 합성 시나리오이며 실제 사람 판정이나 모델 품질 증거가 아니다. 운영 DB·Python 배포 준비와 검증의 한계는 [커밋 전 정리](RELEASE_READINESS.md)를 따른다.

## 같은 초안에서 평가기 비교

기존 `dual-pilot-generation-20261006.json`처럼 저장한 generation artifact가 입력이다. 다음 명령은 실제 모델을 호출하므로 환경에 키를 설정해야 한다. 로컬 `.env`를 읽으려면 node 앞부분에 `--import dotenv/config`를 추가한다. 최대 provider 호출은 초안당 Ragas 4 + G-Eval 10이며 재시도는 끈다. 정상 G-Eval은 고정 steps로 5개 criterion 호출이다.

```powershell
npm run eval:press-dual -- evaluate --input GENERATION.json --out GEVAL.json --mode live --allow-model-spend --judge deepeval --python .venv-press-eval/Scripts/python.exe --deepeval-python .venv-press-deepeval/Scripts/python.exe
npm run quality:press -- compare-judges --input OLD_EVALUATION.json --review HUMAN.json --against GEVAL.json --out JUDGE_COMPARISON.json
npm run quality:press -- rebind-review --input OLD_EVALUATION.json --review HUMAN.json --against GEVAL.json --out GEVAL_HUMAN.json
```

`rebind-review`는 source generation hash가 같은 경우만 허용한다. 새 artifact hash를 연결하는 명시적 작업이며 사람의 판단 내용/정체성은 변경하지 않는다.

## 실패 분류와 개선 실험

```powershell
npm run quality:press -- analyse --input GEVAL.json --review GEVAL_HUMAN.json --out ANALYSIS.json
npm run quality:press -- plan --input GEVAL.json --review GEVAL_HUMAN.json --out IMPROVEMENT.json
npm run quality:press -- freeze --input GEVAL.json --review GEVAL_HUMAN.json --out RECIPE.json
npm run eval:press-dual -- generate --recipe RECIPE.json --judge deepeval --partition holdout --limit 2 --mode live --allow-model-spend --out HOLDOUT_GENERATION.json
npm run eval:press-dual -- evaluate --input HOLDOUT_GENERATION.json --judge deepeval --mode live --allow-model-spend --python .venv-press-eval/Scripts/python.exe --deepeval-python .venv-press-deepeval/Scripts/python.exe --out HOLDOUT_EVALUATION.json
npm run quality:press -- compare --input HOLDOUT_EVALUATION.json --out COMPARISON.json
```

두 원문 실행은 배선/소규모 실측이며 통계적 개선 입증이 아니다. holdout 결과를 보고 이 recipe를 튜닝한 뒤 같은 holdout을 독립 검증이라고 다시 부르지 않는다. 구현/모델/기준이 바뀌면 recipe mismatch로 중단하므로 새 실험으로 기록한다. generation 실패도 attempts에 남는다.

평가 시 generation에 포함된 recipe를 그대로 사용한다. `--recipe`로 다른 설정을 대입하거나 과거 생성에 사후 부착하면 거절된다. dependency lock 변경도 구현 hash에 반영한다. `--mode mock`으로 생성·평가하면 오프라인 왕복을 확인할 수 있지만 SYNTHETIC/MOCK 표시가 유지되므로 효과 입증이 되지 않는다.

독립 judge audit를 준비한 경우 `compare --audit AUDIT.json`을 추가할 수 있다. 이 파일은 `press-independent-audit/v1`, purpose `INDEPENDENT_JUDGE_AUDIT`, sampling `PRESELECTED_BEFORE_JUDGMENTS`, `batch`, `review`로 구성한다. 선정과 사람 검토를 실제로 수행한 증거만 넣는다. 그룹 누출과 evaluator 불일치는 거절한다.

## 필요한 선택만 받기

```powershell
npm run review:press-quality -- --input HOLDOUT_EVALUATION.json --dir evals/press-workflow/runs/my-session --port 8766 --budget 2 --questions 3
```

- `/`: 기본 3개 질문, 자동 답/설정명 숨김, 선택 저장.
- `/decisions`: 상황별 다음 행동, 문제 근거, 표준/업무 평가 상세.
- `/experiment`: 비교와 기존 유지/후보 추가 검증/보류 선택. 운영 설정을 변경하지 않는다.
- `/report`: 원문 그룹 통계와 한계.

새로고침과 재시작은 같은 `--dir`에서 복구한다. 서버를 종료한 뒤 마지막 `revision-*.json`의 `session.packet`을 후속 분석의 review로 사용할 수 있다. 사람은 JSON 파일을 직접 다운로드할 필요가 없다. 리뷰 예산은 새 session 생성 시 적용한다. 같은 session 재시작으로 검토 대상이 조용히 바뀌지 않는다.

## 회귀로 남기기

```powershell
npm run quality:press -- promote --input GEVAL.json --review GEVAL_HUMAN.json --out REGRESSION.json
npm run quality:press -- regression --input NEW_EVALUATION.json --manifest REGRESSION.json --out REGRESSION_RESULT.json
```

exit 0은 명시된 기준에서 관측 PASS, 1은 위반, 2는 불완전한 coverage/유효하지 않은 입력이다. 판정 불가를 녹색으로 처리하지 않는다. mock/authored 결과에는 별도 evidence 표지가 붙는다. 발전시킨 생성 설정은 DEVELOPMENT 파티션의 같은 회귀 입력에서도 다시 실행해야 한다. 새로운 holdout만 실행하면 기존 회귀 입력이 없어 exit 2가 맞다.

`.github/workflows/press-quality.yml`은 PR/push에서 무료 계약/회귀/브라우저 검사를 실행한다. workflow_dispatch에서 run_model_regression을 명시 선택하면 저장한 C01 회귀 조건에 대해 생성·평가·gate를 수행한다. GitHub의 OPENAI_API_KEY secret 설정이 필요하다. 현재 후보의 알려진 결함 때문에 모델 회귀 job이 실패할 수 있다. 실제 GitHub 실행/secret 설정은 이번 로컬 작업에서 수행하지 않았다.
