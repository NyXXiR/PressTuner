ALTER TYPE "PressAiDebugVerdict" ADD VALUE IF NOT EXISTS 'NOT_EVALUABLE';
ALTER TYPE "PressAiDebugGuardrailOrigin" ADD VALUE IF NOT EXISTS 'CASE_GUARDRAIL';

CREATE TYPE "PressAiDebugEvaluationStatus" AS ENUM ('SATISFIED', 'VIOLATED', 'NOT_EVALUABLE');
CREATE TYPE "PressAiDebugEvaluationState" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED');
CREATE TYPE "PressAiDebugTransitionDisposition" AS ENUM ('PENDING', 'ADVANCED', 'NOT_TAKEN');
CREATE TYPE "PressAiDebugGuardrailSeverity" AS ENUM ('WARN', 'BLOCK');
CREATE TYPE "PressAiDebugCommandStatus" AS ENUM ('PENDING', 'COMPLETED');

ALTER TABLE "press_ai_debug_case"
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "topology_config" JSONB;

ALTER TABLE "press_ai_debug_attempt"
  ADD COLUMN "case_revision" INTEGER,
  ADD COLUMN "topology_snapshot" JSONB,
  ADD COLUMN "guardrail_snapshot" JSONB,
  ADD COLUMN "capture_input_snapshot" JSONB,
  ADD COLUMN "current_iteration" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "press_ai_debug_checkpoint" ADD COLUMN "iteration" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "press_ai_debug_transition"
  ADD COLUMN "iteration" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "evaluation_state" "PressAiDebugEvaluationState" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "disposition" "PressAiDebugTransitionDisposition" NOT NULL DEFAULT 'PENDING';

ALTER TABLE "press_ai_debug_guardrail_observation"
  ADD COLUMN "evaluation_status" "PressAiDebugEvaluationStatus",
  ADD COLUMN "severity" "PressAiDebugGuardrailSeverity",
  ADD COLUMN "evaluation_revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "evaluator_id" TEXT,
  ADD COLUMN "evaluator_version" TEXT,
  ADD COLUMN "evaluation_batch_id" TEXT;

ALTER TABLE "press_ai_debug_command"
  ADD COLUMN "status" "PressAiDebugCommandStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "evaluation_batch_id" TEXT,
  ADD COLUMN "staged_response" JSONB,
  ALTER COLUMN "response" DROP NOT NULL;

