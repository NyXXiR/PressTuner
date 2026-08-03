# PressTuner / brieFFlow

PressTuner is the repository for **brieFFlow**, an AI-assisted document workspace with two focused product tracks:

- **Press** turns product, partnership, and event material into structured press briefs and reviewable releases.
- **Resume / Career** connects approved career evidence to application questions and develops it into persuasive, grounded answers.

Both tracks follow the same product journey: **rough input → structured brief or strategy → draft → review → share or finalize**. The goal is not unchecked one-click writing; it is a faster path from a blank page to a document whose sources, decisions, and final wording a person can inspect.

## Portfolio highlights

- A grounded document Agent searches team-scoped knowledge, compares evidence, drafts, verifies, and pauses before approval-gated writes.
- Press knowledge is isolated by team, while career memory is isolated by user and only confirmed evidence is eligible for generation.
- Human approval, source verification, and finalization remain explicit product boundaries rather than inferred model permissions.
- Billing and quotas are product-scoped through a shared plan catalog, domain rules, and persisted team billing snapshots.
- Indexing, embeddings, retries, and other background work are handled with the separate `PressTuner-scheduler` service.
- Agent runs retain structured steps, citations, usage, latency, cost, and review state so improvement claims can be evaluated instead of guessed.

See [AI improvement direction](AI_IMPROVEMENT_DIRECTION.md), [domain rules](docs/domain-rules.md), and the [grounded Press Agent design](docs/press-rag-agent.md) for the product and safety contracts behind these choices.

## Measured RAG and Agent lifecycle

The improvement workflow is **observe → triage → promote → experiment → gate → human review**. Versioned cases, corpora, results, and improvement artifacts live under [`evals/press-rag`](evals/press-rag/README.md).

The retained historical v1 baseline is a controlled 30-case, 15-document corpus measurement—not a claim about production traffic or live customer performance:

| Metric | Controlled baseline |
| --- | ---: |
| Retrieval Recall@5 | 0.92 |
| Citation precision | 0.3974 |
| Grounded-claim rate | 0.4878 |
| Unanswerable accuracy | 0.7667 |
| Conflict-detection accuracy | 0.7333 |
| Run latency P50 / P95 | 4,717 / 7,702.1 ms |
| Total measured Agent cost | 36,079 μUSD across 30 runs |

Candidate gates consider useful-output retention as well as apparent quality, and cost must be measured independently rather than copied from a baseline. The checked deterministic replay deliberately cannot authorize deployment: it removes unsupported output, fails retention gates, has no independently measured candidate cost, remains pending human review, and exposes no deployment action.

For the metric definitions, provenance limits, replay semantics, and experiment contracts, read [Press RAG evaluation](evals/press-rag/README.md) and [PressTuner grounded document Agent](docs/press-rag-agent.md).

## Architecture

```text
Next.js App Router + React clients
              │
         thin API routes
              │
     lib/services orchestration
              │
 domain policies + config/billing catalog
              │
      Prisma + PostgreSQL source of truth
              │
 PressTuner-scheduler indexing/background work
```

- **Web application:** Next.js App Router, React client surfaces, Zustand state, and server-owned session handling.
- **Application boundary:** route handlers stay thin; orchestration belongs in `lib/services`, business rules in `domain`, and billing definitions in `config/billing`.
- **Persistence:** Prisma and PostgreSQL are the product source of truth for teams, documents, Agent runs, billing snapshots, and career memory.
- **Agent runtime:** the OpenAI Agents SDK supplies orchestration and resumable Agent state without replacing persisted product state.
- **Background processing:** the sibling `PressTuner-scheduler` repository owns indexing and worker execution and follows this repository's Prisma and billing semantics.
- **Evaluation:** versioned datasets and generated artifacts under `evals/press-rag` make controlled comparisons reproducible.

## Public demos

- [Product workflow demo](https://www.briefflow.com/demo)
- [Agent improvement lifecycle demo](https://www.briefflow.com/demo/agent-improvement)

Both demos use deterministic, read-only portfolio fixtures. They do not call a deployment control, mutate production Agent configuration, or present fixture results as fresh production measurements.

## Local setup

Use Node.js **20.9.0 or newer**, matching the installed Next.js engine requirement.

```bash
npm install
npm run prisma:generate
npm run dev
```

Before running the application, create an ignored local environment file and configure the environment required by the paths you intend to exercise, including the database, authentication/session, OpenAI, and payment-provider settings. Do not copy real secrets into source, fixtures, documentation, or shell history.

Database provisioning, migrations, safe seed data, and access policy remain operator-owned. `prisma:generate` generates the local client; it does not replace database setup. The development server runs on the port defined by the repository's `dev` script.

## Verification

Run the security-focused authorization checks:

```bash
node --import tsx --test \
  lib/auth.test.ts \
  lib/meAuthorization.test.ts \
  lib/domainSecuritySurface.test.ts
```

Run the broader application checks:

```bash
npm run lint
npm test
npm run build
npm run verify:press-rag-artifacts
```

`npm test` requires a safe `TEST_DATABASE_URL`, or a `DATABASE_URL` from which the protected test runner can derive a `_test` database. To validate or reproduce evaluation artifacts, use the commands documented in [`evals/press-rag/README.md`](evals/press-rag/README.md), including `npm run eval:press-rag`, `npm run experiment:press-rag`, and `npm run generate:press-rag-improvement`.

## Security and disclosure

- Secrets belong only in ignored environment files or an external secret manager.
- Super-admin identities are server configuration. Clients receive only a server-computed authorization boolean, while server authorization remains authoritative.
- Payment card data stays provider-owned; application APIs must not become a raw-card-data boundary.
- AI-generated content and evidence selections require human review before final use.
- Public demos are isolated from mutation and deployment controls.
- Public source visibility is not an open-source license grant. This repository includes no license.
- Repository visibility, Git-history handling, and publication are separate owner-controlled operations. A visible current tree does not make earlier history safe by implication.

Business and support contact details shown in the product are intentional public product information; they are distinct from privileged authorization configuration.
