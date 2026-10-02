# 경험 기록 작성과 게시

이 저장소의 `interview/`가 프로젝트 기록 원본입니다. 수집 브랜치는 `interview-records`입니다.
앱 배포 브랜치와 별도로 운영하며, 코드 변경 없이 기록만 commit·push할 수 있습니다.
프로젝트 등록만 준비한 상태이며 아직 경험 기록은 없습니다.

1. 이 브랜치의 별도 작업 폴더에서 `git pull --ff-only`를 실행합니다.
2. `AI-WRITING.md`를 읽고 Interview Lab의 `archive_cli.py --repo <이 작업 폴더> list --project <프로젝트 UUID>`로 기존 경험을 찾습니다.
3. 같은 경험이면 같은 UUID 파일을 수정합니다. 새 경험은 `new --project <프로젝트 UUID> --title <제목>`으로 draft를 만들고 실제 작업·기여·검증·한계를 작성합니다.
4. `validate`와 내용 검토 후 `publish <기록 UUID> --reviewed`를 실행합니다.
5. `git diff -- interview`를 검토하고 `git add interview`, `git commit`, `git push origin interview-records`를 실행합니다.
6. Interview Lab의 더보기에서 적용 커밋과 오류를 확인합니다. 초안은 노출되지 않습니다.

프로젝트 UUID는 `projects/`의 JSON에 있습니다. UUID와 source ID를 다시 발급하지 않습니다.
`examples/`는 작성 안내이며 수집하지 않습니다. 경험 기록은 `records/<UUID>.json`에만 둡니다.
이미 수집된 기록 경로·브랜치 변경은 Interview Lab의 relocate 절차를 따릅니다.
