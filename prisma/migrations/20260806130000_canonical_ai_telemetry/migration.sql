ALTER TABLE "agent_runtime_audit_event"
  ADD COLUMN "schema_version" TEXT,
  ADD COLUMN "canonical_event_id" TEXT,
  ADD COLUMN "trace_id" TEXT,
  ADD COLUMN "span_id" TEXT,
  ADD COLUMN "parent_span_id" TEXT,
  ADD COLUMN "sequence" INTEGER,
  ADD COLUMN "event_kind" TEXT;

CREATE UNIQUE INDEX "agent_runtime_audit_event_canonical_event_id_key"
  ON "agent_runtime_audit_event"("canonical_event_id");
CREATE INDEX "agent_runtime_audit_event_team_id_trace_id_sequence_idx"
  ON "agent_runtime_audit_event"("team_id", "trace_id", "sequence");
CREATE INDEX "agent_runtime_audit_event_team_id_run_id_sequence_idx"
  ON "agent_runtime_audit_event"("team_id", "run_id", "sequence");
