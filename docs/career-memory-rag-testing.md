# CAREER memory RAG test guide

## Runtime setup

Run the additive migrations before starting either process. The main app and
Scheduler must share PostgreSQL and the following internal connection values:

- Main app: `CAREER_SCHEDULER_URL` (or `SCHEDULER_INTERNAL_URL`) and
  `CAREER_SCHEDULER_TOKEN` (or `SCHEDULER_INTERNAL_TOKEN`)
- Scheduler: `PRESSTUNER_APP_URL`, the matching
  `CAREER_SCHEDULER_TOKEN` (or `SCHEDULER_INTERNAL_TOKEN`), Redis
  configuration, `DATABASE_URL`, and `OPENAI_API_KEY`

The final-answer recovery callback runs once per minute and delegates a bounded
batch to the App. Set `CAREER_CAPTURE_RETRY_ENABLED=false` to pause only this
callback, or `CAREER_CAPTURE_RETRY_BATCH_SIZE` to a value from 1 to 20 to tune
the requested batch size. An App URL without a matching token, or vice versa,
is treated as a configuration error rather than silently skipped.

Start Scheduler first and confirm `GET /health` returns `200` with both Redis
and all required workers healthy. Then start the main app.

## User smoke path

1. Sign in and open `/resume/bricks` (the 경력 기억 page).
2. Upload a text-readable PDF under 20 MB.
3. Confirm its status advances through `QUEUED`, `PARSING`, `INDEXING`, and
   `EXTRACTING` to `READY`. The candidate review must refresh immediately once
   on that transition without a page reload.
4. Review the extracted cards and page excerpts. Edit one, approve it, and
   reject another with a reason. Double-clicks must not duplicate a decision;
   a failed PATCH must prevent approval, and failed approval/rejection must
   leave the card and an actionable retry message in place.
5. Create a CAREER application, paste its JD, and generate an answer. Confirm
   the answer shows only approved memory as grounding.
6. Add an unsupported number, date, organization, or title and try to complete
   the answer. Confirm verification blocks it.
7. Correct the claim, or enter an explicit override reason. Confirm completion
   applies only to the unchanged answer version.
8. Edit the answer or approve another memory item. Confirm the previous
   verification/override becomes stale and verification is required again.
9. Delete the PDF. Confirm the file disappears, affected memory is marked for
   review, and the same PDF can be uploaded again. A `재확인 필요` experience
   must explain that it is excluded from writing and expose `내용 확인 후 다시
   승인`, which creates an owner-asserted review candidate.

For the privacy check, repeat with two users in the same team and confirm
neither user can list, edit, link, retrieve, or capture the other's career
memory.

## Provenance and verification checks

- PDF high-risk fields must show `SOURCE_EXCERPT` evidence whose field path and
  normalized value hash match the candidate. Editing one of those fields must
  remove the old PDF evidence and show `USER_ASSERTION`.
- Fresh verification may support a correct manual edit from current trusted
  memory even when exact generation grounding is absent. Number, date,
  organization, and title claims require a compatible current fact kind.
- Grounding presentation must name the experience, fact value/kind, source
  document, page range, and copied excerpt; raw database IDs are not the
  primary presentation.

## Index healing and rollout rehearsal

Run `node scripts/report-career-memory-health.mjs` in the Scheduler repository
against a read-only or isolated database. Confirm stale/missing counts fall
after the bounded healing scan and that setting the documented pause flag stops
new scan enqueues without affecting ordinary jobs. Replaying an old revision
must not mark a newer row current.

Migration rehearsal order:

1. Restore a pre-career-memory schema/data fixture into a disposable database.
2. Apply all additive Prisma migrations in timestamp order.
3. Run the Scheduler health report and bounded backfill twice; the second pass
   must be idempotent.
4. Validate both Prisma schemas and compare them byte-for-byte.
5. Exercise the user smoke path and the two-user privacy path.

Rollback is application-first: pause the healing scan, roll back application
and Scheduler binaries to versions that tolerate the additive columns, and
leave the additive data in place. Do not drop provenance, revision, proposal,
or evidence columns during an incident. Resume the scan after the compatible
Scheduler is restored.

## Deferred final-answer capture recovery

1. Inject extraction failure after exact-answer verification passes. Confirm
   `Question.isCompleted` remains true and one owner-scoped
   `CareerFinalAnswerCaptureTask` is `PENDING`.
2. Repeat completion and concurrent retry for the same owner/question/hash/
   revision. Confirm one task and one proposal/candidate set.
3. Change the answer revision before retry. Confirm `SUPERSEDED` without a
   provider call.
4. Fail attempts one, two, and three. Confirm one-minute then five-minute
   backoff, followed by `FAILED` with no automatic due time.
5. Confirm `PENDING` and `FAILED` allow application `DONE`, `PROCESSING`
   rejects it, and an unresolved successful proposal remains blocking.
6. From `DONE`, retry without reopening and expect
   `APPLICATION_REOPEN_REQUIRED`; retry with `reopenApplication: true` and
   confirm `WRITING` is persisted before candidates appear.
7. Repeat listing and retry with a second same-team user and expect `404`.
8. Confirm provider response text appears in neither stored errors nor API
   payloads.

For a user with no trusted facts, confirm readiness is `EMPTY`, the real
`/resume/bricks` recovery action is visible, and manual writing remains
available. Generate/revise must preserve `422 CAREER_MEMORY_NOT_INDEXED` with
readiness details and `manualWritingAllowed: true`.
