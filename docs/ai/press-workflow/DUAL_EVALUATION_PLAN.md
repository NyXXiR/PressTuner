# Dual evaluation implementation plan

Status: implementation authorized, 2026-10-06 (Asia/Seoul). Coordinator: codex:dual-eval-20261006.
Scope: PressTuner draft generation and AI Process Console read-only comparison.

## Outcome and acceptance

The same immutable draft is evaluated by official Ragas Faithfulness and a separate PressTuner requirements rubric. An operator can inspect what each metric measures, missing evidence, evaluator disagreements, and changes between baseline/candidate generation configurations. Human review validates evaluators; automatic scores do not certify themselves. A rejected candidate is a valid experimental result.

Acceptance requires executable evaluation commands, 30 grouped synthetic input scenarios with a 20/10 development/holdout split, separate authored challenge outputs, human review import/export and agreement metrics, version/hash-bound measured artifacts, a paired experiment report, a safe Console comparison, focused tests and UI QA. Actual model and human evidence are marked pending until they exist. No synthetic fixture may be relabelled as measured or human-reviewed.

## Fixed design decisions

1. Two axes: evaluator comparison uses one saved draft; generator comparison uses baseline and candidate drafts of the same case. Never regenerate separately for each evaluator.
2. Ragas Faithfulness uses the official Python library and default metric definition; pin a tested release in a dedicated requirements lock. Inputs are user request, serialized draft, and accepted FACT content only. STYLE_EXAMPLE is never passed as factual context. The metric is diagnostic and has no invented universal pass threshold.
3. The domain rubric is versioned `press-requirements/v1`: factual support, mandatory information coverage, style-example contamination, unsupported promotional claims, requested style. Semantic judgments must cite exact draft spans and known fact IDs. Critical content failures BLOCK; style failures WARN; errors/ambiguous judgments are NOT_EVALUABLE and prevent PASS. It does not authorize production FINAL and does not supersede the existing authoritative verification service.
4. Keep the TypeScript generator/service and pure policy separated from the Python Ragas adapter. Python runs only from the project-owned batch CLI; Console never imports Ragas, calls an LLM, or orchestrates nodes.
5. Evaluate immutable artifacts. Record input/output/config/dataset/evaluator/prompt hashes, model identity, time, token usage and latency. Missing costs are null, never zero or borrowed from another run. Output files are exclusive-create and input validation precedes model calls. Each run records independently failed evaluators.
6. Same evidence and fixed evaluator model/settings for both variants. Each evaluator consumes the source draft, never the other evaluator's score. Additional requirement inputs to the custom evaluator are disclosed. These are complementary measures, not interchangeable scores or independent truth oracles.
7. Human review is a separate artifact with labels bound to dataset, case and output hashes. AI-generated expectations are `AUTHORED_EXPECTATION`, never human labels. Blind review packets omit automatic scores. Validation reports binary supported/not-supported agreement where appropriate, defect recall, false positive rate, evaluable coverage and counts; no zero-denominator success.
8. Use 30 distinct scenario groups; keep all output variants/repetitions of a group in one partition. Holdout does not train prompts or thresholds. After inspecting holdout, changing the policy requires a new holdout version. Mock generation uses equal baseline/candidate responses and proves plumbing only.
9. First measured experiment varies only the instruction policy, keeping the generator model fixed. A small smoke precedes larger repetition batches. Call bounds, concurrency, timeout and explicit spend flag are mandatory. Price schedules are explicit metadata if available; usage survives without them. Model failures remain in coverage counts.
10. Console receives bounded typed summaries containing safe display case keys, numeric scores/counts, policy versions and allowlisted reason codes. Raw source/draft/judge payloads stay in local project reports. A configured report must match its selected project scope and be labelled recorded TEST evidence; no implicit live attribution, stage metric merge or provider federation. The fixed demo consumes a disclosed synthetic summary with no network or database dependency.

## End-to-end flow

Dataset and requirements -> saved baseline/candidate draft artifact -> Ragas adapter and domain rubric -> evaluation artifact -> blinded human review -> calibration and paired report -> safe exported summary -> Console comparison.

Full local evidence report contains synthetic input, draft text, exact reasons and review status. Console shows two labelled panels, case selection, baseline/candidate values, missing/error states, source disclosure and metric definitions; never an averaged quality badge.

## Phases, dependencies, changes and tests

