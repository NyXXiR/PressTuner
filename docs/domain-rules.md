# Domain Rules

This file records the long-lived rules for `PressTuner`.

## 1. Product Subscription Is The Billing Aggregate

- Press and Career subscription state lives independently on `TeamProductSubscription`.
- A team can own both `PRESS` and `CAREER` subscriptions at the same time.
- The aggregate key is `teamId + product`.
- Legacy `Team` billing snapshot fields are compatibility-only during migration and must not be used
  to decide another product's price, lifecycle, or quota.
- Important fields move together:
  - `planId`
  - `plan`
  - `product`
  - `membershipStatus`
  - `nextPaymentAmount`
  - `nextBillingAt`
  - `planExpiresAt`
  - `pendingPlan*`
  - `limit*`
  - `usage*`

## 2. Plan Catalog Lives In `config/billing/plans.ts`

- Base pricing, quota, category, and product naming come from `config/billing/plans.ts`.
- If the commercial meaning of a plan changes, update that file first.
- UI copy, checkout logic, and scheduler behavior must stay consistent with that catalog.
- The source of truth for plan details is `config/billing/plans.catalog.ts`.
- `PressTuner-scheduler` syncs this catalog into `src/config/billing/plans.catalog.ts` via `sync-billing-catalog.js`; do not edit the scheduler copy directly.

## 3. Stored Next Charge Wins

- `TeamProductSubscription.nextPaymentAmount` is the source of truth for the next actual renewal charge of that product.
- Legacy `Team.nextPaymentAmount` is a compatibility projection and must not make a billing decision.
- Do not recalculate renewal amount from plan config at charge time if the DB snapshot already has the value.
- Fallback calculation is a safety net, not the primary rule.

## 3.1 External Payment And Local Apply Are Separate

- PortOne calls cannot participate in a database transaction.
- A subscription change is tracked durably by `SubscriptionChange` with separate provider-payment and local-apply states.
- The operation and its price snapshot are persisted before a provider call.
- A confirmed provider payment must never be rewritten as payment failure because a later local write failed.
- `CONFIRMED + FAILED` means the provider charge succeeded but local subscription application must be retried without charging again.
- API completion, webhook handling, and reconciliation must converge on one idempotent operation.
- `TeamBillingHistory` remains audit/reconciliation evidence; it is not the subscription-change workflow aggregate.

## 4. Pending Plan Changes Are Explicit

- `pendingPlanId` and related fields represent scheduled change intent.
- A pending plan becomes active only when its effective date is reached or the renewal flow applies it.
- After application, pending fields must be cleared.
- Do not partially apply a plan change while leaving stale pending metadata behind.

## 5. Quota Snapshots Must Stay In Sync With Plan State

- When a team changes plan, the stored quota snapshot must be updated with it.
- This includes both article quota and resume quota.
- Free downgrade and renewal paths must reset or carry usage counters intentionally, never by accident.

## 6. Scheduler Runs In KST

- Billing and cleanup schedules are KST-based operational rules.
- If cron timing changes, update both runtime behavior and documentation together.

## 7. Scheduler Schema Is A Mirror

- `PressTuner/prisma/schema.prisma` is the primary schema.
- `PressTuner-scheduler/prisma/schema.prisma` is a synced copy created by `sync-schema.js`.
- Do not hand-maintain schema divergence between the two repos.
- Renewal, pending-plan, expiry, and past-due jobs operate per product subscription, not per team.

## 8. Audit Records Are History, Not Authority

- Billing history and order records support traceability and reconciliation.
- They do not replace `TeamProductSubscription` as the active product billing authority.

## 9. Safe Change Pattern

- Plan catalog change:
  - update `config/billing/plans.ts`
  - update application logic that applies snapshot fields
  - mirror the scheduler repo's local billing plan copy and execution logic
  - verify pricing and quota displays
- Prisma change:
  - update main schema first
  - synchronize the configured database with `npx prisma db push`
  - then sync scheduler schema
  - do not introduce a Prisma migration history unless the deployment convention is changed explicitly
- Renewal logic change:
  - verify pending plan application, no-charge renewals, downgrade flow, and quota resets together
# Knowledge storage and retention

- Knowledge document count means non-deleted replacement-chain leaves. A
  pending successor occupies its predecessor's logical slot.
- Stored-byte quota includes every retained source blob, including cited
  archived predecessors and replacement staging documents.
- Upload-rate quota counts accepted unique document rows through the durable
  `KnowledgeUploadEvent` ledger. Deleting a document does not erase rate
  history.
- Uncited deletion purges bytes and chunks. Cited deletion archives the source
  so persisted `AgentCitation` evidence remains valid.
