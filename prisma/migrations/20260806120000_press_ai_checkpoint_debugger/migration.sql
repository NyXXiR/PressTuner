CREATE TYPE "PressAiDebugCaseStatus" AS ENUM ('DRAFT', 'SAVED');
CREATE TYPE "PressAiDebugCaptureKind" AS ENUM ('AUTOMATIC_BLOCK', 'MANUAL');
CREATE TYPE "PressAiDebugAttemptStatus" AS ENUM ('ACTIVE', 'INSPECTING', 'COMPLETED', 'BLOCKED', 'FAILED');
CREATE TYPE "PressAiDebugCheckpointMode" AS ENUM ('EXECUTED', 'RESTORED');
CREATE TYPE "PressAiDebugVerdict" AS ENUM ('PASS', 'WARN', 'BLOCK');
CREATE TYPE "PressAiDebugGuardrailOrigin" AS ENUM ('MANDATORY', 'CASE_EXPECTATION');

CREATE TABLE "press_ai_debug_case" (
  "id" TEXT PRIMARY KEY, "team_id" TEXT NOT NULL, "created_by_id" TEXT NOT NULL, "name" TEXT,
  "status" "PressAiDebugCaseStatus" NOT NULL DEFAULT 'DRAFT', "process_id" TEXT NOT NULL, "process_version" TEXT NOT NULL,
  "registry_hash" TEXT NOT NULL, "source_attempt_id" TEXT NOT NULL, "source_checkpoint_id" TEXT NOT NULL,
  "start_node_id" TEXT NOT NULL, "input_snapshot" JSONB NOT NULL, "expectations" JSONB NOT NULL,
  "capture_kind" "PressAiDebugCaptureKind" NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "press_ai_debug_attempt" (
  "id" TEXT PRIMARY KEY, "team_id" TEXT NOT NULL, "created_by_id" TEXT NOT NULL, "case_id" TEXT, "agent_run_id" TEXT NOT NULL,
  "parent_attempt_id" TEXT, "baseline_attempt_id" TEXT, "process_id" TEXT NOT NULL, "process_version" TEXT NOT NULL,
  "registry_hash" TEXT NOT NULL, "executor_version" TEXT NOT NULL, "start_node_id" TEXT NOT NULL, "active_node_id" TEXT,
  "status" "PressAiDebugAttemptStatus" NOT NULL DEFAULT 'ACTIVE', "revision" INTEGER NOT NULL DEFAULT 0,
  "article_id" TEXT NOT NULL, "input_snapshot" JSONB NOT NULL, "terminal_verdict" "PressAiDebugVerdict", "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "press_ai_debug_checkpoint" (
  "id" TEXT PRIMARY KEY, "attempt_id" TEXT NOT NULL, "node_id" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
  "mode" "PressAiDebugCheckpointMode" NOT NULL, "input" JSONB NOT NULL, "output" JSONB NOT NULL,
  "restored_from_checkpoint_id" TEXT, "quota_units" INTEGER NOT NULL DEFAULT 0, "process_version" TEXT NOT NULL,
  "registry_hash" TEXT NOT NULL, "executor_version" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "press_ai_debug_transition" (
  "id" TEXT PRIMARY KEY, "attempt_id" TEXT NOT NULL, "edge_id" TEXT NOT NULL, "sequence" INTEGER NOT NULL,
  "source_node_id" TEXT NOT NULL, "target_node_id" TEXT NOT NULL, "source_checkpoint_id" TEXT NOT NULL,
  "target_payload" JSONB NOT NULL, "verdict" "PressAiDebugVerdict" NOT NULL, "warn_acknowledged_by_id" TEXT,
  "warn_acknowledged_at" TIMESTAMP(3), "human_gate_acknowledged_by_id" TEXT, "human_gate_acknowledged_at" TIMESTAMP(3),
  "advanced_by_id" TEXT, "advanced_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "press_ai_debug_guardrail_observation" (
  "id" TEXT PRIMARY KEY, "transition_id" TEXT NOT NULL, "guardrail_id" TEXT NOT NULL,
  "origin" "PressAiDebugGuardrailOrigin" NOT NULL, "expected" TEXT NOT NULL, "observed" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "evidence" JSONB NOT NULL, "verdict" "PressAiDebugVerdict" NOT NULL, "display_order" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "press_ai_debug_comparison" (
  "id" TEXT PRIMARY KEY, "baseline_attempt_id" TEXT NOT NULL, "candidate_attempt_id" TEXT NOT NULL,
  "baseline_transition_id" TEXT, "candidate_transition_id" TEXT, "baseline_checkpoint_id" TEXT, "candidate_checkpoint_id" TEXT,
  "old_verdict" "PressAiDebugVerdict", "new_verdict" "PressAiDebugVerdict", "output_comparison" JSONB NOT NULL,
  "baseline_process_version" TEXT NOT NULL, "candidate_process_version" TEXT NOT NULL,
  "baseline_registry_hash" TEXT NOT NULL, "candidate_registry_hash" TEXT NOT NULL,
  "baseline_executor_version" TEXT NOT NULL, "candidate_executor_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "press_ai_debug_command" (
  "id" TEXT PRIMARY KEY, "attempt_id" TEXT NOT NULL, "command_id" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "expected_revision" INTEGER NOT NULL, "request_hash" TEXT NOT NULL, "response" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "press_ai_debug_case_source_checkpoint_id_capture_kind_key" ON "press_ai_debug_case"("source_checkpoint_id", "capture_kind");
CREATE INDEX "press_ai_debug_case_team_id_status_created_at_idx" ON "press_ai_debug_case"("team_id", "status", "created_at");
CREATE INDEX "press_ai_debug_case_team_id_process_id_created_at_idx" ON "press_ai_debug_case"("team_id", "process_id", "created_at");
CREATE UNIQUE INDEX "press_ai_debug_attempt_agent_run_id_key" ON "press_ai_debug_attempt"("agent_run_id");
CREATE INDEX "press_ai_debug_attempt_team_id_status_created_at_idx" ON "press_ai_debug_attempt"("team_id", "status", "created_at");
CREATE INDEX "press_ai_debug_attempt_team_id_case_id_created_at_idx" ON "press_ai_debug_attempt"("team_id", "case_id", "created_at");
CREATE INDEX "press_ai_debug_attempt_parent_attempt_id_idx" ON "press_ai_debug_attempt"("parent_attempt_id");
CREATE INDEX "press_ai_debug_attempt_baseline_attempt_id_idx" ON "press_ai_debug_attempt"("baseline_attempt_id");
CREATE UNIQUE INDEX "press_ai_debug_checkpoint_attempt_id_node_id_key" ON "press_ai_debug_checkpoint"("attempt_id", "node_id");
CREATE INDEX "press_ai_debug_checkpoint_attempt_id_sequence_idx" ON "press_ai_debug_checkpoint"("attempt_id", "sequence");
CREATE INDEX "press_ai_debug_checkpoint_restored_from_checkpoint_id_idx" ON "press_ai_debug_checkpoint"("restored_from_checkpoint_id");
CREATE UNIQUE INDEX "press_ai_debug_transition_attempt_id_edge_id_source_checkpoint_id_key" ON "press_ai_debug_transition"("attempt_id", "edge_id", "source_checkpoint_id");
CREATE INDEX "press_ai_debug_transition_attempt_id_sequence_idx" ON "press_ai_debug_transition"("attempt_id", "sequence");
CREATE UNIQUE INDEX "press_ai_debug_guardrail_observation_transition_id_origin_guardrail_id_key" ON "press_ai_debug_guardrail_observation"("transition_id", "origin", "guardrail_id");
CREATE INDEX "press_ai_debug_guardrail_observation_transition_id_display_order_idx" ON "press_ai_debug_guardrail_observation"("transition_id", "display_order");
CREATE UNIQUE INDEX "press_ai_debug_comparison_identity_key" ON "press_ai_debug_comparison"("baseline_attempt_id", "candidate_attempt_id", "baseline_checkpoint_id", "candidate_checkpoint_id");
CREATE INDEX "press_ai_debug_comparison_candidate_attempt_id_created_at_idx" ON "press_ai_debug_comparison"("candidate_attempt_id", "created_at");
CREATE UNIQUE INDEX "press_ai_debug_command_attempt_id_command_id_key" ON "press_ai_debug_command"("attempt_id", "command_id");
CREATE INDEX "press_ai_debug_command_attempt_id_created_at_idx" ON "press_ai_debug_command"("attempt_id", "created_at");

ALTER TABLE "press_ai_debug_case" ADD CONSTRAINT "press_ai_debug_case_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_case" ADD CONSTRAINT "press_ai_debug_case_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_attempt" ADD CONSTRAINT "press_ai_debug_attempt_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_attempt" ADD CONSTRAINT "press_ai_debug_attempt_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_attempt" ADD CONSTRAINT "press_ai_debug_attempt_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "press_ai_debug_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_attempt" ADD CONSTRAINT "press_ai_debug_attempt_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_attempt" ADD CONSTRAINT "press_ai_debug_attempt_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "article"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_attempt" ADD CONSTRAINT "press_ai_debug_attempt_parent_attempt_id_fkey" FOREIGN KEY ("parent_attempt_id") REFERENCES "press_ai_debug_attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_attempt" ADD CONSTRAINT "press_ai_debug_attempt_baseline_attempt_id_fkey" FOREIGN KEY ("baseline_attempt_id") REFERENCES "press_ai_debug_attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_checkpoint" ADD CONSTRAINT "press_ai_debug_checkpoint_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "press_ai_debug_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_checkpoint" ADD CONSTRAINT "press_ai_debug_checkpoint_restored_from_checkpoint_id_fkey" FOREIGN KEY ("restored_from_checkpoint_id") REFERENCES "press_ai_debug_checkpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_transition" ADD CONSTRAINT "press_ai_debug_transition_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "press_ai_debug_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_transition" ADD CONSTRAINT "press_ai_debug_transition_source_checkpoint_id_fkey" FOREIGN KEY ("source_checkpoint_id") REFERENCES "press_ai_debug_checkpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_transition" ADD CONSTRAINT "press_ai_debug_transition_warn_acknowledged_by_id_fkey" FOREIGN KEY ("warn_acknowledged_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_transition" ADD CONSTRAINT "press_ai_debug_transition_human_gate_acknowledged_by_id_fkey" FOREIGN KEY ("human_gate_acknowledged_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_transition" ADD CONSTRAINT "press_ai_debug_transition_advanced_by_id_fkey" FOREIGN KEY ("advanced_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_guardrail_observation" ADD CONSTRAINT "press_ai_debug_guardrail_observation_transition_id_fkey" FOREIGN KEY ("transition_id") REFERENCES "press_ai_debug_transition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_comparison" ADD CONSTRAINT "press_ai_debug_comparison_baseline_attempt_id_fkey" FOREIGN KEY ("baseline_attempt_id") REFERENCES "press_ai_debug_attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_comparison" ADD CONSTRAINT "press_ai_debug_comparison_candidate_attempt_id_fkey" FOREIGN KEY ("candidate_attempt_id") REFERENCES "press_ai_debug_attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_comparison" ADD CONSTRAINT "press_ai_debug_comparison_baseline_transition_id_fkey" FOREIGN KEY ("baseline_transition_id") REFERENCES "press_ai_debug_transition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_comparison" ADD CONSTRAINT "press_ai_debug_comparison_candidate_transition_id_fkey" FOREIGN KEY ("candidate_transition_id") REFERENCES "press_ai_debug_transition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_comparison" ADD CONSTRAINT "press_ai_debug_comparison_baseline_checkpoint_id_fkey" FOREIGN KEY ("baseline_checkpoint_id") REFERENCES "press_ai_debug_checkpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_comparison" ADD CONSTRAINT "press_ai_debug_comparison_candidate_checkpoint_id_fkey" FOREIGN KEY ("candidate_checkpoint_id") REFERENCES "press_ai_debug_checkpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_command" ADD CONSTRAINT "press_ai_debug_command_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "press_ai_debug_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_case" ADD CONSTRAINT "press_ai_debug_case_source_attempt_id_fkey" FOREIGN KEY ("source_attempt_id") REFERENCES "press_ai_debug_attempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_case" ADD CONSTRAINT "press_ai_debug_case_source_checkpoint_id_fkey" FOREIGN KEY ("source_checkpoint_id") REFERENCES "press_ai_debug_checkpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
