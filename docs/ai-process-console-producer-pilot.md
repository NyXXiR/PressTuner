# AI Process Console producer pilot

PressTuner is a conformance-ready producer for the standalone AI Process Console v1 contract. It publishes local artifacts, accepts one fixture-only command for `press-creation@2.1.0`, and records privacy-safe past-tense facts in a transactional outbox. Real Press Agent `rag-query@1.0.0` workflow events also enqueue LIVE facts. The network adapter remains dormant by default: an opt-in authenticated HTTP adapter can expose the fixture service and deliver pending facts, but neither the producer nor the adapter may be described as `CONNECTED` by PressTuner.

## Contract ownership and conformance anchor

The canonical contract and producer instrumentation packages are the private workspace packages `@ai-process-console/contracts` and `@ai-process-console/project-sdk`, both version `0.1.0`, in `/home/nyxxir/ai-process-console`. PressTuner keeps a local v1 mirror because those packages are not consumable versioned dependencies. There is no runtime or build import from the sibling repository.

The AI Process Console repository owns v1 contract evolution. PressTuner changes its mirror only after comparing the canonical schemas, resolver behavior, SDK serialization, focused contract tests, and checked artifacts. The conformance baseline Git anchor is `8826b60` (`feat: establish AI Process Console v1 baseline`).

## Authority boundary

PressTuner remains authoritative for the `press-creation@2.1.0` and `rag-query@1.0.0` topologies, handlers, workflow events, transition meaning, fixture ownership, product state, and transaction boundaries. The console may supply only `dev.aiprocess.command.test-run.requested.v1` for the existing project-owned `press-creation` fixtures. The dormant service has no caller-selected callback, destination, URL, host, credential, handler, node, transition, or mutation action. The optional server-only HTTP boundary is documented in [AI Process Console producer adapter](./ai-process-console-producer-adapter.md); none of its deployment configuration is published in v1 artifacts.

The production debugger paths remain unchanged:

- frozen `presstuner-debug-run/v1-v4` snapshots and `press_tuner_debug_snapshot_outbox`;
- canonical AI telemetry and OTLP export;
- Ops operation registration;
- LangSmith and PostHog projections.

The generic `ai_process_fact_outbox` is separate from the Ops snapshot outbox. It stores strict AI Process Console v1 events and does not reinterpret or migrate snapshot payloads. A mapped real workflow event and its LIVE outbox fact are committed in the same Prisma transaction; failure to enqueue the fact rolls back that new authoritative workflow event. Network delivery still occurs after commit and remains fail-open.

## Published artifacts

The checked files under `integrations/ai-process-console/v1/` contain the project manifest, both process definitions, and the content-free memo-source policy. Synthetic fixture definitions remain unchanged under `evals/ai-process-console/press-creation/2.1.0/`.

Both process definitions are generated from `domain/press-ai-debugger/processRegistry.ts`, sorted by registry sequence. `press-creation@2.1.0` contains exactly five nodes and four transitions. `HUMAN_GATE` describes its post-handler checkpoint; guardrail and human decisions remain transition semantics through project-owned `decisionRef` values. No synthetic `DECISION` node is added to that fixture process. The frozen `rag-query@1.0.0` definition contains its existing seven nodes and seven edges; publication does not change runtime topology.

Definition hashing deliberately excludes the self-referential `canonicalSha256` field:

1. Canonicalize the definition object without `canonicalSha256` by recursively sorting object keys and using compact JSON.
2. Compute lowercase SHA-256 over those UTF-8 bytes.
3. Inject the digest as `canonicalSha256`.
4. Reuse that digest in the manifest descriptor and definition artifact reference.

Generate or verify artifacts with:

```bash
npm run ai-process-console:artifacts
npm run ai-process-console:artifacts:check
```

`--output-dir <directory>` may be passed directly to `scripts/exportAiProcessConsoleArtifacts.ts` for a disposable comparison directory.

## Real LIVE fact projection and trusted correlation

Each newly persisted real Press Agent public workflow event is projected additively into the strict v1 fact contract when that event has an unambiguous representation. Run start/finish, executable stage lifecycle, selected transitions, and explicitly not-taken transitions are represented. Waiting/skipped stages and moving/blocked edges do not invent terminal or evaluator meaning. Node duration is present only when the same public event history contains a prior running event for that node.

LIVE facts use the Agent run ID for `caseId`, `correlationId`, and `attemptId`, and retain the original public workflow event UUID as the fact ID. When `AgentRun.input.operationId` contains the already-issued validated operation UUID, that UUID is copied into canonical fact metadata as the shared join key used by existing LangSmith and PostHog observability. A missing or invalid operation ID remains absent. The stored Agent trace is attached as a LangSmith reference only when it passes the strict reference schema; no provider trace is generated by the projection.

