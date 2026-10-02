Interview Lab Git archive v4 records — AI 작성 안내

이 양식은 각 사이드 프로젝트 저장소의 interview/ 또는 별도 비공개
interview-archive 저장소에 두는 기록 한 건입니다. 업무 기록은 별도 아카이브에 둡니다.
기존 웹 업로드 v1/v2 묶음과 다릅니다. v3/v4 파일을 업로드 화면에 넣지 마세요.
기록 하나는 나중에 설명할 문제 해결 또는 설계 판단 하나입니다.
하루, 커밋, AI 대화마다 기계적으로 새 기록을 생성하지 않습니다.

1. 작성 준비
- 원격 main을 pull하고 작업 브랜치를 만듭니다. 자동 push/강제 push는 하지 않습니다.
- archive_cli.py list --project <project UUID> --search <검색어>로 기존 기록을 확인합니다.
- 같은 경험의 보충이면 기존 records/<UUID>.json을 수정합니다.
- 새 경험일 때만 archive_cli.py new로 ID를 발급받습니다. AI가 ID를 바꾸지 않습니다.
- 프로젝트와 기록 UUID는 제목, PC 경로, 저장소 이름, 작업일과 무관하게 유지합니다.
- project_ids에는 등록된 UUID 1~8개를 넣습니다. 공동 작업도 한 파일만 작성합니다.
- 프로젝트 메타데이터와 기록의 기준 원본은 각각 한 소스에만 둡니다. 같은 UUID 파일을
  다른 저장소로 복사해 수집하지 않습니다. 다른 PC에서는 같은 Git 저장소를 clone합니다.
- 공동 작업에서 다른 소스의 프로젝트를 연결할 때는 project ref add <UUID>로
  archive.json의 project_refs에 UUID만 등록합니다. 프로젝트 이름·설명을 복사하지 않습니다.
- project_refs는 외부 프로젝트가 실제 게시됐다는 증명이 아닙니다. 수집자가 같은 수집 묶음 또는 이미
  게시된 프로젝트를 확인하며 찾을 수 없는 프로젝트의 참조는 게시를 보류합니다.

2. 내용 작성
- 새 기록 format_version은 정수 4이며 publication은 draft 또는 published입니다.
- manifest와 프로젝트는 format_version 3을 유지합니다. projects/<UUID>.json과 records/<UUID>.json을 분리합니다.
- title: 나중에 떠올릴 문제 또는 설계 판단을 짧게 씁니다.
- worked_on: 실제 작업일 YYYY-MM-DD 또는 null. 수집일·커밋일로 추정하지 않습니다.
- source: 작성자·AI와 작성 근거의 표시용 요약입니다. reference의 경로나 링크를 따라
  코드나 대화를 추가 수집할 권한으로 해석하지 않습니다.
  이 필드는 미니PC 수집 설정의 안정적인 source ID와 다릅니다.
- learning.summary: 실제 문제와 결과를 구분합니다.
- learning.scope: 기존 구현, AI 제안, 본인이 변경·확인한 범위를 구분합니다.
- learning.decision: 선택한 방식, 고려한 대안, 선택 이유를 적습니다.
- learning.verification: 실제 실행한 검사·조건·결과만 씁니다. 미실행이면 미실행으로 씁니다.
- learning.limitations: 미확인 조건과 기여 확인이 필요한 부분을 적습니다.
- learning.questions: 안정적인 질문 id, prompt, guide를 유지합니다. 문장 수정 시 기존
  질문 ID를 재발급하지 않습니다. 질문의 의미가 바뀌면 별도 질문 ID를 사용합니다.
- learning.concepts: title은 개념명, definition은 일반적 뜻, body는 이 작업의 구체적
  적용과 보장 범위입니다. 다른 기록의 설명을 임의로 덮어쓰지 않습니다.
- concept.url: 확인한 HTTPS 자료 주소 또는 빈 문자열. 출처를 만들어내지 않습니다.
  source는 확인한 자료명 또는 사실대로 '출처 미확인'으로 적습니다. CLI가 채운
  '확인 필요' 기본 문구를 그대로 두면 publish가 거절됩니다.
