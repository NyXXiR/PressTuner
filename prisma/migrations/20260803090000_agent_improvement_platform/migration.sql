ALTER TYPE "AgentRunStatus" ADD VALUE IF NOT EXISTS 'CANCEL_REQUESTED';

ALTER TABLE "agent_run"
  ADD COLUMN "runtime_policy_snapshot" JSONB,
  ADD COLUMN "deadline_at" TIMESTAMP(3),
  ADD COLUMN "cancel_requested_at" TIMESTAMP(3),
  ADD COLUMN "canceled_at" TIMESTAMP(3),
  ADD COLUMN "terminal_reason" TEXT,
  ADD COLUMN "failure_category" TEXT,
  ADD COLUMN "completion_verified_at" TIMESTAMP(3);

CREATE TABLE "agent_configuration_version" (
  "id" TEXT NOT NULL,
  "team_id" TEXT,
  "content_hash" TEXT NOT NULL,
  "identity" JSONB NOT NULL,
  "created_by_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_configuration_version_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_configuration_version_content_hash_key" ON "agent_configuration_version"("content_hash");
CREATE INDEX "agent_configuration_version_team_id_created_at_idx" ON "agent_configuration_version"("team_id", "created_at");

CREATE TABLE "agent_dataset_version" (
  "id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "parent_dataset_version_id" TEXT,
  "created_by_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_dataset_version_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_dataset_version_team_id_content_hash_key" ON "agent_dataset_version"("team_id", "content_hash");
CREATE INDEX "agent_dataset_version_team_id_created_at_idx" ON "agent_dataset_version"("team_id", "created_at");

CREATE TABLE "agent_dataset_case" (
  "id" TEXT NOT NULL,
  "dataset_version_id" TEXT NOT NULL,
  "case_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "content_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_dataset_case_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_dataset_case_dataset_version_id_case_key_key" ON "agent_dataset_case"("dataset_version_id", "case_key");
CREATE INDEX "agent_dataset_case_content_hash_idx" ON "agent_dataset_case"("content_hash");

CREATE TABLE "agent_experiment_cycle" (
  "id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "dataset_version_id" TEXT NOT NULL,
  "baseline_configuration_id" TEXT NOT NULL,
  "candidate_configuration_id" TEXT NOT NULL,
  "environment_manifest" JSONB NOT NULL,
  "artifact_hash" TEXT NOT NULL,
  "artifact" JSONB NOT NULL,
  "gate_checks" JSONB NOT NULL,
  "human_review" TEXT NOT NULL DEFAULT 'PENDING',
  "evidence_class" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "reviewer_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "review_note" TEXT,
  "deployment_authorized" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_experiment_cycle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_experiment_cycle_team_id_artifact_hash_key" ON "agent_experiment_cycle"("team_id", "artifact_hash");
CREATE UNIQUE INDEX "agent_experiment_cycle_team_id_sequence_key" ON "agent_experiment_cycle"("team_id", "sequence");
CREATE INDEX "agent_experiment_cycle_team_id_created_at_idx" ON "agent_experiment_cycle"("team_id", "created_at");

CREATE TABLE "agent_experiment_execution" (
  "id" TEXT NOT NULL,
  "cycle_id" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "external_execution_id" TEXT NOT NULL,
  "configuration_id" TEXT NOT NULL,
  "executor_id" TEXT NOT NULL,
  "deterministic_seed" INTEGER,
  "evidence_class" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_experiment_execution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_experiment_execution_cycle_id_role_key" ON "agent_experiment_execution"("cycle_id", "role");
CREATE INDEX "agent_experiment_execution_configuration_id_idx" ON "agent_experiment_execution"("configuration_id");

CREATE TABLE "agent_experiment_case_outcome" (
  "id" TEXT NOT NULL,
  "execution_id" TEXT NOT NULL,
  "case_key" TEXT NOT NULL,
  "expected_behavior" JSONB NOT NULL,
  "observations" JSONB NOT NULL,
  "artifact_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_experiment_case_outcome_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_experiment_case_outcome_artifact_hash_idx" ON "agent_experiment_case_outcome"("artifact_hash");
CREATE UNIQUE INDEX "agent_experiment_case_outcome_execution_id_case_key_key" ON "agent_experiment_case_outcome"("execution_id", "case_key");

CREATE TABLE "agent_regression_candidate" (
  "id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "dedupe_hash" TEXT NOT NULL,
  "failure_category" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "consent_eligible" BOOLEAN NOT NULL,
  "evaluation_eligible" BOOLEAN NOT NULL,
  "redaction_result" JSONB NOT NULL,
  "review_state" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewed_by_id" TEXT,
  "reviewed_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "promoted_case_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_regression_candidate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_regression_candidate_dedupe_hash_key" ON "agent_regression_candidate"("dedupe_hash");
CREATE INDEX "agent_regression_candidate_team_id_review_state_created_at_idx" ON "agent_regression_candidate"("team_id", "review_state", "created_at");

CREATE TABLE "agent_regression_candidate_source" (
  "id" TEXT NOT NULL,
  "candidate_id" TEXT NOT NULL,
  "source_kind" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "source_hash" TEXT NOT NULL,
  "provenance" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_regression_candidate_source_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_regression_candidate_source_candidate_id_source_kind_source_id_key" ON "agent_regression_candidate_source"("candidate_id", "source_kind", "source_id");
CREATE INDEX "agent_regression_candidate_source_source_hash_idx" ON "agent_regression_candidate_source"("source_hash");

CREATE TABLE "agent_runtime_audit_event" (
  "id" TEXT NOT NULL,
  "team_id" TEXT NOT NULL,
  "run_id" TEXT,
  "event_type" TEXT NOT NULL,
  "failure_category" TEXT,
  "details" JSONB NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_runtime_audit_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_runtime_audit_event_team_id_run_id_occurred_at_idx" ON "agent_runtime_audit_event"("team_id", "run_id", "occurred_at");

ALTER TABLE "agent_dataset_version" ADD CONSTRAINT "agent_dataset_version_parent_dataset_version_id_fkey" FOREIGN KEY ("parent_dataset_version_id") REFERENCES "agent_dataset_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_dataset_case" ADD CONSTRAINT "agent_dataset_case_dataset_version_id_fkey" FOREIGN KEY ("dataset_version_id") REFERENCES "agent_dataset_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_experiment_cycle" ADD CONSTRAINT "agent_experiment_cycle_dataset_version_id_fkey" FOREIGN KEY ("dataset_version_id") REFERENCES "agent_dataset_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_experiment_cycle" ADD CONSTRAINT "agent_experiment_cycle_baseline_configuration_id_fkey" FOREIGN KEY ("baseline_configuration_id") REFERENCES "agent_configuration_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_experiment_cycle" ADD CONSTRAINT "agent_experiment_cycle_candidate_configuration_id_fkey" FOREIGN KEY ("candidate_configuration_id") REFERENCES "agent_configuration_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_experiment_execution" ADD CONSTRAINT "agent_experiment_execution_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "agent_experiment_cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_experiment_execution" ADD CONSTRAINT "agent_experiment_execution_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "agent_configuration_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_experiment_case_outcome" ADD CONSTRAINT "agent_experiment_case_outcome_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "agent_experiment_execution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_regression_candidate_source" ADD CONSTRAINT "agent_regression_candidate_source_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "agent_regression_candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_runtime_audit_event" ADD CONSTRAINT "agent_runtime_audit_event_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