| ID | Depends on | Deliverable / files | Acceptance / verification |
|---|---|---|---|
| P0 | none | This plan; press-workflow handoff scope; Console ADR/master-plan note before UI changes | All P0-P6 decisions fixed before source implementation |
| P1 | P0 | `domain/press-workflow/evaluation/` contracts, policy and tests; `evals/press-workflow/dual/v1/` dataset | 30 unique groups, 20/10 split, source roles, expected result provenance, no overlap, strict sizes/unknown fields |
| P2 | P1 | `lib/services/press-workflow/evaluation/` dual evaluator; `scripts/press-workflow/ragas/` Python adapter | Official Ragas smoke; semantic schema/quote validation; timeout, empty context/output, judge failure, nonfinite score and partial-result tests |
| P3 | P2 | Project batch CLI and report generation under `scripts/press-workflow/`; npm scripts; append-only outputs in ignored `runs/` | Same draft hash for both evaluations; no calls on invalid input or existing output; deterministic mock disclosure; reusable saved drafts |
| P4 | P3 | Human review packet and calibration/comparison functions | No synthetic/human substitution, reject duplicate/mismatched/stale labels, all denominators and pending state visible; paired matching and holdout freeze |
| P5 | P3 | Console safe contract, bounded offline report reader, comparison component, Test & verify / fixed demo integration | Strict unknown-field rejection, no raw payloads/provider calls, no cross-repo imports, no score averaging; ko/en, desktop/mobile, error/empty/demo/measured states |
| P6 | P4,P5 | Measured smoke, paired experiment where configured, reviewed report, docs and evidence | Actual measurements tagged accurately; human review remains pending if missing; repository checks and browser QA; no deployment action |

Implementation checklist in `D:/workspace/.agent-work/dual-evaluation` splits the phases into serial items; ownership is temporary there, not in permanent source.

## Boundary changes and integration

The current PressTuner handoff excluded Console and shared UI. This authorized follow-up expands only to the isolated evaluation CLI/service/contracts, npm scripts, documentation, and Console's read-only evidence display. No billing, authentication, Prisma, scheduler, production finalization or general workflow builder changes are needed.

Existing Console requirement observations carry score plus mandatory PASS/WARN/BLOCK semantics. Faithfulness alone has no calibrated threshold, so do not force it into a requirement verdict. Add an independent strict evaluation-summary contract and read-only configured artifact adapter instead, documented by ADR. Keep existing primary stage denominators and process definitions unchanged. Unknown/mismatched configured reports are unavailable, not demo fallbacks. Registered filesystem I/O remains in live-infrastructure.

## Verification plan

PressTuner: existing `test:press-workflow`, new evaluation unit/CLI tests, Python adapter contract tests, `typecheck:press-workflow`, scoped lint, required repository lint/build. Reuse the production article generator. Test missing credentials and no-spend mode before live calls.

Console: strict contract tests, application/adapter tests, component tests for missing and partial data, architecture tests, typecheck, lint, build, and browser comparison at desktop and 390px. Run required existing tests appropriate to the changed boundary; PostgreSQL/live checks require their actual environment and cannot be reported passed from skipped suites.

Runtime: bundled Node 24.19.0 satisfies Console's >=20.19 requirement; PATH changes are per command. Python environment is isolated for Ragas. Do not update unrelated dependencies to hide baseline failures.

## Decision gates and risks

Human labels and actual model access are evidence prerequisites, not reasons to stop independent implementation. Prepare review-ready material before asking the human to label. Inspect configured secret presence without printing values. Never create reviewer signatures on the user's behalf. Full calibration/quality claims remain unverified until evidence exists.

Library result-detail availability is checked during P2. If official Ragas does not expose supported public claim details, retain its score and execution provenance; never invent claim-level explanations. Custom exact-span evidence remains available independently.

All changes remain local and reviewable. Final handoff records completed capabilities, commands/results, measured sample sizes, missing human evidence and exact rerun commands. Update this document before changing scope or evaluation semantics.

## Implementation audit, 2026-10-06

The evaluators, batch CLI, 30-group dataset, blind review form, calibration report, frozen-policy gate and independent Console summary/display are implemented. See `DUAL_EVALUATION_RUNBOOK.md` for commands.

Two generated development drafts and two authored development challenge drafts were evaluated with real model calls. These remain different evidence types. No holdout model calls have been made. No model-improvement or reliable-evaluator claim is established. At the user's request, their 10 actual labels and reasons were read directly from the form after its download did not work in the in-app browser. The checked human attestation and reviewer identity were preserved. Comparison: 3/5 comparable labels agreed;0/3 human-known defects detected; the other 5 automatic labels were unavailable. The pilot is EVALUATOR_REVIEW_REQUIRED, not ready for holdout.

The first pilot predates full generation-request capture. It retains input/config/output/evaluator hashes but cannot freeze a holdout policy. New artifacts also capture the exact request and resolved configuration. `freeze-policy` requires current implementation provenance and complete human review of development outputs. Holdout generation/evaluation rejects changed implementation, dataset, judge, prompt or generator identities. Freezing constrains reproducibility; it does not certify accuracy.

Defect recall includes human-known defects when the evaluator fails or abstains. Agreement has a separate comparable-judgment denominator. Completed responses retain measured usage even if validation fails; unknown usage stays null. No price schedule or dollar-cost result is claimed.

Browser inspection found a broken inline review script before labels were submitted. All source/draft text now renders as static HTML, with a script-syntax/escaping regression test. The user continues reviewing the same artifact. Desktop inspection also found overview flex shrinkage under the added report; the demo now gives the overview separate layout space with a desktop/mobile regression test.

Windows architecture helpers normalize path separators and CRLF without relaxing assertions. Linux deployment permissions/systemd tests are reported separately from evaluation feature checks.

Policy-freeze now rejects unresolved human/automatic disagreement, missing automatic judgments or uncertain human labels. This conservative readiness gate does not establish a universal accuracy threshold; the current pilot is stopped at evaluator review.
