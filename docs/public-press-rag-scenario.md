# Public Press RAG scenario

`/demo/rag-test/scenario` is a login-free, ephemeral demonstration of the five-node Press AI checkpoint flow. It auto-mounts the controlled-synthetic [`evidence-fact-consistency.pdf`](/samples/press-ai-debugger/evidence-fact-consistency.pdf#page=1) descriptor into signed scenario state. The fixed evidence says the 2026 Bridge revenue is 200억원; the initial controlled draft says 360억원 and BLOCKs on the existing `draft-review` edge.

## Isolation boundary

- The static page calls only `/api/demo/press-rag-scenario/start` and `/api/demo/press-rag-scenario/command`.
- The public routes do not import authenticated Press services, Prisma, billing, customer quota, Article persistence, or telemetry persistence.
- Model calls occur only in the Node route through `pressRagScenarioOpenAi.server.ts`. The API key and signing secret are never returned.
- Run state is carried in a signed, 15-minute capability. The browser keeps the returned display state only in React memory; refreshing loses the displayed run.
- The browser cannot submit or replace the evidence descriptor. A retry changes only the controlled 360억원 value to 200억원; the child attempt PASSes while the parent BLOCK remains visible in lineage.
- The PDF, fixed document/chunk/page IDs, assessment counts, and hashes are deterministic. The scenario never writes customer knowledge, Article, billing, quota, or telemetry rows.

## Limits and deployment

Each signed HttpOnly browser session may accept six starts in a rolling 600-second window. Commands inside a run do not consume starts. A run has a 20-command budget and a maximum encoded capability size of 48 KiB.

The quota is intentionally session-only. Clearing the browser cookie creates a new browser session and resets that session's start history.

Required environment variables:

- `OPENAI_API_KEY`
- `PRESS_RAG_DEMO_SIGNING_SECRET`: at least 32 non-whitespace characters and 12 distinct characters

`AI_QA_AUTH_SECRET` is accepted only as a fallback when it passes the same strength rule. `PT_BRIEF_MODEL` and `PT_POLISH_MODEL` can override the default `gpt-4.1-mini` models.

The signed-cookie design prevents ordinary stale replay through revision binding. It does not provide atomic global replay prevention for deliberately simultaneous requests presented to different instances; that would require shared transactional storage.
