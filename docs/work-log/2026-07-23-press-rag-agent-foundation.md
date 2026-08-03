# Press RAG Agent foundation — 2026-07-23

## Delivered

- Added durable team PDF upload/index lifecycle, page-aware chunk persistence,
  pgvector/FTS migration, BullMQ indexing, and hybrid citation retrieval.
- Added one server-side OpenAI Agents SDK workflow with explicit search,
  comparison, draft, verification, and approval-gated article application
  tools.
- Added PostgreSQL run, step, approval, citation, checkpoint, trace, usage,
  cost, latency, retry, and error records.
- Replaced browser execution in the Press assistant with Agent run and approval
  APIs.
- Added a 30-case versioned evaluation dataset, metric domain, and result
  runner.
- Documented the canonical `D:\workspace\PressTuner` path after identifying
  Windows path casing as the cause of duplicate Next.js runtime modules during
  production builds.

## Latest verification evidence

- Main app: `npm test` — 236/236 passed.
- Main app: `npm run lint` — 0 errors, 80 warnings.
- Main app: `npx tsc --noEmit` — passed.
- Main app: `npm run build` — passed, 123 static pages generated.
- Main app: `npx prisma validate` and `npx prisma generate` — passed.
- Main app: `npm run eval:press-rag` — dataset valid, version
  `press-rag-v1`, 30 cases.
- Main app: `git diff --check` — passed (line-ending notices only).
- Scheduler: test runner 2/2 and TypeScript suites 30/30 passed.
- Scheduler: `npm run build` — schema/catalog sync, Prisma generation, and
  TypeScript build passed after the nullable payment-amount narrowing fix.

## Operational handoff

The architecture, environment variables, migration order, evaluation method,
and production prerequisites are in `docs/press-rag-agent.md`. PostgreSQL backup,
pgvector activation, the production migration sequence, controlled clone E2E,
and the first 30-case controlled baseline have been completed. The application
and Scheduler revisions in this checkpoint have not been deployed.

The scheduler repository contained unrelated in-progress billing and cleanup
changes before this work. They were preserved. Its Prisma schema was refreshed
through the repository's `sync-schema.js`, and the normal scheduler build also
ran its existing billing catalog sync.

## WIP checkpoint status

This feature-branch commit is a preservation checkpoint, not a production-ready
release. A fresh independent review still identified blocking/high-risk recovery
work, including Scheduler provider-success/local-DB-failure reconciliation,
payment operation authority and cancellation races, fail-closed Redis readiness,
and Main Agent/Knowledge retry, enqueue, reindex, and crash-recovery contracts.
Do not merge to the default branch or deploy until those findings are closed with
RED/GREEN tests and a follow-up review reports zero blocking/high-risk findings.
