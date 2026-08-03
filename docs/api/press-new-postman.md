# `/press/new` API를 Postman에서 확인하는 방법

이 컬렉션은 로컬 개발 서버의 보도자료 흐름을 로그인부터 `FINAL`까지
순서대로 실행한다. 각 요청의 `Body`, 실제 응답, 테스트 통과 여부를
Postman에서 직접 확인할 수 있다.

## 1. 로컬 QA 로그인 준비

QA 인증은 개발 환경에서만 잠깐 활성화한다. 테스트에 사용할 활성 사용자와
그 사용자가 속한 활성 팀 slug를 지정한다.

```powershell
cd D:\workspace\PressTuner
npm run qa-auth:configure -- --login-id <로그인ID> --team-slug <팀SLUG> --allowed-host localhost:3003
npm run dev
```

서버가 이미 실행 중이었다면 `.env` 변경을 읽도록 종료 후 다시 실행한다.
설정 전 `.env`를 백업하고, QA가 끝나면 백업본을 복구한 뒤 서버를 다시
시작한다. `AI_QA_AUTH_*` 설정을 운영 환경에 배포하면 안 된다.

## 2. Postman으로 가져오기

Postman의 **Import**에서 아래 두 파일을 선택한다.

- `docs/api/press-new.postman_collection.json`
- `docs/api/press-new.local.postman_environment.json`

오른쪽 위 환경에서 **PressTuner /press/new Local**을 선택한다. 환경 편집
화면의 `qaSecret` **Current value**에 로컬 `.env`의
`AI_QA_AUTH_SECRET` 값을 넣는다. 이 값을 파일로 다시 export하거나
공유하지 않는다.

## 3. 실행 및 응답 확인

컬렉션 메뉴의 **Run collection**을 열고 저장된 순서대로 전체 실행한다.
요청을 개별 확인하려면 1번부터 차례대로 **Send**를 누른다. 2번 로그인
티켓은 일회용이므로 실패했거나 다시 시작할 때는 1번부터 새로 실행한다.

각 요청 화면에서 다음을 확인할 수 있다.

- **Body**: 실제로 보내는 JSON
- **Response Body**: API가 돌려준 전체 JSON
- **Test Results**: HTTP·스키마 계약과 의미 품질 검사
- 컬렉션 변수: `articleId`, 정규화 결과, 첨삭 note ID, 최종 본문

`[품질]` 테스트 실패는 AI 응답 내용이 기대에 못 미쳤다는 뜻이다. 요청
자체의 HTTP/스키마 실패와 구분해서 본다. 예를 들어 `서울에 기반`이
`서울 본사`로 강화되거나 측정 제한사항이 빠지면 해당 품질 검사가 실패한다.

## 요청 순서

1. QA 로그인 티켓 발급
2. QA 로그인 세션 생성
3. 보도자료 문서 초기화
4. 브리프 정규화
5. 초안 생성
6. AI 첨삭
7. 선택 첨삭 재작성
8. 재작성 원고 저장
9. 최신 원고 검증
10. 최종 완료
11. 완성 원고 조회
12. FREE 사용량 조회

여러 번 실행하면 테스트 문서가 추가된다. 필요 없는 QA 문서는 제품의 문서
관리 화면에서 삭제한다.
