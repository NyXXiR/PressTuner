# Resume Documents Hardening Progress

Updated: 2026-08-31 (UTC)

Branch: `codex/resume-documents-hardening`

Base: `master @ da2ef11`

## Purpose

Harden `/resume/documents` around durable imports, starter-content rules,
destructive actions, mobile editing, and recoverable user flows.

This file is the session-resume ledger. Update it whenever one work unit is
completed. A completed unit must include the relevant automated checks and a
short note about any remaining follow-up.

## Domain decisions

- A resume-import candidate is not `applied` until the resulting resume
  document snapshot has been durably saved on the server.
- Candidate application records the persisted resume document revision, not
  the resume schema version.
- Built-in resume sections are stable import targets. Users may hide or clear
  them, but must not permanently delete their IDs.
- Starter sample values are incomplete content. Editing one field of a starter
  item must never make the other user-authored fields disposable.
- Browser backup and server persistence are independent channels and must be
  reported independently when either one fails.

## Work units

| Unit | Scope | Status | Verification |
| --- | --- | --- | --- |
| 0 | Isolated worktree and resumable ledger | Complete | Worktree created from `da2ef11` |
| 1 | Durable import application and target validation (F1/F8) | Complete | 50 targeted tests + ESLint + `tsc --noEmit` |
| 2 | Browser/server persistence and conflict visibility (F2/F5) | Complete | 50 targeted tests + ESLint + `tsc --noEmit` |
| 3 | Starter and built-in-section invariants (F4/F6/F7) | Complete | 125 targeted tests + ESLint + `tsc --noEmit` |
| 4 | Dirty-close and cascading-delete disclosure (F3/F12) | Complete | 126 targeted tests + ESLint + `tsc --noEmit` |
| 5 | Mobile/common-tab/focus UX (F9/F10/accessibility) | Complete | 127 targeted tests + ESLint + `tsc --noEmit` |
| 6 | Retention, copy, metadata, hydration cleanup (F11/F13/F14) | Complete | 130 targeted tests + ESLint + `tsc --noEmit` |
| 7 | Full regression verification | Complete with baseline blockers | Full ESLint passed with existing warnings; full test/build blockers documented below |
| 8 | Hermes handoff concurrency and recovery review | Complete | 146 targeted tests, 319-file full suite, lint, TypeScript, production build, Chromium QA |

## Current resume point

Implementation and verification are complete and the verified fast-forward was
promoted to `origin/master`. The separately checked-out local `master` was left
untouched because its worktree contains unrelated user changes. The
pre-continuation tracked diff remains recoverable from
`refs/backup/resume-documents-hermes-handoff`.

## Validation log

- Unit 1: `node --import tsx --test
  lib/services/resume/resumeDocumentCandidateService.test.ts
  lib/services/resume/resumeDocumentPersistenceService.test.ts
  lib/resumeDocumentSurface.test.ts` — 50 passed, 0 failed.
- Unit 1: targeted ESLint — passed.
- Unit 1: `npx tsc --noEmit` — passed.
- Unit 2: same targeted 50-test command — 50 passed, 0 failed.
- Unit 2: targeted ESLint and `npx tsc --noEmit` — passed.
- Unit 3: domain/service/surface suite — 125 passed, 0 failed.
- Unit 3: targeted ESLint and `npx tsc --noEmit` — passed.
- Unit 4: domain/service/surface suite — 126 passed, 0 failed.
- Unit 4: targeted ESLint and `npx tsc --noEmit` — passed.
- Unit 5: domain/service/surface suite — 127 passed, 0 failed.
- Unit 5: targeted ESLint and `npx tsc --noEmit` — passed.
- Unit 6: domain/service/surface suite — 130 passed, 0 failed.
- Unit 6: targeted ESLint and `npx tsc --noEmit` — passed.
- Unit 7: `npm run lint` — passed with 0 errors and 76 pre-existing warnings.
- Unit 7: `npm test` — stopped at the pre-existing
  `domain/ai-process-console/v2/fixtureRegistry.test.ts` expectation mismatch:
  base `da2ef11` registers `success-v2-3-1` but the base test omits it.
- Unit 7: Turbopack build — environment-blocked because the isolated worktree
  reuses `node_modules` through an out-of-root symlink.
- Unit 7: webpack production build — reached compilation, then stopped at the
  pre-existing client import chain
  `PressApiPlaygroundClient → processRegistry → aiQuota → qaAuthService → node:crypto`.
- Unit 8: resume domain/service/surface suite — 146 passed, 0 failed.
- Unit 8: targeted ESLint and `npx tsc --noEmit` — passed.
- Unit 8: isolated full sweep — 319 test files, 0 failures.
- Unit 8: full ESLint — 0 errors / 76 existing warnings; TypeScript passed.
- Unit 8: Next 16 Turbopack production build — passed, including all 151
  static pages. Temporary root/dist settings were restored afterward.
- Unit 8: headless Chromium QA — 5/5 flows passed on `presstuner_test`;
  disposable user, team, session, source, import, and document data removed.
- Unit 8: fetched `origin/master`; it remained `da2ef11`, so integration was a
  no-op and the verified branch is a six-commit fast-forward.
- Unit 8: pushed the verified history to `origin/master` without force and
  confirmed the remote ref matched the source branch HEAD.

