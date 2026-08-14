# AI Process Console producer adapter

The adapter is the opt-in network boundary around PressTuner's strict v1 producer. It adds authenticated fixture-command ingress, signed TEST and LIVE EventV1 delivery, protected producer-health evidence, delivered-fact retention, and a one-shot worker. It does not change the manifest, process definitions, policies, fixtures, project authority, or console-owned connection state.

## Direction and authority

The two directions have distinct identities and credentials:

| Direction | Destination identity | Credential |
|---|---|---|
| Console → PressTuner fixture command and health probe | `presstuner.ai-process-console.test-run.v1` | inbound HMAC secret |
| PressTuner → console EventV1 intake | `presstuner.ai-process-console.fact-ingest.v1` | outbound HMAC secret |

Only the outbound identity is present in the server-side destination registry. It resolves to exactly one configured fact-ingest URL. The inbound manifest identity cannot resolve to that URL, and request callers cannot supply a destination, URL, handler, node, transition, fixture text, callback, or production mutation action.

PressTuner remains authoritative for command validation, fixture resolution, real workflow execution, commits, receipts, fact creation, and delivery ordering. Mapped real `rag-query@1.0.0` events enqueue with their LIVE facts in one transaction; delivery occurs after authoritative commits and remains fail-open. The console must deduplicate by `(source, event ID)` because parallel or retried delivery is at least once.

## Server configuration

No adapter setting may use a `NEXT_PUBLIC_*` name.

| Variable | Default and rule |
|---|---|
| `AI_PROCESS_CONSOLE_ADAPTER_ENABLED` | Only literal `true` enables ingress, delivery, and retention. Missing or `false` is rollback-disabled. |
| `AI_PROCESS_CONSOLE_DESTINATION_URL` | Required when enabled; exact fact-ingest URL. Credentials, query strings, and fragments are rejected. |
| `AI_PROCESS_CONSOLE_INBOUND_HMAC_SECRET` | Required; independently generated and at least 32 UTF-8 bytes. |
| `AI_PROCESS_CONSOLE_OUTBOUND_HMAC_SECRET` | Required, at least 32 UTF-8 bytes, and different from the inbound secret. |
| `AI_PROCESS_CONSOLE_VENDOR_METADATA_HMAC_KEY` | Required for LangSmith/PostHog correlation; independently generated, server-only, shared with the Console provider read adapter, and never reused as either transport secret. |
| `AI_PROCESS_CONSOLE_HTTP_TIMEOUT_MS` | `3000`; integer range `100..30000`. |
| `AI_PROCESS_CONSOLE_AUTH_MAX_SKEW_SECONDS` | `300`; integer range `30..900`. |
| `AI_PROCESS_CONSOLE_FLUSH_BATCH_SIZE` | `50`; integer range `1..500`. |
| `AI_PROCESS_CONSOLE_DELIVERED_RETENTION_DAYS` | `30`; integer range `7..3650`. |
| `AI_PROCESS_CONSOLE_RETENTION_BATCH_SIZE` | `250`; integer range `1..1000`. |
| `AI_PROCESS_CONSOLE_PENDING_DEGRADED_AFTER_SECONDS` | `900`; integer range `60..86400`. |

Production destinations require HTTPS. In non-production environments, HTTP is allowed only for the exact loopback hosts `localhost`, `127.0.0.1`, and `[::1]`, solely for local two-service integration. Non-loopback HTTP fails closed in every environment.

Configuration results and CLI output contain only bounded validity/status codes. They never include endpoints, URLs, credentials, request bodies, fact payloads, or exception text.

## HMAC wire protocol

Both routes and outbound fact delivery use HMAC-SHA256 with these headers:

```text
X-Ai-Process-Timestamp: <Unix seconds>
X-Ai-Process-Signature: v1=<lowercase 64-character hex HMAC>
```

The signed bytes are:

```text
AIPC-HMAC-SHA256-V1
<timestamp>
<UPPERCASE_METHOD>
<exact URL pathname>
<SHA-256 hex of exact raw body bytes>
```

Query strings are rejected. `GET /api/internal/ai-process-console/v1/health` signs an empty body. `POST /api/internal/ai-process-console/v1/test-runs` authenticates the raw request bytes before UTF-8 decoding or JSON parsing; callers must sign the bytes they actually transmit and must not reserialize afterward. Old and excessively future timestamps are rejected using the configured symmetric skew window. Every authentication failure returns `401 REQUEST_AUTHENTICATION_FAILED`.

Interoperability vector for testing only:

```text
secret: 0123456789abcdef0123456789abcdef
timestamp: 1893456300
method: GET
pathname: /api/internal/ai-process-console/v1/health
body: <zero bytes>
body SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
signature: v1=ba107166fa8d33a60ef20e007df9b41f48505fb5afba3b22dbdfe136bd8a8a7f
```

