# Ops Console AI operation integration

## Checkpoint debugger: one authoritative path

The real `/demo/rag-test` checkpoint-attempt service publishes immutable `presstuner-debug-run/v1` snapshots. The checkpoint attempt UUID is the Ops Console `operationId`; PressTuner owns topology, lifecycle, retry, human-gate, and guardrail meaning. Ops Console independently validates, stores, and visualizes the snapshots but does not import PressTuner code or reevaluate guardrails.

The boundary is an allowlist. It contains fixed process identity, registry topology, lifecycle timestamps/states, and only the `critical-fact-preservation` evaluation. Fact evidence crosses as NUMBER/DATE/QUOTE/CONSTRAINT counts and SHA-256 hashes. Memo, brief, article, prompt, provider payload, raw evidence values, team ID, and user ID never cross.

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
