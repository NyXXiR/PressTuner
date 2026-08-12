# Ops Console AI operation integration

## Checkpoint debugger: one authoritative path

The real `/demo/rag-test` checkpoint-attempt service publishes immutable `presstuner-debug-run/v4` snapshots for workflow `presstuner.press-creation@2.1.0`. The checkpoint attempt UUID is the Ops Console `operationId`; PressTuner owns topology, lifecycle, retry, human-gate, requirement applicability, reachability, evaluability, and verdict meaning. V4 requirement IDs are extensible and unique within their workflow scope. Ops Console validates and visualizes snapshots but does not reevaluate requirements.

The boundary is an allowlist. It contains workflow/process identity, transmitted registry topology, lifecycle timestamps/states, and safe workflow-scoped requirement observations. Outcomes are `EVALUATED`, `NOT_EVALUABLE`, `NOT_REACHED`, or `NOT_APPLICABLE`; only fixed reason codes cross. Critical-fact and evidence-consistency details cross only as counts and sorted capped SHA-256 references. The privacy denylist rejects raw subjects, project names, values, units, source/PDF text, draft text, memo, brief, evaluator prose, prompt, provider payload, team IDs, user IDs, and actor IDs. `privacy.contentExcluded` must be `true`.

The current evidence-consistency observation wire shape is:

```json
{
  "requirementId": "evidence-fact-consistency",
  "stageId": "verification",
  "edgeId": "draft-review",
  "display": {
    "label": { "ko": "근거 사실 일치", "en": "Evidence fact consistency" },
    "stageLabel": { "ko": "검증", "en": "Verification" },
    "edgeLabel": { "ko": "초안에서 리뷰로", "en": "Draft to review" }
  },
  "scope": {
    "kind": "WORKFLOW",
    "workflowId": "presstuner.press-creation",
    "workflowVersion": "2.1.0"
  },
  "outcome": { "state": "EVALUATED", "verdict": "BLOCK", "evaluatedAt": "2026-08-12T00:00:00.000Z" },
  "details": {
    "kind": "EVIDENCE_FACT_CONSISTENCY",
    "counts": { "checked": 1, "matched": 0, "draftConflict": 1, "sourceConflict": 0, "notEvaluable": 0 },
    "riskCategoryCounts": { "NUMBER": 1, "PERIOD": 0, "DATE": 0, "PERSON": 0, "TITLE": 0, "DIRECT_QUOTE": 0, "OTHER": 0 },
    "documentRefs": ["sha256:<64-lowercase-hex>"],
    "factRefs": ["sha256:<64-lowercase-hex>"],
    "claimRefs": ["sha256:<64-lowercase-hex>"]
  }
}
```

The generic quality event carries identity and verdict only:

```json
{
  "kind": "quality",
  "metricId": "guardrail_verdict",
  "value": 1,
  "unit": "violations",
  "sampleCount": 1,
  "direction": "lower_is_better",
  "stageId": "verification",
  "guardrailId": "evidence-fact-consistency",
  "verdict": "violation"
}
```

Mappings are `PASS → pass`, `BLOCK → violation`, and no comparable evaluation → `not_evaluable`. Production verification registers `{ "type": "service", "reference": null }`, pseudonymizes only the tenant reference, and never sends a user/actor identifier. If a checkpoint attempt is related, its UUID is reused; otherwise a short-lived service operation is registered, reported, and completed.

Snapshots are queued in `press_tuner_debug_snapshot_outbox` in the same transaction as each authoritative attempt mutation. Delivery happens after commit with a three-second timeout and never changes command success. Exact state is deduplicated by content hash; `snapshotRevision` is independent from attempt revision so failure-only changes remain observable.

Configure only server-side values:

```dotenv
OPS_CONSOLE_AI_OPERATIONS_URL=https://ops-console.example.com
OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY=<project-write-key>
OPS_CONSOLE_AI_OPERATIONS_ENVIRONMENT=production
OPS_CONSOLE_PRESSTUNER_DEBUG_ENABLED=true
```

Failure behavior:

- missing configuration, timeout, network failure, and 5xx remain pending for bounded opportunistic retries;
- 401/403 becomes a configuration failure;
- 409 becomes an operator-visible delivery conflict;
- 422 becomes a terminal contract failure;
- all persisted errors are fixed safe codes, never response bodies.

Unset `OPS_CONSOLE_PRESSTUNER_DEBUG_ENABLED` to retain the default enabled behavior. Set it to `false` for rollback; pending rows remain recoverable and checkpoint execution continues.

## Compatibility and rollout

V1, v2, and v3 schemas remain strict and frozen at the eight-requirement `2.0.0` roster. The sender union parses v1-v4, pending legacy outbox JSON is delivered unchanged, and no historical row is migrated. New outbox rows are v4. Rollout is Ops-first: deploy Ops Console v1-v4 acceptance before enabling PressTuner v4 delivery. Fail-open behavior applies to disabled credentials, timeout, network failure, non-2xx responses, and serialization/delivery errors; none may change verification, retry, finalization, or checkpoint results.

Rollback is the server-side `OPS_CONSOLE_PRESSTUNER_DEBUG_ENABLED=false` switch. It disables only new delivery and preserves pending outbox rows. Keep Ops v4 parsing deployed so already stored v4 rows remain readable.

Existing Press Agent operation registration, guardrail events, completion, and content-free OTLP export remain internal compatibility behavior. They are unrelated to checkpoint snapshot delivery.

Generic producer capability negotiation, workflow-manifest registration, and execution-fact delivery are retired. PressTuner has no supported workflow/fact client or synthetic Ops test-data endpoint. Historical Ops workflow-definition and execution-fact rows remain read-only for trend history until the separate 180-day retention follow-up removes those tables.

## Verification

Run focused unit/integration gates first, then use disposable databases and authenticated local servers:

```bash
npm run verify:presstuner-debug-integration -- \
  --press-url=http://127.0.0.1:3003 \
  --ops-url=http://127.0.0.1:3012
```

The verifier requires `PRESS_QA_STORAGE_STATE` (an authenticated Playwright storage-state file) and `OPS_DATABASE_URL`. It exits nonzero unless the real debugger UI reaches the normalized-brief human gate, the same attempt is stored in Ops Console, critical-fact counts exist for all four kinds, and the stored JSON excludes the source memo plus configured identity sentinels.

The browser confirmation uses the authenticated `/ops/ai-operations` route.
The created attempt ID remains internal to the parameterized snapshot lookup.
Stored JSON is parsed through the strict v1/v2/v3/v4 snapshot union and the newly
created run must resolve to v4. Successful output contains only schema version,
requirement count, canonical-scope confirmation, route confirmation, and
privacy status. It never prints the attempt ID, application or database URLs,
memo text, snapshots, team/user identity, or caught database/HTTP bodies.
