# AI telemetry and evaluation control plane

PressTuner owns a vendor-neutral `ai-telemetry-event/v1` contract. A run is a trace, a domain node execution is a span, each edge guardrail is an independent evaluation, and user-controlled gates are approval events. The Press process registry remains the topology source of truth.

Canonical trace IDs are 32 lowercase hexadecimal characters and span IDs are 16. UUID-shaped runtime trace IDs are normalized by removing hyphens; incompatible or missing values are deterministically derived from tenant, run, and attempt identity. Event IDs are deterministic over durable source identity and lifecycle phase, so command replay and concurrent retries deduplicate at the database unique index. Sequence numbers are allocated under a per-team/trace transaction lock.

The validated full envelope is stored internally in `AgentRuntimeAuditEvent.details`; nullable duplicated columns support bounded ordered queries while legacy rows remain readable. Raw memo text, prompts, generated prose, provider bodies, credentials, and tenant/user identifiers are never included in Ops Console or OpenInference projections. Internal evidence is bounded and records a field, fact kind, normalized value, hash, match state, and reason code. External projections retain only field paths, hashes, counts, verdicts, and reason codes.

OpenInference vocabulary is a pure projection (`AGENT`, `CHAIN`, `GUARDRAIL`, and `EVALUATOR` span kinds plus `gen_ai.*` evaluation attributes). There is no OTLP exporter or telemetry SDK dependency. Ops Console uses `press-tuner-canonical-ai-telemetry` as the producer identity.

Replay events preserve parent attempt, saved case, and restored-checkpoint identity. Production traffic is not a CI dataset: deterministic fixtures are versioned under `evals/press-ai-debugger/`, validated against the process version and registry hash, and run through the same guardrail implementation.

Run `npm run eval:press-ai-debugger:ci` for JSON on stdout, or add `-- --output /tmp/press-ai-transition-evaluation.json`. Malformed fixtures, topology mismatches, release-blocking regressions, and unauthorized live requests exit non-zero after emitting valid JSON.
