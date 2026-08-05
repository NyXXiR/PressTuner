# Ops Console AI operation instrumentation

Press Agent v2 registers one privacy-safe operation with Ops Console, carries
the same UUID into LangSmith, and emits matching terminal browser outcomes to
PostHog and GA4. The workflow identity is `presstuner.press-agent` with the
runtime's existing `PRESS_AGENT_VERSION`.

## Server configuration

Configure these variables only in the server deployment environment:

```dotenv
OPS_CONSOLE_AI_OPERATIONS_URL=https://ops-console.example.com
OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY=<project-write-key>
OPS_CONSOLE_AI_OPERATIONS_ENVIRONMENT=production
OPS_CONSOLE_AI_OPERATIONS_TIMEOUT_MS=3000
LANGSMITH_API_KEY=<trace-and-feedback-write-key>
LANGSMITH_PROJECT=<project-name>
LANGSMITH_PROJECT_ID=<same-project-uuid>
LANGSMITH_WORKSPACE_ID=<workspace-uuid-if-required>
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
LANGSMITH_TIMEOUT_MS=3000
```

`OPS_CONSOLE_AI_OPERATIONS_URL` is the Ops Console origin, not the producer API
path. The timeout is optional and is bounded to at most 10 seconds. A missing or
invalid URL, write key, or environment disables registration without changing
the Press Agent result. Never use a `NEXT_PUBLIC_` variable for the URL or write
key.

The LangSmith bridge uses the official SDK independently of the OpenAI Agents
SDK trace. It writes one root run to the configured project for each initial or
continued execution, plus privacy-safe child runs for retrieval, evidence
decision, response behavior, verification, and fallback when that path runs.
`LANGSMITH_PROJECT_ID` must be the UUID of the same project named by
`LANGSMITH_PROJECT`; an absent or invalid UUID disables feedback only, while
tracing remains enabled. The workspace ID is optional for a key scoped to a
single workspace; set `LANGSMITH_WORKSPACE_ID` only when the key requires it.

Configure these six organization feedback keys as continuous scores from 0 to
1, with `isLowerScoreBetter: false`:

```text
rag.retrieval.evidence_use.v1
rag.retrieval.tool_execution.v1
rag.abstention.evidence_decision.v1
rag.grounded_answer.citation_presence.v1
rag.grounded_answer.claim_verification.v1
rag.abstention.verification_fallback.v1
```

Each configuration uses this shape:

```ts
{
  feedbackConfig: { type: "continuous", min: 0, max: 1 },
  isLowerScoreBetter: false,
}
```

PressTuner supplies deterministic binary root feedback for these keys (`1` is
pass and `0` is violation). Do not attach an online code evaluator or
LLM-as-judge evaluator using the same keys, because that duplicates samples.
See the [SDK feedback documentation](https://docs.langchain.com/langsmith/attach-user-feedback)
and [feedback configuration documentation](https://docs.langchain.com/langsmith/annotation-queues-sdk).

Configure the consuming Ops Console with the same exact allowlist:

```dotenv
OPS_LANGSMITH_QUALITY_METRIC_IDS=rag.retrieval.evidence_use.v1,rag.retrieval.tool_execution.v1,rag.abstention.evidence_decision.v1,rag.grounded_answer.citation_presence.v1,rag.grounded_answer.claim_verification.v1,rag.abstention.verification_fallback.v1
```

The browser event names have safe defaults and may be overridden at build time:

```dotenv
NEXT_PUBLIC_OPS_CONSOLE_POSTHOG_OUTCOME_EVENT=ai_operation_outcome
NEXT_PUBLIC_OPS_CONSOLE_GA4_BUSINESS_EVENT=presstuner_ai_operation_business
POSTHOG_PROJECT_API_KEY=<matching-project-ingestion-token>
POSTHOG_HOST=https://us.i.posthog.com
```

Overrides must be lowercase analytics identifiers containing only letters,
digits, and underscores. Invalid overrides fall back to the defaults.
The PostHog ingestion token must belong to the same project queried by Ops
Console. Because Next.js includes this public token in the built client config,
changing it requires a new production build rather than only a process restart.

## Lifecycle and privacy boundary

After the durable `AgentRun` exists and before the first model call, the server
generates a UUID and registers it through the Ops Console v1 producer contract.
Only a successful registration is persisted in the private `AgentRun.input`
JSON and exposed to the browser as the top-level `operationId`. No Prisma
migration is required.

The producer payload contains only:

- the operation UUID and fixed workflow identity;
- the configured environment;
- SHA-256 pseudonyms of the team and user IDs; and
- lifecycle timestamps.

Prompts, article content, raw team/user IDs, credentials, provider response
bodies, and arbitrary metadata are excluded. LangSmith root metadata contains
only the operation UUID, workflow ID/version, environment, and lifecycle phase.
Root inputs and outputs contain only the phase and terminal status. Child runs
contain stable stage IDs and allowlisted counts, statuses, policy codes, reason
codes, and decision hashes. Prompts, generated text, source text, chunks,
document names, source IDs, claims, quotes, team/user IDs, and arbitrary
metadata are never sent.

Verified `COMPLETED` and terminal `FAILED` runs are completed best-effort in Ops
Console. Waiting-for-approval runs remain open. Cancellation also closes the
operation. Continuation and retry reuse the stored UUID. Provider failures are
reduced to safe codes and never replace the user-visible Agent result.

When the browser first observes a terminal run in a session:

- `COMPLETED` emits PostHog `accepted` and GA4 `conversion` with the same
  `operation_id`;
- `FAILED` emits PostHog `abandoned` only; and
- session storage prevents duplicate emission of the same operation/outcome
  pair during refresh or repeated API observations.

The existing PostHog client adds `origin_project=briefflow`, which must match
Ops Console's private live-proof scope mapping.

## Deployment and real-provider proof

Automated tests prove request shape, privacy constraints, timeout/failure
isolation, runtime propagation, and browser schemas. A genuine four-source
proof additionally requires the instrumented PressTuner build to be deployed
and one real Press Agent run to reach a terminal state.

After that run:

1. Copy its UUID, `presstuner.press-agent`, current workflow version, tenant
   pseudonym, environment, and a narrow half-open UTC window into Ops Console's
   private `.env.ai-operations` file. Do not copy the prompt or any secret.
2. Set the private PostHog event scope to
   `OPS_POSTHOG_EVENT_SCOPE_PROPERTY=origin_project` and
   `OPS_POSTHOG_EVENT_SCOPE_VALUE=briefflow`.
3. Run the Ops Console live preflight. Allow for PostHog/GA4 delivery lag, then
   run `npm run ai-operations:live:verify` with secrets supplied only through
   the process environment.
4. Record the verifier result separately from the build evidence.

To roll back without a database change, unset either server URL or write key.
New runs will not persist or emit an operation UUID, while Press Agent remains
available. Removing the client/helper imports and calls fully removes the
instrumentation.
