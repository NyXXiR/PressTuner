# 품질 분석과 선택형 검토

## 제품 흐름

저장된 실제/모의 평가 → 오류 유형·평가기 상태·변경 차이 분석 → 관측 근거가 있는 개선 제안 → 필요한 사례만 선택형 사람 검토 → 선택 즉시 저장하고 보고서/Console 요약 갱신.

사람 검토 없이도 분석과 제안을 생성한다. 사람의 선택은 표본의 판정 확인에 사용한다. 자동 판정이나 QA 테스트 선택을 실제 사람 라벨로 대체하지 않는다. 기존 v1 사람 검토 JSON을 가져오면 완료 항목을 다시 묻지 않는다.

## 실행

저장된 평가 artifact를 사용한다. 다음 명령은 추가 모델 호출을 하지 않는다.

```powershell
npm run review:press-quality -- --input evals/press-workflow/runs/dual-pilot-evaluation-20261006.json --review <기존-human-review.json> --dir evals/press-workflow/runs/quality-review-pilot --port 8765
```

새 검토에는 `--review`를 생략한다. `--budget 2`가 기본이며 1~20개 초안 중 선택한다. 첫 사례는 무작위 점검, 나머지는 판단 불가·평가 불일치·위반 우선이다. 생성된 무작위 seed와 선택 방식이 세션에 남는다. 기본/변경 설정 이름과 자동 답은 검토 화면에서 숨긴다. 이름 입력, 필수 이유 작성, JSON 다운로드는 요구하지 않는다. 직접 확인한 항목에 충족/위반/판단 어려움을 선택하며 건너뛰기는 미검토로 남긴다.

- 검토: `http://127.0.0.1:8765/`
- 분석: `http://127.0.0.1:8765/report`
- Console 설정: 서버 환경의 `AIPC_EVALUATION_REPORT_PATH`에 세션 폴더의 `console-summary.json`을 지정한다. Console에서 같은 프로젝트를 선택하고 새로고침하면 갱신된 요약을 읽는다. 고정 `/demo`는 계속 합성 fixture만 사용한다.
- `revision-NNNNNN.json`은 선택 이력, 검토 packet, 보고서, 안전한 요약을 하나의 불변 기록으로 저장한다. 파일 flush 후 같은 볼륨의 hard link로 배타적으로 확정한다. 해당 세션 폴더는 hard link를 지원하는 로컬 파일시스템에서 사용한다.
- 재시작은 같은 `--dir`을 사용한다. 마지막 확정 revision을 복구하고 Console 요약을 재생성한다. 다른 artifact를 같은 세션에 넣을 수 없다. 실행 중 서버를 두 개 띄울 수 없으며 종료된 PID의 잠금만 복구한다.
- 저장 실패 시 기존 선택을 유지하고 재선택을 안내한다. 오래된 화면의 수정은 409로 거절한다. 원래 검토 JSON은 수정하지 않는다.
- 이 서버는 loopback 전용 로컬 단일 사용자 데모다. 원문이 포함된 세션을 공개 웹 서버로 제공하는 기능은 없다. Console에는 원문·인용·검토자·서술 이유가 들어가지 않는다.

정적 HTML/JSON 보고서와 Console 요약을 생성하는 기존 `report`, `report-html`, `export-summary` 명령도 분석을 자동 포함한다.

## 통계 정의

- 원문 그룹별·설정별·분할별로 판정한다. 같은 원문의 반복 중 한 번이라도 FAIL이면 위반 원문이다. 한 반복이라도 판정 불가 또는 생성 실패면 해당 원문은 조건부 위반율 분모에서 제외하고 unknown으로 표시한다. 모두 실패한 원문도 unknown에 남긴다.
- Wilson 95% 구간은 원문 그룹의 자동 위반 flag에 적용한다. 평가기 정확도 구간이나 전체 고객 품질 구간이 아니다. 서로 비슷한 합성 템플릿의 결과를 대표 모집단으로 일반화하지 않는다. 반복 횟수가 다르면 위반 flag 확률도 달라질 수 있다.
- Ragas 차이는 같은 입력·모델·평가기·반복의 기본/변경 쌍만 사용한다. 원문 내 반복 차이를 평균낸 뒤 원문 평균 차이를 함께 bootstrap한다. 개발/별도 평가를 섞지 않는다. 완전한 원문 10개 미만 또는 변화가 전부 같은 표본은 구간을 보류한다. 10개는 제품의 보수적 표시 정책이며 통계적 충분성을 보장하는 정리가 아니다. 4,000회 고정 seed percentile 95% 구간은 탐색적 진단이고 채택 판정이 아니다.
- 사람 검토의 일치/결함 탐지는 검토 표본 내 진단이다. 우선 검토와 무작위 점검을 섞어 모집단 정확도 구간을 계산하지 않는다. 미선택/판단 어려움/자동 판정 실패는 정상으로 바꾸지 않는다.
- 원문 수·판정 가능 분모·누락 수가 항상 함께 표시된다. 효과 크기, 신뢰구간, 비용 절감이나 시간 절감은 근거 없이 만들어내지 않는다.

참고: [NIST Wilson interval](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm), [SciPy paired bootstrap](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.bootstrap.html).

## 개선 제안

제안은 버전 관리되는 결정적 규칙으로 만든다. 평가 실패, 사람과의 불일치, 사람 확인 결함, 미확인 자동 결함, 생성 실패, 표본 부족을 구분한다. 각 제안은 관측 수·대상 사례·수정 가설·별도 검증 방법을 포함한다. 자동 지적과 사람 확인을 같은 확실성으로 표시하지 않는다. 사람 PASS/UNCERTAIN이 있으면 자동 FAIL을 사람 확인된 결함으로 확대하지 않는다.

PressTuner가 프로젝트 원문과 실행을 소유한다. Console은 엄격한 숫자/enum 계약을 읽고 번역된 권고를 표시한다. 수정 실행이나 배포 자동 적용은 없다. 현재 기존 freeze/adoption gate는 보수적으로 유지하며 선택형 표본 완료를 전체 신뢰성 인증으로 취급하지 않는다.

## 실제 파일럿에서 말할 수 있는 것

원문 1개 / 초안 2개 / 실제 사람 라벨 10개. 자동 비교 가능 5개 중 3개 일치, 사람이 지적한 결함 3개 중 자동 탐지 0개. 분석은 평가기 보정과 근거 없는 주장 축소 지침을 제안한다. Ragas 평균 차이 약 0.021의 개선 효과 구간은 표본 부족으로 보류한다. 이 구현은 평가기의 정확도 개선이나 상용 검증을 입증하지 않는다. 다음 실증에는 다양한 독립 입력과 보정에 쓰지 않은 사람 검토가 필요하다.

## 검증

`npm run test:press-quality`, `npm run test:press-evaluation`, `npm run test:press-workflow`, `npm run typecheck:press-workflow`. QA 선택은 별도 임시 세션에만 기록하고 실제 파일럿 보고서로 가져오지 않는다.

2026-10-06 검증 결과: quality 10/10, 기존 evaluation 16/16, workflow 13/13, 전용 typecheck 및 변경 범위 lint 통과. 전체 lint는 오류 0 / 기존 경고 76. IAB에서 격리된 합성 QA 선택 저장과 새로고침 복구를 확인했다. 원래 사람 검토는 변경하지 않았다. 앱 전체 빌드는 기존 Windows wrapper의 `spawnSync("npm")` ENOENT로 실패하며, 현재 설치에도 `@daypicker/react`, `@react-pdf/renderer`가 없다. 이번 범위에서 빌드 환경을 별도로 바꾸지 않았다.
