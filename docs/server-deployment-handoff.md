# Server PC handoff: Press RAG Agent

## Repositories

- Main: `NyXXiR/PressTuner`, branch `feat/press-rag-agent-foundation`
- Scheduler: `NyXXiR/PressTuner-scheduler`; use branch
  `feat/press-rag-agent-foundation` for the RAG worker commit

The main implementation and scheduler worker must both be available on the
server. The scheduler repository uses the sibling main repository as the source
for `sync-schema.js`.

## Before commit

The main repository's intended feature commit includes:

- knowledge UI and APIs
- knowledge and Agent domain/services/tests
- Press assistant Agent integration
- Prisma schema and the two 20260723 migrations
- evaluation dataset/runner
- architecture/work log
- `.agent-work/press-rag-agent-deployment`

The scheduler repository has unrelated pre-existing billing/cleanup work. Do
not run `git add -A`. The RAG worker commit should contain only:

- dependency additions for `openai` and `unpdf`
- `src/domain/knowledge.ts` and its test
- `src/workers/knowledge.ts`
- `src/workers/knowledgeHandler.ts`
- the knowledge queue addition in `src/queues/setup.ts`
- the knowledge manual API addition in `src/index.ts`

`prisma/schema.prisma` is synchronized from the main repository during the
scheduler build. Review it separately because its current diff also contains
pre-existing billing schema work.

## Commit and push

Both repositories have the intended RAG changes staged on
`feat/press-rag-agent-foundation`. Review the staged summaries, then run:

```powershell
Set-Location D:\workspace\PressTuner
git diff --cached --check
git commit -m "feat: add grounded press RAG agent"
git push -u origin feat/press-rag-agent-foundation

Set-Location D:\workspace\PressTuner-scheduler
git diff --cached --check
git commit -m "feat: add knowledge indexing worker"
git push -u origin feat/press-rag-agent-foundation
```

Do not run `git add -A` in the scheduler before committing. Its unrelated
billing/cleanup changes are intentionally left unstaged.

## Server Codex start

Install or link `tdd-work-continuity` on the server PC, then from the canonical
main repository path:

```powershell
python D:\workspace\tdd-work-continuity\scripts\workctl.py `
  --workdir D:\workspace\PressTuner --json discover `
  --task-id press-rag-agent-deployment
```

Read the task's `STATE.json` and `PLAN.md`, inspect both worktrees, then claim
the paused task with a new server-specific owner. Execute the exact first
unchecked checklist item.

## Critical stop condition

Do not run `prisma migrate deploy` merely because migrations are pending.
First reconcile production history with the empty local directory:

`prisma/migrations/20260721090000_split_product_subscriptions`

The deployed database may already contain equivalent schema changes. Determine
the intended SQL or use Prisma's documented migration resolution procedure only
after recording production evidence. Take a database backup before an approved
schema mutation.

## Required connectivity

Main app:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `SCHEDULER_URL`
- `MANUAL_API_KEY`

Scheduler:

- the same PostgreSQL database
- `OPENAI_API_KEY`
- matching `MANUAL_API_KEY`
- Redis host/port or the repository's equivalent Redis configuration

Report whether each value is present and whether the dependency is reachable;
never print credentials.

## User smoke path

1. Sign in as a team user.
2. Open `/team/knowledge` and upload a controlled PDF under 20 MB.
3. Confirm `UPLOADED → QUEUED → PARSING → INDEXING → READY`.
4. Open a Press article editor and ask a fact present in the PDF.
5. Confirm cited document name and page range.
6. Ask the Agent to compare two sources and produce a verified draft.
7. Request article application, confirm the approval card appears, approve it,
   and confirm the article changes only after approval.
8. Inspect run/step/approval/citation rows and retry evidence.
9. Run the 30-case evaluation with measured results and retain the report.