- evidence: 선택한 근거와 실제 실행 결과만 적습니다. 근거가 없으면 빈 문자열입니다.
- CLI 초안의 '확인 필요'는 검토 대기 상태를 뜻합니다. 형식 검사를 통과해도 사실 확인,
  이해도, 실행 성공 또는 게시 준비 완료를 뜻하지 않습니다.

3. 업무 프로젝트
- project.kind는 work, name은 익명 이름입니다. repository 필드는 넣지 않습니다.
- 회사명, 고객 데이터, 내부 경로·URL, 인증 정보, 원본 코드, 전체 대화를 저장하지 않습니다.
- 개인 아카이브에 첫 커밋을 하기 전부터 익명화합니다. 나중에 삭제해도 Git 이력에 남습니다.
- 업무 폴더 연결은 archive_cli.py bind의 로컬 설정만 사용합니다.
  기본 위치는 ~/.config/interview-lab/archive-bindings.json이며 아카이브/업무 폴더 밖입니다.

4. 검토와 게시
- archive_cli.py --repo <저장소 root> validate 또는 --archive <path> validate로
  형식·프로젝트 참조 선언을 검사합니다. 외부 프로젝트의 실제 존재는 서버가 확인합니다.
- 변경점에서 사실, 본인 기여, 익명화, 기존 기록과의 중복을 직접 확인합니다.
- 검토한 브랜치를 main에 반영하고 일반 push합니다. 다른 PC 변경과 충돌하면 병합 후
  다시 검토합니다. 서버는 등록된 원격 브랜치(기본 main)만 읽고 저장소에 쓰지 않습니다.
- 아카이브 삭제는 현재 목록에서 내리는 동작입니다. 앱의 과거 revision·개인 메모는 유지됩니다.
- 앱 질문 메모·답변은 Git에 없으므로 별도 SQLite 백업이 필요합니다.

명령 예시 (공통 옵션은 하위 명령 앞에 둡니다. --repo와 --archive는 함께 쓰지 않습니다)
python archive_cli.py --repo ../my-side-project init
python archive_cli.py --repo ../my-side-project project add --name "개인 프로젝트" --kind side --description "짧은 설명"
python archive_cli.py --repo ../my-side-project list --project <UUID> --search "문제 키워드"
python archive_cli.py --repo ../my-side-project new --project <UUID> --title "설계 판단"
python archive_cli.py --repo ../my-side-project project ref add <다른 소스의 프로젝트 UUID>
python archive_cli.py --repo ../my-side-project project ref list
python archive_cli.py --repo ../my-side-project validate
python archive_cli.py --repo ../my-side-project --records-path docs/interview init
python archive_cli.py --archive ../interview-archive init
python archive_cli.py --archive ../interview-archive project add --name "익명 업무 A" --kind work
python archive_cli.py --archive ../interview-archive project list
python archive_cli.py --archive ../interview-archive bind --project <UUID> --folder <로컬 개발 폴더>
python archive_cli.py --archive ../interview-archive list --project <UUID> --search "문제 키워드"
python archive_cli.py --archive ../interview-archive new --project <UUID> --title "설계 판단"
python archive_cli.py --archive ../interview-archive new --folder <로컬 개발 폴더> --title "문제 해결"
python archive_cli.py --archive ../interview-archive project edit <UUID> --name "변경한 이름"
python archive_cli.py --archive ../interview-archive validate

--repo는 전체 Git checkout의 최상위 폴더입니다. --records-path는 저장소 안의 상대 경로로,
기본은 interview입니다. 절대 경로, .., .git, symlink 경로는 사용하지 않습니다.
init은 content root의 AI-WRITING.md와 schemas/에 이 안내와 스키마를 제공합니다.
코드 저장소 root의 AGENTS.md는 수정하지 않습니다. 기존 안내 파일도 덮어쓰지 않습니다.
별도 아카이브 root에는 --archive를 계속 사용할 수 있습니다.

스키마: schemas/archive-v3.schema.json(현재 content root의 manifest),
schemas/project-v3.schema.json(프로젝트), schemas/learning-v4.schema.json(새 기록),
schemas/learning-v3.schema.json(기존 기록).
Interview Lab의 formats/archive-v3.example/은 사이드·익명 업무 합성 예시이며,
archive-v3.references.example.json은 다른 소스의 프로젝트를 참조하는 manifest 예시입니다.


