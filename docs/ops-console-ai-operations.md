# Ops Console AI operation integration

## Checkpoint debugger: one authoritative path

The real `/demo/rag-test` checkpoint-attempt service publishes immutable `presstuner-debug-run/v3` snapshots. The checkpoint attempt UUID is the Ops Console `operationId`; PressTuner owns topology, lifecycle, retry, human-gate, requirement applicability, reachability, evaluability, and verdict meaning. Each of the eight observations carries the canonical workflow scope `{ kind: "WORKFLOW", workflowId: "presstuner.press-creation", workflowVersion: "2.0.0" }`. Ops Console independently validates the complete scoped roster, stores, counts, and visualizes the snapshots but does not reevaluate requirements.

The boundary is an allowlist. It contains fixed workflow/process identity, registry topology, lifecycle timestamps/states, and exactly eight producer-owned requirement observations. Outcomes are `EVALUATED`, `NOT_EVALUABLE`, `NOT_REACHED`, or `NOT_APPLICABLE`; only fixed reason codes cross. Critical-fact evidence crosses only as NUMBER/DATE/QUOTE/CONSTRAINT counts and SHA-256 hashes. Memo, brief, article, evaluator prose, expected/observed values, prompt, provider payload, raw evidence values, team ID, and user ID never cross.

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

## Compatibility behavior

PressTuner and Ops Console retain explicit strict v1 and v2 parsers alongside v3. Pending v1/v2 outbox records remain deliverable unchanged, and stored historical snapshots remain readable without migration. A v1-only operation contributes to requirement trends as “observation not delivered”; Ops does not invent the seven observations v1 did not carry. Roll out Ops Console v3 parsing and failure-trends v2 serialization before enabling PressTuner v3 delivery. To roll back the emitter, set `OPS_CONSOLE_PRESSTUNER_DEBUG_ENABLED=false` or revert only new emission to v2; keep Ops Console v3 support deployed so stored v3 rows remain readable.

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
Stored JSON is parsed through the strict v1/v2/v3 snapshot union and the newly
created run must resolve to v3. Successful output contains only schema version,
requirement count, canonical-scope confirmation, route confirmation, and
privacy status. It never prints the attempt ID, application or database URLs,
memo text, snapshots, team/user identity, or caught database/HTTP bodies.
