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
| 5 | Mobile/common-tab/focus UX (F9/F10/accessibility) | In progress | Pending |
| 6 | Retention, copy, metadata, hydration cleanup (F11/F13/F14) | Pending | Pending |
| 7 | Full regression verification | Pending | Pending |

## Current resume point

Start Unit 5 by repairing viewport-independent access to core actions and
dialog interaction. In particular:

1. Import and readiness actions should remain reachable from common information.
2. The mobile document should not overflow the body, and section controls must
   remain reachable within a deliberate scroll/wrap region.
3. Mobile actions should expose save status and the import entry point.
4. High-use dialogs need reliable initial focus and keyboard containment.

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
