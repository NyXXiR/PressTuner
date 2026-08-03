CREATE TYPE "AgentRunStatus" AS ENUM (
  'PENDING', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELED'
);
CREATE TYPE "AgentStepStatus" AS ENUM (
  'PENDING', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'SKIPPED'
);
CREATE TYPE "AgentApprovalStatus" AS ENUM (
  'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'
);

CREATE TABLE "agent_run" (
  "id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "article_id" TEXT,
  "started_by_id" TEXT NOT NULL,
  "status" "AgentRunStatus" NOT NULL DEFAULT 'PENDING',
  "agent_version" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "output" JSONB,
  "sdk_state" TEXT,
  "checkpoint_version" INTEGER NOT NULL DEFAULT 1,
  "trace_id" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost_micros" INTEGER NOT NULL DEFAULT 0,
  "latency_ms" INTEGER,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_run_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_step" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "tool_name" TEXT,
  "status" "AgentStepStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" TEXT NOT NULL,
  "input_summary" JSONB,
  "output_summary" JSONB,
  "model" TEXT,
  "input_tokens" INTEGER NOT NULL DEFAULT 0,
  "output_tokens" INTEGER NOT NULL DEFAULT 0,
  "cached_input_tokens" INTEGER NOT NULL DEFAULT 0,
  "estimated_cost_micros" INTEGER NOT NULL DEFAULT 0,
  "latency_ms" INTEGER,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "error_code" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_step_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_approval" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "step_id" TEXT,
  "requested_by_id" TEXT NOT NULL,
  "decided_by_id" TEXT,
  "tool_name" TEXT NOT NULL,
  "status" "AgentApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "tool_input" JSONB NOT NULL,
  "decision_note" TEXT,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_approval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_citation" (
  "id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "step_id" TEXT,
  "document_id" TEXT NOT NULL,
  "chunk_id" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "document_name" TEXT NOT NULL,
  "page_start" INTEGER NOT NULL,
  "page_end" INTEGER NOT NULL,
  "excerpt" TEXT NOT NULL,
  "score" DOUBLE PRECISION,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_citation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_citation_page_range_check"
    CHECK ("page_start" >= 1 AND "page_end" >= "page_start")
);

CREATE INDEX "agent_run_team_id_status_created_at_idx"
  ON "agent_run"("team_id", "status", "created_at");
CREATE INDEX "agent_run_article_id_created_at_idx"
  ON "agent_run"("article_id", "created_at");
CREATE UNIQUE INDEX "agent_step_idempotency_key_key"
  ON "agent_step"("idempotency_key");
CREATE UNIQUE INDEX "agent_step_run_id_sequence_key"
  ON "agent_step"("run_id", "sequence");
CREATE INDEX "agent_step_run_id_status_idx"
  ON "agent_step"("run_id", "status");
CREATE INDEX "agent_approval_run_id_status_idx"
  ON "agent_approval"("run_id", "status");
CREATE UNIQUE INDEX "agent_citation_run_id_source_id_key"
  ON "agent_citation"("run_id", "source_id");
CREATE INDEX "agent_citation_document_id_page_start_idx"
  ON "agent_citation"("document_id", "page_start");

ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_article_id_fkey"
  FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_started_by_id_fkey"
  FOREIGN KEY ("started_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_step" ADD CONSTRAINT "agent_step_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_approval" ADD CONSTRAINT "agent_approval_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_approval" ADD CONSTRAINT "agent_approval_step_id_fkey"
  FOREIGN KEY ("step_id") REFERENCES "agent_step"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_approval" ADD CONSTRAINT "agent_approval_requested_by_id_fkey"
  FOREIGN KEY ("requested_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_approval" ADD CONSTRAINT "agent_approval_decided_by_id_fkey"
  FOREIGN KEY ("decided_by_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_citation" ADD CONSTRAINT "agent_citation_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "agent_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_citation" ADD CONSTRAINT "agent_citation_step_id_fkey"
  FOREIGN KEY ("step_id") REFERENCES "agent_step"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_citation" ADD CONSTRAINT "agent_citation_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "knowledge_document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_citation" ADD CONSTRAINT "agent_citation_chunk_id_fkey"
  FOREIGN KEY ("chunk_id") REFERENCES "knowledge_chunk"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
