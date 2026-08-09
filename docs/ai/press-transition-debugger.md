# Press transition debugger

`/demo/rag-test` is a fixed five-node transition debugger, not a general workflow builder. The server owns node input/output contracts, required capabilities, the five compatible edges, payload adapters, and mandatory guardrails. A case can only enable a subset of those registered edges and choose a rewrite iteration limit from 1 through 5.

## Immutable execution snapshots

Every attempt pins the process version, registry hash, executor version, case revision, topology, edge-scoped custom guardrails, run input, and optional capture input. Editing a saved case never changes an existing attempt. Repeated review/rewrite checkpoints use `(nodeId, iteration)` identity; the first rewrite is iteration 1 and the looped review keeps that iteration.

Saved-case rerun creates a fresh `PRESS_RELEASE` Article, starts at the captured node, restores only checkpoints before the exact captured checkpoint, and recursively replaces the source Article ID in run input, capture input, and restored checkpoint inputs/outputs. The restored rows retain their original process identity and point back to their source checkpoints.

## Semantic evaluation lifecycle

Custom natural-language guardrails are evaluated once per transition in a bounded batch. Staging atomically records a PENDING command and batch. A worker claims the batch with an expiring lease, commits, calls the model without an open database transaction, then finalizes only if its lease token is still current. Result IDs have strict one-to-one cardinality with the snapshotted guardrails. Missing, duplicate, extra, malformed, refused, timed-out, or failed results become `NOT_EVALUABLE` and block advancement.

Reevaluation is allowed only for an unadvanced transition whose latest custom evaluation contains `NOT_EVALUABLE`. It creates a new batch and observation revision; prior results remain immutable. A late worker from an expired lease cannot overwrite the current revision. Provider calls may repeat after a crash and lease expiry, but durable completion is guarded by the lease and unique `(transition, evaluationRevision)` identity.

## Case editing and loop behavior

Topology, guardrail add/update/delete, rerun, and reevaluation commands require a `commandId` and `expectedRevision`. Reusing a command with different content conflicts, and stale revisions conflict. Custom guardrails are attached to enabled compatible edges with `WARN` or `BLOCK` severity. Mandatory guardrail IDs cannot be changed through case APIs.

After a selected rewrite, the operator explicitly chooses either `review again` or `finish`. Review again follows the registered `rewrite-review` edge; the server enforces the pinned maximum under the attempt lock. `NOT_EVALUABLE` has its own UI treatment and never permits advancement.

## Telemetry and privacy

Each evaluation revision receives a deterministic but distinct canonical event identity. Semantic instructions, source/output content, and raw model messages are not stored in producer facts or OTLP attributes. Persistence keeps parsed statuses/reasons plus bounded token and estimated-cost metadata. The deterministic v2 fixtures cover all five edges; v1 remains historical evidence.