The projection publishes only process/node/transition identity, fixed finding codes, timestamps, sequence, and safe correlation metadata. It never copies prompts, model output, retrieved source bodies, provider payloads, credentials, tenant/user identity, or the private `AgentRun.input` object. The public `PressAgentWorkflowEventV1` and audit-event details do not gain an `operationId` field.

## Injected command and fact ports

`createAiProcessTestRunService()` returns a transport-neutral `handle(value)` command service. It parses the strict command before invoking any fixture callback. The only optional delivery port is:

```ts
type AiProcessFactTransport = {
  deliver(fact: EventV1): Promise<
    | { status: "DELIVERED" }
    | { status: "RETRYABLE"; code: "TRANSPORT_TIMEOUT" | "CONSOLE_THROTTLED" | "CONSOLE_UNAVAILABLE" | "TRANSPORT_FAILED" }
    | { status: "PERMANENT"; code: "AUTHENTICATION_FAILED" | "CONTRACT_INVALID" | "SEQUENCE_CONFLICT" | "HTTP_REJECTED" }
  >;
};
```

When no transport is injected, facts remain pending and no delivery is attempted. Delivery happens only after commit and exceptions are fail-open. This fail-open policy applies to delivery, not same-transaction LIVE fact enqueue. Contract, authentication, and sequence failures dead-letter immediately. Other failures use capped exponential retry and dead-letter after eight attempts. Delivery is monotonic per attempt; a failed earlier event pauses later events in the same stream.

## Isolation and privacy

Only the three checked, versioned synthetic fixtures are resolvable. Unknown artifacts return `FIXTURE_NOT_FOUND`; saved-case locators return `ISOLATION_UNAVAILABLE`. Saved debugger cases are excluded because their current retry flow mutates tenant-coupled state. Supporting them requires a future authenticated copy-to-isolated-workspace adapter.

An accepted run creates a disposable project-owned team, inactive user, membership, article, run, and checkpoint attempt. AI dependencies are deterministic. Only fixture-owned gate acknowledgements are made. Cleanup validates the disposable identity prefix and removes the tenant after success or failure. Isolation establishment failure is a rejection; cleanup failure terminally fails the receipt and never falls back to an existing tenant.

Receipts retain only command identity/hash, test-run and correlation identity, resolved process identity when known, safe fixture artifact identity, state, and fixed error codes. They never retain team/user identity or fixture text. Facts omit actors, tenant identity, raw memo/draft text, summaries, links, provider records, and prose evidence. Internal claims and evidence are represented only by SHA-256 and bounded artifact references. A recursive denylist rejects raw-content, credential, and network-location keys before persistence.

Commands and facts retain the legacy `trace` field and may add `observabilityReferences`. Their effective set contains at most one technical LangSmith/OpenTelemetry reference and one PostHog window. Exact compatibility copies collapse; unequal references in the same category are `REQUEST_INVALID`; readers expose technical-then-PostHog order. Every PostHog carrier, including legacy `trace`, requires a nonempty half-open interval with `windowStart < windowEnd`.

Serialization matches the canonical SDK: technical-only uses `trace: technical`; PostHog-only uses `trace: posthog`; combined facts use `trace: technical` plus `observabilityReferences: [posthog]`. The fact factory resolves the effective set once, removes `link` from every persisted reference, and reconciles the effective technical trace/span IDs into canonical metadata. Vendor records and arbitrary network locations are never retained.

## Dormant pilot and adapter rollout

The pilot is safe to deploy without the adapter: artifacts are available, HTTP command handling returns unavailable, and outbox rows are not sent or retained automatically. The adapter adds directional authentication, compiled destination resolution, protected readiness evidence, delivered-row retention, and a one-shot worker without changing the v1 artifacts.

Rollback sets `AI_PROCESS_CONSOLE_ADAPTER_ENABLED=false`, stops the one-shot schedule, and stops console command calls. Existing receipts, pending/dead-letter facts, delivered facts, and delivery watermark evidence remain inspectable. Removing the additive tables requires a separate reviewed data-retention migration; do not couple that destructive action to application rollback.

Monitor pending/dead-letter counts, oldest pending age, and the delivery watermark before and after enabling the adapter. PressTuner exposes evidence only. The standalone console alone decides whether registration, authenticated probes, and observed delivery meet its `CONNECTED` criteria.