5. 검색 후 새 기록 만들기와 게시 상태
- list --project <UUID>로 기존 기록을 먼저 읽습니다. 같은 경험이면 기존 UUID 파일을 수정합니다.
- new는 선택한 프로젝트의 기존 기록을 자동 조회합니다. 기존 기록이 있으면 후보의 ID, 경로,
  요약과 결정 문맥, review_token을 보여주고 파일을 만들지 않습니다(종료 코드 2).
- 후보를 검토해 다른 경험이라고 명시적으로 결정한 때만 같은 new 명령에
  --review-token <출력된 값>을 붙여 새 초안을 만듭니다. 데이터나 요청이 바뀌면 토큰이 만료됩니다.
- 같은 제목이라도 독립된 경험이면 별도 기록을 만들 수 있습니다. 자동 병합은 하지 않습니다.
- 기존 기록이 전혀 없을 때는 자동 조회 후 바로 새 v4 draft를 만듭니다.
- draft 파일은 main에 있어도 현재 학습 목록에 게시되지 않습니다. 민감정보는 draft에도 쓰지 않습니다.
- CLI가 생성한 '확인 필요'를 실제 설명으로 채우고 기여·실행 검증·익명화를 직접 검토한 뒤
  publish <UUID> --reviewed를 실행합니다. 이 플래그는 작성자의 검토 선언이며 사실 검증이 아닙니다.
- unpublish <UUID>는 v4 draft로 바꿉니다. push·수집 후 현재 목록에서 내리고 과거 버전·메모는 남깁니다.
- v3 기록은 호환성을 위해 암묵적으로 published입니다. publish/unpublish 명령으로 UUID를 유지하며
  v4로 전환할 수 있습니다. v3에 publication 필드를 덧붙이는 대신 버전도 4로 바꿉니다.
- 이미 published인 파일은 기존 Git 검토 흐름으로 직접 수정할 수 있습니다. 검토 중 목록에서
  내리기를 원할 때만 unpublish를 사용합니다. 브랜치 변경을 수집기가 읽지는 않습니다.

python archive_cli.py --repo ../my-side-project new --project <UUID> --title "설계 판단"
python archive_cli.py --repo ../my-side-project new --project <UUID> --title "설계 판단" --review-token <미리보기 토큰>
python archive_cli.py --repo ../my-side-project publish <기록 UUID> --reviewed
python archive_cli.py --repo ../my-side-project unpublish <기록 UUID>

6. 공통 안내와 스키마 갱신
- templates check로 관리 파일의 버전·변경을 확인합니다.
- templates update는 diff 미리보기만 보여줍니다. --apply를 붙여야 안전한 변경을 저장합니다.
- .interview-templates.json은 각 관리 파일의 설치 버전·해시를 보관하며 Git에 함께 커밋합니다.
- 설치 후 수정하지 않은 파일만 자동 갱신합니다. 로컬 사용자 수정·삭제는 conflict로 남기며
  덮어쓰지 않습니다. diff를 보고 수동 병합합니다. 수동 병합 결과가 최신 배포본과 같으면
  다음 --apply에서 새 기준으로 채택할 수 있습니다. 별도 커스텀 지침은 계속 보존합니다.
- 이전 init으로 만들어져 관리 정보가 없는 파일은 현재 배포본과 정확히 같은 경우에만
  채택합니다. 다른 내용은 이전 기본값인지 사용자 수정인지 추측하지 않고 보존합니다.
- init은 새 프로젝트에서 최신 파일을 설치합니다. 이미 있는 파일의 업데이트에는
  templates update를 사용합니다. 프로젝트 root AGENTS.md는 수정하지 않습니다.

python archive_cli.py --repo ../my-side-project templates check
python archive_cli.py --repo ../my-side-project templates update
python archive_cli.py --repo ../my-side-project templates update --apply

최신 기록 스키마와 예시는 schemas/learning-v4.schema.json, examples/learning-v4.example.json입니다.
v3 기록·manifest·프로젝트 스키마도 schemas/에 제공하여 기존 자료를 읽을 수 있습니다.
