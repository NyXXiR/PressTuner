# AGENTS.md

Start here when working in `PressTuner`.

## Purpose

- This repo is the main brieFFlow / PressTuner application.
- It combines marketing pages, authenticated product flows, AI writing features, billing, and team/workspace management in one Next.js app.
- Read `AI_IMPROVEMENT_DIRECTION.md` for product positioning and portfolio-oriented improvement direction.
- Read `docs/domain-rules.md` before changing billing, plan, quota, or Prisma behavior.

## Repo Map

- App Router pages and API routes: `app/`
- Business logic:
  - `lib/services/`
  - `domain/`
  - `config/billing/`
- Prisma schema and seed:
  - `prisma/schema.prisma`
  - `prisma/seed.ts`
- Zustand stores: `stores/`
- Existing design/product notes: `docs/`

## Change Order

- Billing or quota change:
  - read `docs/domain-rules.md`
  - update `config/billing/plans.ts` if the catalog changes
  - update Prisma/application logic together
  - verify the sibling scheduler impact
- API route change:
  - update service/domain logic first
  - keep route handlers thin
- Resume/press AI change:
  - prefer service-layer orchestration updates over page-level hacks

## High-Risk Areas

- `config/billing/plans.ts`
- `domain/billing/`
- `lib/services/billing/`
- `app/api/billing/`
- `prisma/schema.prisma`

## Cross-Repo Dependency

- `PressTuner-scheduler` is a separate repo that follows this repo's Prisma schema and billing semantics.
- The scheduler Prisma schema is a synced copy. Billing plan details are sourced from `config/billing/plans.catalog.ts` and synced into the scheduler repo with `sync-billing-catalog.js`.
- If you change billing fields, plan semantics, or Prisma models here, inspect the scheduler repo and run the relevant sync scripts there.

## Validation

Run and report the relevant commands:

```bash
npm run lint
npm run build
```

If Prisma or billing behavior changed, also mention scheduler follow-up even if you did not edit that repo in the same task.

## Avoid

- Recomputing billing meaning differently in multiple places
- Treating route handlers as the business source of truth
- Editing scheduler-copied schema rules in isolation
- Shipping plan/quota copy that no longer matches `config/billing/plans.ts`