CREATE TABLE "press_ai_debug_case_guardrail" (
  "id" TEXT PRIMARY KEY,
  "case_id" TEXT NOT NULL,
  "guardrail_id" TEXT NOT NULL,
  "edge_id" TEXT NOT NULL,
  "instruction" TEXT NOT NULL,
  "severity" "PressAiDebugGuardrailSeverity" NOT NULL,
  "evaluator_id" TEXT NOT NULL,
  "evaluator_version" TEXT NOT NULL,
  "display_order" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "press_ai_debug_case_command" (
  "id" TEXT PRIMARY KEY,
  "case_id" TEXT NOT NULL,
  "command_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "expected_revision" INTEGER NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status" "PressAiDebugCommandStatus" NOT NULL DEFAULT 'COMPLETED',
  "response" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "press_ai_debug_evaluation_batch" (
  "id" TEXT PRIMARY KEY,
  "transition_id" TEXT NOT NULL,
  "evaluation_revision" INTEGER NOT NULL,
  "request_hash" TEXT NOT NULL,
  "state" "PressAiDebugEvaluationState" NOT NULL DEFAULT 'PENDING',
  "lease_token" TEXT,
  "lease_expires_at" TIMESTAMP(3),
  "evaluator_id" TEXT NOT NULL,
  "evaluator_version" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "parsed_result" JSONB,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "estimated_cost_micros" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "press_ai_debug_case_guardrail_case_id_guardrail_id_key" ON "press_ai_debug_case_guardrail"("case_id", "guardrail_id");
CREATE INDEX "press_ai_debug_case_guardrail_case_id_edge_id_display_order_idx" ON "press_ai_debug_case_guardrail"("case_id", "edge_id", "display_order");
CREATE UNIQUE INDEX "press_ai_debug_case_command_case_id_command_id_key" ON "press_ai_debug_case_command"("case_id", "command_id");
CREATE INDEX "press_ai_debug_case_command_case_id_created_at_idx" ON "press_ai_debug_case_command"("case_id", "created_at");
CREATE UNIQUE INDEX "press_ai_debug_evaluation_batch_transition_id_evaluation_revision_key" ON "press_ai_debug_evaluation_batch"("transition_id", "evaluation_revision");
CREATE INDEX "press_ai_debug_evaluation_batch_state_lease_expires_at_idx" ON "press_ai_debug_evaluation_batch"("state", "lease_expires_at");

ALTER TABLE "press_ai_debug_case_guardrail" ADD CONSTRAINT "press_ai_debug_case_guardrail_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "press_ai_debug_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_case_command" ADD CONSTRAINT "press_ai_debug_case_command_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "press_ai_debug_case"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_evaluation_batch" ADD CONSTRAINT "press_ai_debug_evaluation_batch_transition_id_fkey" FOREIGN KEY ("transition_id") REFERENCES "press_ai_debug_transition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "press_ai_debug_guardrail_observation" ADD CONSTRAINT "press_ai_debug_guardrail_observation_evaluation_batch_id_fkey" FOREIGN KEY ("evaluation_batch_id") REFERENCES "press_ai_debug_evaluation_batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Historical rows retain the four-edge v2 topology; only newly-created v3 cases receive the loop by default.
UPDATE "press_ai_debug_case" SET "topology_config" = '{"schemaVersion":"press-ai-case-topology/v1","enabledEdgeIds":["initialization-brief","brief-draft","draft-review","review-rewrite"],"maxIterations":3}'::jsonb;
UPDATE "press_ai_debug_attempt" SET
  "topology_snapshot" = '{"schemaVersion":"press-ai-case-topology/v1","enabledEdgeIds":["initialization-brief","brief-draft","draft-review","review-rewrite"],"maxIterations":3}'::jsonb,
  "guardrail_snapshot" = '[]'::jsonb;

-- Migrate non-terminal legacy expectations into edge-scoped semantic guardrails, retaining the legacy JSON for one release.
INSERT INTO "press_ai_debug_case_guardrail" (
  "id", "case_id", "guardrail_id", "edge_id", "instruction", "severity", "evaluator_id", "evaluator_version", "display_order", "created_at", "updated_at"
)
SELECT
  c."id" || ':' || (item.value->>'id'), c."id", item.value->>'id',
  CASE c."start_node_id"
    WHEN 'article-initialization' THEN 'initialization-brief'
    WHEN 'brief-normalization' THEN 'brief-draft'
    WHEN 'draft-generation' THEN 'draft-review'
    WHEN 'draft-review' THEN 'review-rewrite'
  END,
  CASE item.value->>'field'
    WHEN 'contains' THEN '전이 대상 내용은 다음 값을 포함해야 합니다: ' || (item.value->>'value')
    ELSE '전이 대상 내용은 다음 값을 포함하지 않아야 합니다: ' || (item.value->>'value')
  END,
  COALESCE((item.value->>'verdict')::"PressAiDebugGuardrailSeverity", 'WARN'::"PressAiDebugGuardrailSeverity"),
  'semantic-guardrail', '1.0.0', item.ordinality - 1, c."created_at", c."updated_at"
FROM "press_ai_debug_case" c
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(c."expectations") = 'array' THEN c."expectations" ELSE '[]'::jsonb END) WITH ORDINALITY AS item(value, ordinality)
WHERE c."start_node_id" IN ('article-initialization', 'brief-normalization', 'draft-generation', 'draft-review')
ON CONFLICT ("case_id", "guardrail_id") DO NOTHING;

DO $$
DECLARE terminal_expectations INTEGER;
BEGIN
  SELECT COALESCE(SUM(jsonb_array_length(CASE WHEN jsonb_typeof("expectations") = 'array' THEN "expectations" ELSE '[]'::jsonb END)), 0)
    INTO terminal_expectations FROM "press_ai_debug_case" WHERE "start_node_id" = 'selected-rewrite';
  IF terminal_expectations > 0 THEN
    RAISE NOTICE 'press_ai_debugger migration retained % terminal-node legacy expectation(s) without an outgoing edge', terminal_expectations;
  END IF;
END $$;

UPDATE "press_ai_debug_checkpoint" SET "iteration" = 1 WHERE "node_id" = 'selected-rewrite';
UPDATE "press_ai_debug_attempt" a SET "current_iteration" = (
  SELECT COUNT(*)::INTEGER FROM "press_ai_debug_checkpoint" c WHERE c."attempt_id" = a."id" AND c."node_id" = 'selected-rewrite'
);
UPDATE "press_ai_debug_transition" SET "evaluation_state" = 'COMPLETED', "disposition" = CASE WHEN "advanced_at" IS NULL THEN 'PENDING'::"PressAiDebugTransitionDisposition" ELSE 'ADVANCED'::"PressAiDebugTransitionDisposition" END;
UPDATE "press_ai_debug_guardrail_observation" SET
  "evaluation_status" = CASE WHEN "verdict" = 'PASS' THEN 'SATISFIED'::"PressAiDebugEvaluationStatus" ELSE 'VIOLATED'::"PressAiDebugEvaluationStatus" END,
  "severity" = CASE WHEN "verdict" = 'PASS' THEN NULL ELSE "verdict"::text::"PressAiDebugGuardrailSeverity" END,
  "evaluator_id" = CASE WHEN "origin" = 'MANDATORY' THEN 'mandatory-v1' ELSE 'legacy-expectation-v1' END,
  "evaluator_version" = '1.0.0';
UPDATE "press_ai_debug_command" SET "status" = 'COMPLETED';

ALTER TABLE "press_ai_debug_case" ALTER COLUMN "topology_config" SET NOT NULL;
ALTER TABLE "press_ai_debug_attempt" ALTER COLUMN "topology_snapshot" SET NOT NULL, ALTER COLUMN "guardrail_snapshot" SET NOT NULL;
ALTER TABLE "press_ai_debug_guardrail_observation" ALTER COLUMN "evaluation_status" SET NOT NULL, ALTER COLUMN "evaluator_id" SET NOT NULL, ALTER COLUMN "evaluator_version" SET NOT NULL;

DROP INDEX "press_ai_debug_checkpoint_attempt_id_node_id_key";
DROP INDEX "press_ai_debug_guardrail_observation_transition_id_origin_guardrail_id_key";
CREATE UNIQUE INDEX "press_ai_debug_checkpoint_attempt_id_node_id_iteration_key" ON "press_ai_debug_checkpoint"("attempt_id", "node_id", "iteration");
CREATE UNIQUE INDEX "press_ai_debug_checkpoint_attempt_id_sequence_key" ON "press_ai_debug_checkpoint"("attempt_id", "sequence");
CREATE UNIQUE INDEX "press_ai_debug_guardrail_observation_transition_id_origin_guardrail_id_evaluation_revision_key" ON "press_ai_debug_guardrail_observation"("transition_id", "origin", "guardrail_id", "evaluation_revision");