- A replacement predecessor remains effective until its non-deleted successor
  reaches `READY`; retrieval applies the same lifecycle predicate to vector
  ranking, text ranking, and the final join.
- Persistent changes are migration-first. After knowledge or Prisma changes,
  synchronize the sibling scheduler schema with its `npm run generate` command.

# Grounded press releases

- Search only the active immutable index generation. Re-indexing never deletes
  an older generation or invalidates its citations.
- Effective knowledge role is the document override when present, otherwise the
  chunk's automatic role. Unclassified chunks fail closed.
- FACT, STYLE_POLICY, STYLE_EXAMPLE, and IGNORE are disjoint. Style examples are
  expression-only and never factual evidence or final citations.
- Retrieved FACT chunks are candidates until explicitly accepted. Generation
  reads accepted active facts from the database, not source IDs or fact text
  supplied by the browser.
- Editing a RAG fact makes it user-authored and clears candidate, document,
  chunk, page, and excerpt provenance in the same transaction.
- A verification is current only while canonical content hash, grounding
  revision, and team knowledge corpus version all match.
- RAG-backed contradictions about a number, period, date, person, title, or
  direct quote block FINAL. Unsupported user facts and style-policy violations
  warn but do not block.
- Every FINAL transition uses the authoritative finalization service and
  requires a current PASS or WARN. Reviewer approval leaves an article
  IN_PROGRESS.
- Agent retrieval candidates and final citations are separate. Agent apply must
  reproduce the verified canonical draft hash and still satisfy the optimistic
  article-version guard.
- Legacy StyleGuide schema and compatibility services remain for retention, but
  the active press flow uses role-classified knowledge contexts instead.

# Personal career memory

- Career sources, candidates, experiences, facts, retrieval, grounding, and
  verification are always scoped by `userId`. `teamId` is billing/quota context
  only and never grants another team member access.
- PDF, direct-input, and final-answer extraction creates editable pending
  candidates. Only an explicit owner approval may create, link, or augment
  confirmed career memory; assistant prose never promotes itself.
- PDF evidence is `SOURCE_EXCERPT`; an owner edit replaces evidence for the
  changed field with `USER_ASSERTION`. Organization, title, dates, current
  status, and metrics are trusted only when field path and normalized value
  hash both match the approved value.
- The main app claims a source as `QUEUED` before asking Scheduler to enqueue
  it. Scheduler processes only the exact source owner and processing version,
  so deletion or retry makes older jobs harmless.
- Deleting a source purges its bytes and chunks. Copied excerpts/page ranges
  remain as immutable evidence, while affected facts become inactive and
  experiences become `NEEDS_REVIEW`.
- Drafting and revision retrieve only confirmed, owner-scoped experiences and
  active trusted facts. Text fallback keeps confirmed rows available while
  vector indexing heals; vector ranking accepts only
  `embeddedRevision === embeddingRevision`. Application JD text remains target
  context and is never stored as career memory.
- Every approved mutation durably increments the embedding revision before the
  Scheduler request. Failed requests leave a discoverable stale revision, and
  the bounded Scheduler healing scan may be paused and safely resumed.
- Completion requires a verification matching the exact answer hash, answer
  revision, owner, and career-memory version. Unsupported or contradictory
  numbers, dates, organizations, and titles block completion unless the owner
  records a reasoned override for that exact answer version.
- Verification retrieves current trusted facts independently for each claim;
  generation grounding is a ranking hint and readable audit record, not the
  verification fact universe. Final answers create deduplicated pending
  proposal groups and application `DONE` is written only after every question
  and current-answer proposal is resolved.
- Verified final answers are completed before experience extraction. Extraction
  is represented by one owner/question/answer-hash/revision task and the task
  never stores another answer copy. Claims use a conditional token and a
  two-minute lease, retry after one and five minutes, and stop automatically
  after three attempts.
- Pending and failed extraction tasks do not block application `DONE`; an
  active `PROCESSING` task and every successfully extracted unresolved
  proposal do. Retrying from `DONE` requires explicitly reopening the
  application.
- `PressTuner-scheduler` must load `career-memory-queue`; readiness fails when
  it is absent. The two processes share PostgreSQL, Redis, `OPENAI_API_KEY`, and
  a matching `CAREER_SCHEDULER_TOKEN` (or `SCHEDULER_INTERNAL_TOKEN`).
  Scheduler uses `PRESSTUNER_APP_URL` to call the App-owned capture retry
  boundary once per minute; `CAREER_CAPTURE_RETRY_ENABLED=false` pauses this
  callback without pausing the existing memory healing worker.