## Unit 1 implementation notes

- Added `POST /api/resume/documents/candidates/:candidateId/apply`.
- The service now applies the command, persists the resulting aggregate, and
  marks the candidate applied in one database transaction.
- `appliedDocumentVersion` now stores the actual persisted revision. The
  legacy acknowledgement route refuses acknowledgement unless the stored
  document ledger contains the matching candidate and payload hash.
- Missing targets are rendered as `대상 섹션 없음`, block individual and bulk
  approval, and remain available for correction.
- Failed or ambiguous candidate applications keep the review list mounted so
  the idempotent endpoint can be retried.

## Unit 2 implementation notes

- Browser-backup health is tracked independently from server-save health.
- A `localStorage` exception no longer returns before the server autosave timer
  is installed, and a sync-metadata write failure cannot negate a committed
  server save.
- Browser-backup failure copy now says server saving continues; server failure
  copy no longer promises that a browser backup exists.
- Conflict recovery is a sticky, viewport-independent alert with both recovery
  actions and is rendered in both common-information and resume views.
- Candidate application is serialized against autosave. Only a real document
  revision conflict blocks future saves; import validation errors remain local
  to the candidate and normal autosave resumes.

## Unit 3 implementation notes

- Starter-value, starter-tag, and untouched-starter-item detection now lives in
  the resume document domain and is shared by import and readiness logic.
- Item import removes a starter row only when every seeded field is untouched;
  changing subtitle, body, period, or other content preserves the row.
- Readiness treats seeded name, email, portfolio link, narratives, tags, and
  item rows as incomplete rather than valid content.
- Built-in shared IDs cannot be deleted. The common-information menu explains
  that their content can be edited or hidden at the role level.
- Parsing an older V5 snapshot with a missing built-in ID restores an empty
  canonical section and repairs explicit role/support order lists.

## Unit 4 implementation notes

- Section editors compare against their opening snapshot and protect Close,
  Cancel, and Escape with the same discard confirmation.
- The external-AI workflow protects pasted or prepared results on Close and
  Escape, and also confirms before switching from section to whole-document
  scope.
- The parent Escape handler ignores dirty-aware child editors and closes only
  one simple top-level surface according to visual priority.
- Role-resume deletion now lists the count and names of all dependent support
  versions before executing the existing cascading domain command.

## Unit 5 implementation notes

- Import and readiness actions render in both tabs; confirmed-experience import
  is no longer hidden in a collapsed management disclosure.
- The mobile action bar now includes import plus an always-visible server-save
  status row, with additional bottom clearance for content.
- Mobile preview containment clips accidental body overflow and wraps section
  toolbars while keeping their action group reachable.
- A shared focus-trap hook now gives the import and external-AI dialogs initial
  focus, contains Tab/Shift+Tab, and restores the launching control on close.

## Unit 6 implementation notes

- Import history now has a visible destructive action backed by authenticated
  `DELETE /api/resume/documents/imports/:importId`. It purges retained source
  bytes and chunks through the existing privacy transaction, hides every import
  sharing that deleted source, and discloses downstream memory re-review.
- Import list/detail queries exclude deleted sources. A database integration
  test verifies byte nulling, chunk deletion, shared-source hiding, and 404
  detail behavior.
- Zero-candidate text attempts now have distinct recovery guidance and disclose
  quota consumption both before submission and in the empty result.
- Replace-mode labels explicitly say when the whole link, tag, or narrative
  collection will be replaced.
- Removed the duplicated metadata suffix, made starter item IDs deterministic
  across SSR/CSR, stopped substituting the role name into an empty company line,
  and removed the unused legacy `RoleProfileManager` surface.
- The fixed rejection reason remains an audit event category. Collecting
  free-form rejection feedback is deferred until a product decision defines how
  it will be used; adding an unused mandatory field would add friction without
  improving recovery or data safety.

## Unit 7 verification notes

- Scoped domain, persistence, database-service, and UI-surface coverage passed
  130 tests with no failures; targeted ESLint and TypeScript also passed.
- The two full-repository blockers were confirmed directly in base commit
  `da2ef11` and were not changed because they are outside `/resume/documents`.
- No new Playwright browser session was run in this worktree. The responsive,
  conflict, import deletion, and dirty-close changes still need a final manual
  Chromium pass before deployment.

## Unit 8 implementation notes

- Initial hydration and late candidate responses preserve edits made while a
  request is in flight; unresolved conflicts survive reload.
- Candidate response reconciliation now covers the complete document tree,
  including role/support custom sections. ID-addressable arrays merge per item,
  so an imported item and a concurrent edit to an existing item both survive.
- Candidate application is serialized per candidate and per user document.
  Stale candidate claims fail closed, duplicate concurrent application is
  idempotent, and a retry cannot return a document changed after the original
  candidate revision.
- Import/source deletion removes retained bytes, chunks, derived imports,
  candidates, and evidence transactionally.
- Concurrent import retries converge on one scheduler enqueue; callers that
  observe an already waiting/queued/extracting retry receive its current state,
  while enqueue failure is restored to `FAILED` and reported as 503.
- Chromium verified the starter readiness count and title metadata, dirty
  Escape/cancel protection, source byte/chunk purge, 390px overflow/mobile
  actions, and continued server saving when `localStorage` throws.