The vector secret is public test material and must never be deployed.

## Routes and responses

`POST /api/internal/ai-process-console/v1/test-runs` accepts at most 64 KiB with `application/json`. Authenticated JSON is passed unchanged to the strict fixture service. `SUCCEEDED`, fixture `FAILED`, and service `REJECTED` results return HTTP 200 because they are bounded domain outcomes. Changed-body reuse of a command ID returns `409 COMMAND_REUSE_CONFLICT`. Boundary errors are `400 REQUEST_INVALID`, `401 REQUEST_AUTHENTICATION_FAILED`, `413 REQUEST_TOO_LARGE`, `415 JSON_REQUIRED`, `503 ADAPTER_UNAVAILABLE`, or `500 TEST_RUN_REQUEST_FAILED`. No exception text is returned.

`GET /api/internal/ai-process-console/v1/health` is authenticated and always sends `Cache-Control: no-store`. Its response is:

```json
{
  "schemaVersion": "presstuner-ai-process-producer-health/v1",
  "readiness": "READY",
  "configuration": { "valid": true, "code": "VALID" },
  "pendingCount": 0,
  "deadLetterCount": 0,
  "oldestPendingAgeSeconds": null,
  "lastSuccessfulDeliveryAt": null,
  "reasonCodes": []
}
```

`READY` returns 200. `DEGRADED` and `NOT_READY` return 503. Disabled/invalid configuration and failed database evidence are `NOT_READY`; dead letters or a pending age strictly above the threshold are `DEGRADED`. A young pending fact is normal. An empty backlog with no prior delivery remains `READY` with a null watermark, which is readiness evidence—not connectivity evidence.

## Fact delivery mapping

The adapter serializes the strict EventV1 object as canonical compact JSON, signs those exact bytes, uses a bounded timeout, disables automatic redirect following, and never reads or logs the response body.

| Console response | Result |
|---|---|
| Any 2xx, including 208 | delivered |
| 409 with exact `X-Ai-Process-Result-Code: DUPLICATE_EVENT` | delivered |
| 401/403 | permanent `AUTHENTICATION_FAILED` |
| 400/413/415/422 | permanent `CONTRACT_INVALID` |
| Other 409 | permanent `SEQUENCE_CONFLICT` |
| 408 or local abort | retryable `TRANSPORT_TIMEOUT` |
| 425/429 | retryable `CONSOLE_THROTTLED` |
| 5xx | retryable `CONSOLE_UNAVAILABLE` |
| Network exception | retryable `TRANSPORT_FAILED` |
| Other 3xx/4xx | permanent `HTTP_REJECTED` |

## Worker, retention, and deployment

Apply the additive migration only after reconciling the target deployment's actual Prisma migration history. It creates `ai_process_producer_delivery_watermark`, backfills it from delivered outbox rows, and adds source/state/time indexes. The watermark stores only source and last successful delivery time.

Run one cycle with:

```bash
npm run ai-process-console:worker
```

The cycle validates configuration, flushes pending facts, deletes eligible delivered facts, then reads health—in that order. Schedule it approximately once per minute with no overlapping invocation. The repository deliberately does not choose or install a production runner; operators may use systemd, container cron, or a platform scheduler. Enabled invalid configuration exits 1. Disabled configuration and delivery, retention, business, or health failures exit 0 with bounded evidence, so monitoring must inspect the JSON health/readiness output and the protected route rather than process exit alone.

Retention deletes at most the configured batch of rows that match the exact v1 source, are `DELIVERED`, have a non-null `deliveredAt`, and are strictly older than the cutoff. It rechecks all predicates during deletion. It never purges pending facts, dead letters, test-run receipts, or delivery watermarks. The seven-day minimum is enforced. Deletion is irreversible; keep operational retention disabled by leaving the entire adapter disabled until the window is approved.

For a deployment probe, generate the two HMAC headers over the exact empty GET body and request the health route without a query string. Never print the secret or persist signed request bodies in probe logs. Clock synchronization must keep both services within the configured skew.

## Rollback and console-owned connection state

Application rollback is non-destructive:

1. Set `AI_PROCESS_CONSOLE_ADAPTER_ENABLED=false`.
2. Stop the one-shot schedule.
3. Stop console command calls, or expect `503 ADAPTER_UNAVAILABLE`.
4. Preserve receipts, outbox rows, dead letters, delivered facts, and watermark evidence.
5. After traffic stops, rotate or revoke both directional credentials.

Do not couple rollback to a down migration. Already-retained fact payloads can be recovered only from a backup.

PressTuner defines only `READY`, `DEGRADED`, and `NOT_READY`. It never emits or persists `CONNECTED`. The standalone console may claim `CONNECTED` only after its own registration is active, authenticated command/health probes succeed, credentials and clock are valid, and durable event intake/deduplication is observed according to console-owned policy.
