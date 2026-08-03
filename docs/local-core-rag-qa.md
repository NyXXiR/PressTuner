# Local core RAG QA

Run from `/home/nyxxir/PressTuner`:

```bash
npm run qa:core-local
```

The command needs no browser login and does not use the production database. It
runs:

1. The 14-file independent PDF benchmark, including the mislabeled PNG failure.
2. Press knowledge classification, retrieval, grounding, verification, citation,
   and finalization domain suites.
3. Career candidate, retrieval, grounding, verification, finalization, and
   experience-capture domain suites.
4. Both 30-case Press RAG evaluation contracts.

Success ends with:

```json
{
  "ok": true,
  "mode": "local-backend-only"
}
```

Any parser, domain, database-safety, or evaluation failure exits nonzero. An AI
working on this PC can therefore be instructed with:

```text
cd /home/nyxxir/PressTuner에서 npm run qa:core-local을 실행하고,
실패가 있으면 원인을 수정한 뒤 전체 명령이 성공할 때까지 반복해줘.
운영 DB, 배포, 실제 사용자 데이터는 변경하지 마.
```
