# 두 평가 실행 안내

같은 저장된 초안을 공식 **Ragas Faithfulness**와 **PressTuner 요구사항 평가**에 입력한다. Ragas는 작성된 주장의 근거 충실도를, 요구사항 평가는 필수 사실 누락·예시 오염·과장·문체까지 확인한다. 두 결과를 합산하지 않는다.

## 준비

저장소 루트에서 Node 20.19 이상과 Python 3.11을 사용한다.

```powershell
python -m venv .venv-press-eval
.venv-press-eval\Scripts\python -m pip install -r scripts/press-workflow/ragas/requirements.txt
$env:PRESS_EVAL_PYTHON = "$PWD\.venv-press-eval\Scripts\python.exe"
npm run test:press-evaluation
npm run typecheck:press-workflow
```

키는 `OPENAI_API_KEY`로 공급한다. 아래 `node --env-file=.env`는 로컬의 기존 키 파일을 읽는 선택적 예시다. 실측에는 `--mode live --allow-model-spend`가 모두 필요하다. 출력 파일은 덮어쓰지 않으므로 매번 새 이름을 지정한다.

## 합성 동작 확인

```powershell
npm run eval:press-dual -- challenges --limit 2 --challenge OMISSION --out evals/press-workflow/runs/challenges-01.json
npm run eval:press-dual -- evaluate --input evals/press-workflow/runs/challenges-01.json --out evals/press-workflow/runs/mock-eval-01.json
npm run eval:press-dual -- report-html --input evals/press-workflow/runs/mock-eval-01.json --out evals/press-workflow/runs/mock-report-01.html
```

이 결과는 합성 배선 검증이다. 정상/누락 초안과 기대값은 AI가 작성했다. 실제 평가기의 정확도나 생성기 품질 측정값이 아니다. 같은 작성 사례를 live judge로 평가하더라도 초안 출처는 AUTHORED로 유지한다.

## 실제 생성과 평가

```powershell
node --env-file=.env --import tsx scripts/press-workflow/dual-eval.ts generate --mode live --allow-model-spend --limit 2 --repeats 1 --out evals/press-workflow/runs/generated-01.json
node --env-file=.env --import tsx scripts/press-workflow/dual-eval.ts evaluate --mode live --allow-model-spend --input evals/press-workflow/runs/generated-01.json --out evals/press-workflow/runs/evaluated-01.json
```

기본/변경 설정에서 바꾸는 조건은 작성 지침 한 가지다. 같은 모델과 입력을 사용한다. 2개 그룹 × 1회 반복은 생성 4회이며, 초안 하나의 평가는 Ragas 최대 4회와 요구사항 judge 1회를 허용한다. 직렬 실행, 타임아웃, 토큰 상한을 적용한다. 실패를 삭제하거나 PASS로 대체하지 않는다. 30개 합성 출시 그룹은 개발용 20개, 홀드아웃 10개로 나뉜다. 유사 템플릿이므로 실제 서비스 전체의 대표 표본은 아니다.

## 사람 검토

```powershell
npm run eval:press-dual -- review-html --input evals/press-workflow/runs/evaluated-01.json --out evals/press-workflow/runs/review-01.html
```

HTML을 브라우저에서 연다. 요청·근거와 초안을 비교해 각 항목의 PASS/FAIL/UNCERTAIN 및 이유를 입력한다. 이름과 직접 검토 확인을 입력한 뒤 **검토 JSON 저장**을 누르면 `human-review.json`이 다운로드된다. 저장 전에 닫거나 새로고침하면 입력을 잃을 수 있다. 자동 결과와 생성 변형 이름은 검토 화면에서 숨긴다.

```powershell
npm run eval:press-dual -- report --input evals/press-workflow/runs/evaluated-01.json --review C:\Users\YOUR_NAME\Downloads\human-review.json --out evals/press-workflow/runs/reviewed-report-01.json
npm run eval:press-dual -- report-html --input evals/press-workflow/runs/evaluated-01.json --review C:\Users\YOUR_NAME\Downloads\human-review.json --out evals/press-workflow/runs/reviewed-report-01.html
```

검토 데이터셋·실행·초안 해시가 맞아야 한다. 중복 초안과 AI 검토자 표시는 거부한다. 부분 검토는 PARTIAL이다. 일치율, 결함 재현율, 오탐률과 분모를 JSON 보고서에 남긴다. 실패하거나 기권한 judge도 사람에게 확인된 결함의 재현율 분모에 포함한다. 오탐률의 분모는 자동 판정이 가능한 사람 정상 항목이며, 결함 재현율과 달리 기권을 정상 판정으로 세지 않는다. 분모가 없으면 null이다. Ragas 1.0 여부와 사람의 사실 근거 라벨 비교는 엄격한 진단 지표이며 보편적 품질 임계값이 아니다.

## 개발 검토 후 설정 고정과 홀드아웃

```powershell
npm run eval:press-dual -- freeze-policy --input evals/press-workflow/runs/evaluated-01.json --review C:\Users\YOUR_NAME\Downloads\human-review.json --out evals/press-workflow/runs/policy-freeze-01.json
node --env-file=.env --import tsx scripts/press-workflow/dual-eval.ts generate --mode live --allow-model-spend --partition holdout --limit 10 --repeats 3 --policy evals/press-workflow/runs/policy-freeze-01.json --out evals/press-workflow/runs/holdout-generated-01.json
node --env-file=.env --import tsx scripts/press-workflow/dual-eval.ts evaluate --mode live --allow-model-spend --input evals/press-workflow/runs/holdout-generated-01.json --out evals/press-workflow/runs/holdout-evaluated-01.json
```

위 확장 예시는 초안 60개를 생성한다. 작은 개발 파일럿의 불일치·실패와 예상 비용을 먼저 검토한다. 사람 판정과 불일치하거나 자동 평가가 실패·기권한 항목이 남으면 설정 고정을 거부한다. 고정 이후 코드·모델·프롬프트·데이터가 달라지면 홀드아웃 실행을 거부한다. 확인한 홀드아웃으로 지침을 수정했다면 새 홀드아웃 데이터 버전이 필요하다. 설정 고정만으로 judge의 정확도를 인증하지 않는다.

## Console에 연결

```powershell
npm run eval:press-dual -- export-summary --input evals/press-workflow/runs/evaluated-01.json --review C:\Users\YOUR_NAME\Downloads\human-review.json --out evals/press-workflow/runs/console-summary-01.json
```

Console 서버의 `AIPC_EVALUATION_REPORT_PATH`를 위 **summary** 파일의 절대 경로로 설정한다. 등록된 `presstuner` 프로젝트의 `/test-lab` 일반 화면에서 읽는다. 선택 프로젝트가 다르면 사용하지 않는다. 특정 실행으로 직접 진입한 화면에는 별도 실험을 섞지 않는다. `/demo`는 별도로 표시한 고정 합성 예시만 보여준다.

Console은 스키마·크기·프로젝트를 검사한 숫자와 열거값 요약만 읽는다. 원문·근거 인용·판정 이유·검토자 ID·모델 요청은 프로젝트 로컬 보고서에 남는다. 실험 실행이나 생산 반영 기능을 Console에 추가하지 않는다.

## 해석의 한계

합성 입력의 실제 모델 호출은 실제 고객 데이터 검증과 다르다. 사람 검토 두 초안이나 기본/변경 한 쌍으로 신뢰도·품질 개선을 확정하지 않는다. 비용은 가격표가 없어 미산정이며 사용량 누락은 0이 아니다. 어떤 보고서도 자동 배포를 승인하지 않는다.
