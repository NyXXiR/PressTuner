# brieFFlow LangGraph runtime and observability goal

## Outcome

brieFFlow will add a Python and LangGraph candidate runtime that can plan,
retrieve evidence, verify claims, pause for human approval, and resume safely.
The candidate must be measurable against the existing OpenAI Agents SDK
runtime before it is allowed to serve production traffic.

The product outcome is not “use LangGraph.” The outcome is that an authorized
operator can answer, for every generated document:

- which workflow and configuration ran;
- which nodes, tools, retries, and human gates were traversed;
- which evidence supported or blocked the result;
- where a failure began and what happened downstream;
- how much latency and model cost the execution consumed; and
- whether the candidate improved quality without unacceptable operational
  regressions.

## Architectural boundary

```text
Next.js brieFFlow application
  - authentication, authorization, billing, product state
  - document, evidence, approval, and finalization source of truth
  - per-run product inspection
            |
            | versioned internal API + application operationId
            v
Python AI service
  - FastAPI and Pydantic boundary
  - LangGraph candidate orchestration
  - bounded routing, retry, interrupt, and resume
  - privacy-safe execution projection
            |
            +--> existing PressTuner retrieval and verification ports
            +--> LangSmith trace for graph debugging
            +--> Ops Console normalized execution evidence

Existing OpenAI Agents SDK runtime
  - remains the baseline until an evaluation gate authorizes a change
```

LangGraph state and provider traces are supplemental. PostgreSQL and the
existing application services remain authoritative for permissions, accepted
evidence, approvals, article versions, and final writes.

## Runtime contract

The application creates a UUID `operationId` before starting an execution. The
same identifier is propagated to the candidate runtime, LangGraph metadata,
LangSmith trace metadata, PostHog product outcomes, and the Ops Console
projection. Provider-specific trace IDs never become the correlation key.

The first candidate workflow is:

```text
intake
  -> plan
  -> retrieve approved internal evidence
  -> verify evidence sufficiency
       -> insufficient: stop without drafting
       -> sufficient: prepare a reviewable draft proposal
  -> human approval interrupt
       -> rejected: terminate without a write
       -> approved: return an apply request to the authoritative application
```

The AI service must never directly finalize an article in this phase. An
approved graph result is a request; the Next.js application must still enforce
team access, current article version, approval identity, verification state,
and mutation idempotency.

## brieFFlow run inspection

The administrator-facing run view should eventually show:

- workflow and configuration version;
- ordered node occurrences and transition types;
- status, latency, retry count, and bounded error code per node;
- retrieval query identity, candidate ranks, exclusion reasons, and selected
  source references;
- reranker identity and before/after ranks;
- claim-to-citation verification results;
- interrupt, approval, rejection, and resume events;
- input/output tokens, cost, and end-to-end latency; and
- a credential-free deep link to the supplemental provider trace.

It must not expose model chain-of-thought. It may expose structured decisions,
guard results, tool names, redacted input summaries, source references, and
verification evidence.

## Ops Console boundary

brieFFlow publishes only a privacy-safe, versioned projection. Ops Console owns
cross-project ingestion, normalized execution graphs, independent assertions,
root-issue derivation, baseline/candidate comparison, trends, and alerts.

Raw prompts, full graph state, document bodies, generated prose, direct user
identifiers, credentials, arbitrary tool payloads, and provider error bodies
must not cross this boundary. Missing evidence is represented explicitly; it
is never converted into an invented success or failure.

## Evaluation and promotion gate

The existing controlled-live dataset and Eval Harness remain authoritative.
The baseline and candidate run independently on the same approved cases. At a
minimum, promotion evaluates:

- retrieval Recall@5;
- citation precision and claim citation coverage;
- grounded-claim and unsupported-claim rates;
- answerability and abstention accuracy;
- conflict-detection accuracy;
- correct tool selection and tool execution success;
- workflow completion and human-gate correctness;
- retry and re-retrieval rate;
- quality delta before and after re-retrieval;
- P50/P95 latency, tokens, and cost; and
- useful-output retention and human edit rate.

No candidate is promoted from framework adoption alone. A candidate must have
reproducible provenance, independently measured cost, no regression in
authorization or human gates, and explicit human review of the gate result.

## Delivery phases

1. **Contract foundation:** deterministic LangGraph candidate, interrupt and
   resume, privacy-safe events, operation correlation, and focused tests.
2. **Existing capability adapters:** connect the candidate to PressTuner's
   scoped retrieval, evidence, verification, and approval services without
   duplicating their policies.
3. **Observability:** add LangSmith tracing and a brieFFlow run inspector, then
   publish normalized execution evidence to the Ops Console adapter.
4. **Controlled comparison:** execute baseline and candidate on approved
   datasets and expose quality, latency, and cost differences.
5. **Advanced research:** add bounded official-source research, actual BM25 and
   cross-encoder candidates only when evaluation identifies a measurable gap.
6. **Promotion:** use a feature flag and limited traffic after automated gates
   and explicit human authorization pass.

## Non-goals

- replacing pgvector with Qdrant without measured need;
- replacing the current TypeScript product or its database authority;
- running both OpenAI Agents SDK and LangGraph inside one execution;
- storing product truth only in LangSmith or another telemetry provider;
- exporting confidential content to Ops Console by default;
- live web crawling in the contract-foundation phase;
- Kubernetes, vLLM, or self-hosted model serving before a demonstrated
  workload requires them; or
- claiming production improvement from fixtures, replay, or framework choice.

## Phase-one acceptance criteria

- The candidate service starts without OpenAI, database, or LangSmith
  credentials.
- Request and response payloads are validated by Pydantic and versioned.
- The caller supplies a valid UUID operation identifier.
- One operation pauses at a LangGraph human interrupt and resumes using the
  same checkpoint identity.
- Rejection terminates without returning an apply request.
- Insufficient evidence terminates without requesting approval.
- Ordered execution events contain no prohibited prompt, document, content,
  credential, token, or direct-identity fields.
- Correlation metadata can be mapped to the Ops Console operation contract.
- Focused automated tests cover the successful, insufficient-evidence,
  rejected, invalid-input, and privacy-boundary paths.
