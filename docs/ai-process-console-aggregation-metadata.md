# AI Process Console aggregation metadata

AI Process Console owns the canonical aggregation metadata registry. PressTuner owns the domain values, but it must not invent provider aliases or provider-specific identifier transforms.

## Binding rule

- Domain facts retain canonical camel-case fields such as `operationId`, `processId`, `processVersion`, `processDefinitionHash`, `attemptId`, and `nodeId`.
- LangSmith and PostHog receive only the Console registry projection represented by `domain/ai-process-console/v1/vendorMetadataContract.ts`.
- High-cardinality internal identifiers use `HMAC_SHA256`; public bounded dimensions use `PLAIN`; restricted fields use `OMIT`.
- The shared `AI_PROCESS_CONSOLE_VENDOR_METADATA_HMAC_KEY` is server-only, independent of fact-transport authentication secrets, and must be identical in the PressTuner producer and Console read adapter.
- A missing projection key disables vendor correlation fail-open. It must never fall back to a raw internal identifier.

The active RAG aggregation dimensions are `project_id`, `environment`, `service_name`, `case_id`, `object_type`, `operation_id`, `attempt_id`, `correlation_id`, `process_id`, `process_version`, `process_hash`, `execution_mode`, and `node_id`. Custom aliases such as `workflow_id`, `workflow_version`, and `stage_id` are prohibited.

Provider-native observation fields are not canonical aggregation metadata. LangSmith run status, timing and token fields, and PostHog's `outcome` value remain provider-owned observations that the Console normalizes into bounded summaries.

The browser `ai_operation_outcome` event is emitted only when the server returned the Console-projected `project_id`, `environment`, `service_name`, and HMAC `operation_id`. This is required because the MeerkatHQ PostHog provider project is shared by multiple products; `$host` is not an aggregation authority. Console queries bind `project_id=presstuner` before correlating operation outcomes.

## Update procedure

When AI Process Console changes `packages/contracts/src/v1/metadata-registry.ts`, update the project adapter snapshot and its projection tests in the same integration change. A breaking registry change requires a new side-by-side contract version; do not silently reinterpret retained v1 data.
