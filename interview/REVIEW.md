# PressTuner 기록 검토 · 2026-10-03

이번 자료는 기존 코드를 분석한 v4 코드 분석 자료 2건입니다. 제품 구현·배포 이력이나 사용자 개인 기여를 새로 주장하지 않습니다.
작성일과 과거 구현일을 구분해 worked_on은 null로 두었습니다. 근거·검사·한계와 질문별 답변 가이드를 기록에 넣었습니다.

분석 코드: `b40370eb4fcf2cc3557241357bdf0410dc0bae70`. 운영 실행 버전과 같다는 뜻은 아닙니다.

| 기록 | 상태 | UUID |
|---|---|---|
| [요청별 문체 변경을 기본 설정과 구분해 재현하기](records/f1f0506d-bc21-4848-845b-39cd822d3502.json) | published | `f1f0506d-bc21-4848-845b-39cd822d3502` |
| [초안 생성 성공과 사실 검증 통과를 따로 표시하기](records/bfde2a70-1c6c-4528-be99-26839e56ca1c.json) | published | `bfde2a70-1c6c-4528-be99-26839e56ca1c` |

로컬 기본 checkout과 분석한 코드가 다릅니다. 특히 선택한 workflow/adapter 파일 일부는 기본 checkout에 없습니다. 이 분석의 테스트를 현재 운영 서비스 검증으로 인용하지 마세요. 상세 대조와 커밋은 각 기록의 scope/evidence에 있습니다.

검토할 내용: 설명과 코드 근거의 일치, 과거 구현에서 본인이 맡은 부분, 공개해도 되는 내용, 미실행·미해결 한계입니다. 질문 guide는 사용자의 실제 답변이 아닙니다.

기존 기록의 보완은 같은 UUID 파일을 수정합니다. 관련 있지만 다른 사례인지 확인하고 발급한 ID를 유지하세요.

2026-10-03 사용자의 게시 요청에 따라 내용·근거·기여 범위를 최종 점검하고 published로 전환했습니다. 코드 분석 자료의 게시이며, 개인의 과거 구현 기여나 이해도를 확인했다는 뜻은 아닙니다. 등록된 interview-records 브랜치의 일반 push 후 Interview Lab이 수집합니다.

```bash
/home/nyxxir/interview-lab/.venv/bin/python /home/nyxxir/interview-lab/archive_cli.py --repo /home/nyxxir/.local/share/interview-lab/authoring/presstuner validate
```

2026-10-03 질문 보완: 질문 ID를 유지하고 답변을 주장 → 근거 → 사례로 나눴습니다. 중복 질문은 꼬리질문, 폰트 사례는 보조로 표시했습니다. 평가 실험·동시성 해결책은 현재 구현과 구분한 제안이며 실행 증거를 새로 주장하지 않습니다.

`publish <UUID> --reviewed`는 작성자의 내용 검토 뒤 실행합니다. Git 게시 브랜치는 `interview-records`이며 앱 main/master 변경은 필요하지 않습니다.

공통 읽기 화면과 검증 로그: `/home/nyxxir/.local/state/interview-lab/reviews/20261003-project-analysis/`.
기존 UUID·질문 ID·source ID를 유지합니다. 기존 개인 메모·답변·과거 revision은 보존하며, 첫 게시로 이 기록의 학습 entry와 revision이 추가됩니다.
