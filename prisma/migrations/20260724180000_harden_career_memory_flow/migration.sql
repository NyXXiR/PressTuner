-- Additive hardening for career evidence, trusted facts, final-answer capture,
-- and embedding freshness. Legacy nullable evidence fields fail closed in code.
CREATE TYPE "CareerEvidenceOrigin" AS ENUM ('SOURCE_EXCERPT', 'USER_ASSERTION');
CREATE TYPE "CareerFactTrustStatus" AS ENUM ('TRUSTED', 'NEEDS_REVIEW');
CREATE TYPE "CareerCaptureStatus" AS ENUM ('PENDING', 'APPLIED', 'DISMISSED', 'SUPERSEDED');

ALTER TABLE "career_candidate_evidence"
  ADD COLUMN "origin" "CareerEvidenceOrigin",
  ADD COLUMN "value_hash" TEXT;

ALTER TABLE "career_fact_evidence"
  ADD COLUMN "origin" "CareerEvidenceOrigin",
  ADD COLUMN "value_hash" TEXT;

ALTER TABLE "career_fact"
  ADD COLUMN "trust_status" "CareerFactTrustStatus" NOT NULL DEFAULT 'NEEDS_REVIEW';

-- Scheduler claims write a fresh token for each processing attempt. The app
-- owns the authoritative schema even though worker behavior lives elsewhere.
ALTER TABLE "career_source"
  ADD COLUMN "processing_attempt_token" TEXT;

ALTER TABLE "experience_brick"
  ADD COLUMN "embedding_revision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "embedded_revision" INTEGER;

CREATE TABLE "career_capture_proposal" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "question_id" TEXT NOT NULL,
  "answer_hash" TEXT NOT NULL,
  "answer_revision" INTEGER NOT NULL,
  "status" "CareerCaptureStatus" NOT NULL DEFAULT 'PENDING',
  "summary" TEXT,
  "resolved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "career_capture_proposal_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "career_experience_candidate"
  ADD COLUMN "capture_proposal_id" TEXT,
  ADD COLUMN "final_answer_dedupe_key" TEXT;

-- Nullable rollout fields are classified only where legacy provenance is
-- provable. A surviving chunk proves a source excerpt. Without a chunk, only
-- DIRECT_INPUT and FINAL_ANSWER candidates prove that the text was presented as
-- a user assertion. In particular, a PDF candidate whose chunk/source was
-- deleted remains NULL rather than being relabelled as an assertion.
-- value_hash intentionally remains NULL because no canonical value hash can be
-- proven from the legacy excerpt alone; NULL must be treated as unverified.
UPDATE "career_candidate_evidence"
SET "origin" = 'SOURCE_EXCERPT'::"CareerEvidenceOrigin"
WHERE "origin" IS NULL
  AND "source_chunk_id" IS NOT NULL;

UPDATE "career_candidate_evidence" AS evidence
SET "origin" = 'USER_ASSERTION'::"CareerEvidenceOrigin"
FROM "career_experience_candidate" AS candidate
WHERE evidence."origin" IS NULL
  AND evidence."source_chunk_id" IS NULL
  AND evidence."candidate_id" = candidate."id"
  AND candidate."origin" IN ('DIRECT_INPUT', 'FINAL_ANSWER');

UPDATE "career_fact_evidence"
SET "origin" = 'SOURCE_EXCERPT'::"CareerEvidenceOrigin"
WHERE "origin" IS NULL
  AND "source_chunk_id" IS NOT NULL;

UPDATE "career_fact_evidence" AS evidence
SET "origin" = 'USER_ASSERTION'::"CareerEvidenceOrigin"
FROM "career_experience_candidate" AS candidate
WHERE evidence."origin" IS NULL
  AND evidence."source_chunk_id" IS NULL
  AND evidence."candidate_id" = candidate."id"
  AND candidate."origin" IN ('DIRECT_INPUT', 'FINAL_ANSWER');

-- Trust backfill is deliberately narrower than experience.source = MANUAL.
-- Manual experiences can have later PDF/AI augmentations, so only low-risk fact
-- kinds with no evidence, or exclusively explicit USER_ASSERTION evidence, are
-- certified from that legacy owner-authored record. Organization, title, date,
-- and metric facts fail closed; SUMMARY is handled by a stricter block below.
-- Direct evidence checks ensure deleted candidates/chunks cannot make orphaned
-- source evidence trusted.
UPDATE "career_fact" AS fact
SET "trust_status" = 'TRUSTED'
FROM "experience_brick" AS experience
WHERE fact."experience_id" = experience."id"
  AND fact."user_id" = experience."user_id"
  AND experience."source" = 'MANUAL'
  AND fact."kind" IN ('TYPE', 'ACTION', 'OUTCOME', 'TOOL', 'TAG')
  AND NOT EXISTS (
    SELECT 1
    FROM "career_fact_evidence" AS evidence
    WHERE evidence."fact_id" = fact."id"
      AND (
        evidence."origin" IS NULL
        OR evidence."origin" <> 'USER_ASSERTION'::"CareerEvidenceOrigin"
      )
  );

-- SUMMARY is the low-risk payload that kept legacy manual memory useful. Trust
-- it only when the owner and confirmed parent match, no source-backed candidate
-- can be associated with the experience, and no non-assertion evidence exists.
-- This intentionally does not promote organization/title/date/metric facts.
UPDATE "career_fact" AS fact
SET "trust_status" = 'TRUSTED'
FROM "experience_brick" AS experience
WHERE fact."experience_id" = experience."id"
  AND fact."user_id" = experience."user_id"
  AND fact."active"
  AND fact."kind" = 'SUMMARY'
  AND experience."source" = 'MANUAL'
  AND experience."memory_status" = 'CONFIRMED'
  AND NOT EXISTS (
    SELECT 1
    FROM "career_experience_candidate" AS candidate
    WHERE candidate."user_id" = experience."user_id"
      AND candidate."source_id" IS NOT NULL
      AND candidate."target_experience_id" = experience."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "career_fact_evidence" AS evidence
    WHERE evidence."fact_id" = fact."id"
      AND (
        evidence."origin" IS NULL
        OR evidence."origin" <> 'USER_ASSERTION'::"CareerEvidenceOrigin"
      )
  );

-- Legacy DIRECT_INPUT links do not carry a canonical field-path/kind/value hash
-- that can prove high-risk assertions. Leave those facts NEEDS_REVIEW; only the
-- low-risk manual SUMMARY exception above is promoted. Runtime direct input
-- writes exact value hashes and is evaluated by the rebuild policy.

-- A legacy free-form period string is not a verified start date, even when its
-- parent experience was manually created.
UPDATE "career_fact"
SET
  "active" = false,
  "trust_status" = 'NEEDS_REVIEW',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "kind" = 'START_DATE'
  AND "field_path" = 'period';

-- Existing vectors and metadata predate revision tracking and cannot prove
-- content freshness. Leave embedding_revision at its default 0, but mark every
-- pre-existing row stale so the healing worker must re-embed it.
UPDATE "experience_brick"
SET "embedded_revision" = NULL;

-- BEGIN legacy period-only backfill
-- The 120000 migration added structured dates after legacy experience periods
-- already existed. Rows written between 120000 and this migration can have the
-- same shape in the candidate table. Parse only rows with no structured date
-- claims at all, and keep the parser output untrusted: this statement does not
-- create or promote date facts. Supported forms mirror parseLegacyCareerPeriod:
-- canonical dot-month projections, ISO-month tilde ranges, year ranges, English
-- month-name ranges, and their current/single/Until variants.
WITH
"month_names" ("name", "month_number") AS (
  VALUES
    ('jan', 1), ('january', 1),
    ('feb', 2), ('february', 2),
    ('mar', 3), ('march', 3),
    ('apr', 4), ('april', 4),
    ('may', 5),
    ('jun', 6), ('june', 6),
    ('jul', 7), ('july', 7),
    ('aug', 8), ('august', 8),
    ('sep', 9), ('september', 9),
    ('oct', 10), ('october', 10),
    ('nov', 11), ('november', 11),
    ('dec', 12), ('december', 12)
),
"legacy_periods" AS (
  SELECT
    'candidate'::TEXT AS "row_kind",
    "id",
    NULLIF(BTRIM("period"), '') AS "original_period",
    BTRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(BTRIM("period"), '[–—]', '-', 'g'),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ) AS "normalized_period"
  FROM "career_experience_candidate"
  WHERE "start_date" IS NULL
    AND "end_date" IS NULL
    AND NOT "is_current"
    AND NULLIF(BTRIM("period"), '') IS NOT NULL

  UNION ALL

  SELECT
    'experience'::TEXT AS "row_kind",
    "id",
    NULLIF(BTRIM("period"), '') AS "original_period",
    BTRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(BTRIM("period"), '[–—]', '-', 'g'),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ) AS "normalized_period"
  FROM "experience_brick"
  WHERE "start_date" IS NULL
    AND "end_date" IS NULL
    AND NOT "is_current"
    AND NULLIF(BTRIM("period"), '') IS NOT NULL
),
"range_parts" AS (
  SELECT
    "matched".*,
    BTRIM(("matched"."dash_match")[1]) AS "range_start",
    BTRIM(("matched"."dash_match")[2]) AS "range_end"
  FROM (
    SELECT
      "legacy_periods".*,
      REGEXP_MATCH(
        "normalized_period",
        '^(.+)[[:space:]]*-[[:space:]]*(.+)$'
      ) AS "dash_match"
    FROM "legacy_periods"
  ) AS "matched"
),
"format_matches" AS (
  SELECT
    "range_parts".*,
    REGEXP_MATCH(
      "normalized_period",
      '^(19[0-9]{2}|20[0-9]{2})[.](0[1-9]|1[0-2])[[:space:]]*-[[:space:]]*(19[0-9]{2}|20[0-9]{2})[.](0[1-9]|1[0-2])$',
      'i'
    ) AS "dot_range",
    REGEXP_MATCH(
      "normalized_period",
      '^(19[0-9]{2}|20[0-9]{2})[.](0[1-9]|1[0-2])[[:space:]]*-[[:space:]]*(present|current|now)$',
      'i'
    ) AS "dot_current",
    REGEXP_MATCH(
      "normalized_period",
      '^(19[0-9]{2}|20[0-9]{2})-(0[1-9]|1[0-2])[[:space:]]*~[[:space:]]*(19[0-9]{2}|20[0-9]{2})-(0[1-9]|1[0-2])$',
      'i'
    ) AS "iso_tilde_range",
    REGEXP_MATCH(
      "normalized_period",
      '^(19[0-9]{2}|20[0-9]{2})-(0[1-9]|1[0-2])[[:space:]]*~[[:space:]]*(현재|present)$',
      'i'
    ) AS "iso_tilde_current",
    REGEXP_MATCH(
      "normalized_period",
      '^(19[0-9]{2}|20[0-9]{2})[[:space:]]*-[[:space:]]*(19[0-9]{2}|20[0-9]{2})$',
      'i'
    ) AS "year_range",
    REGEXP_MATCH(
      "normalized_period",
      '^(19[0-9]{2}|20[0-9]{2})[[:space:]]*-[[:space:]]*(present|current|now)$',
      'i'
    ) AS "year_current",
    REGEXP_MATCH(
      "normalized_period",
      '^(19[0-9]{2}|20[0-9]{2})[.](0[1-9]|1[0-2])$',
      'i'
    ) AS "single_month",
    REGEXP_MATCH(
      "normalized_period",
      '^until[[:space:]]+(19[0-9]{2}|20[0-9]{2})[.](0[1-9]|1[0-2])$',
      'i'
    ) AS "until_month",
    REGEXP_MATCH(
      "range_start",
      '^(19[0-9]{2}|20[0-9]{2})[.](0[1-9]|1[0-2])$',
      'i'
    ) AS "range_start_dot_month",
    REGEXP_MATCH(
      "range_end",
      '^(19[0-9]{2}|20[0-9]{2})[.](0[1-9]|1[0-2])$',
      'i'
    ) AS "range_end_dot_month",
    REGEXP_MATCH(
      "range_start",
      '^(19[0-9]{2}|20[0-9]{2})$',
      'i'
    ) AS "range_start_year_only",
    REGEXP_MATCH(
      "range_end",
      '^(19[0-9]{2}|20[0-9]{2})$',
      'i'
    ) AS "range_end_year_only",
    REGEXP_MATCH(
      "range_start",
      '^([[:alpha:]]+)[[:space:]]*,?[[:space:]]*(19[0-9]{2}|20[0-9]{2})$',
      'i'
    ) AS "english_start_month_first",
    REGEXP_MATCH(
      "range_start",
      '^(19[0-9]{2}|20[0-9]{2})[[:space:]]*,?[[:space:]]*([[:alpha:]]+)$',
      'i'
    ) AS "english_start_year_first",
    REGEXP_MATCH(
      "range_end",
      '^([[:alpha:]]+)[[:space:]]*,?[[:space:]]*(19[0-9]{2}|20[0-9]{2})$',
      'i'
    ) AS "english_end_month_first",
    REGEXP_MATCH(
      "range_end",
      '^(19[0-9]{2}|20[0-9]{2})[[:space:]]*,?[[:space:]]*([[:alpha:]]+)$',
      'i'
    ) AS "english_end_year_first"
  FROM "range_parts"
),
"mapped_formats" AS (
  SELECT
    "format_matches".*,
    COALESCE(
      ("english_start_month_first")[2],
      ("english_start_year_first")[1]
    )::INTEGER AS "english_start_year",
    COALESCE(
      "start_month_first_name"."month_number",
      "start_year_first_name"."month_number"
    ) AS "english_start_month",
    COALESCE(
      ("english_end_month_first")[2],
      ("english_end_year_first")[1]
    )::INTEGER AS "english_end_year",
    COALESCE(
      "end_month_first_name"."month_number",
      "end_year_first_name"."month_number"
    ) AS "english_end_month"
  FROM "format_matches"
  LEFT JOIN "month_names" AS "start_month_first_name"
    ON "start_month_first_name"."name" = LOWER(("english_start_month_first")[1])
  LEFT JOIN "month_names" AS "start_year_first_name"
    ON "start_year_first_name"."name" = LOWER(("english_start_year_first")[2])
  LEFT JOIN "month_names" AS "end_month_first_name"
    ON "end_month_first_name"."name" = LOWER(("english_end_month_first")[1])
  LEFT JOIN "month_names" AS "end_year_first_name"
    ON "end_year_first_name"."name" = LOWER(("english_end_year_first")[2])
),
"classified_formats" AS (
  SELECT
    "mapped_formats".*,
    (
      "english_start_month" IS NOT NULL
      AND "english_end_month" IS NOT NULL
    ) AS "english_range",
    (
      "english_start_month" IS NOT NULL
      AND "range_end" ~* '^(present|current|now)$'
    ) AS "english_current",
    (
      (
        "range_start_dot_month" IS NOT NULL
        OR "range_start_year_only" IS NOT NULL
        OR "english_start_month" IS NOT NULL
      )
      AND (
        "range_end_dot_month" IS NOT NULL
        OR "range_end_year_only" IS NOT NULL
        OR "english_end_month" IS NOT NULL
      )
    ) AS "compatible_range",
    ("normalized_period" ~* '^present$') AS "present_only"
  FROM "mapped_formats"
),
"extracted_periods" AS (
  SELECT
    "row_kind",
    "id",
    "original_period",
    CASE
      WHEN "dot_range" IS NOT NULL
        THEN MAKE_DATE(("dot_range")[1]::INTEGER, ("dot_range")[2]::INTEGER, 1)
      WHEN "dot_current" IS NOT NULL
        THEN MAKE_DATE(("dot_current")[1]::INTEGER, ("dot_current")[2]::INTEGER, 1)
      WHEN "iso_tilde_range" IS NOT NULL
        THEN MAKE_DATE(("iso_tilde_range")[1]::INTEGER, ("iso_tilde_range")[2]::INTEGER, 1)
      WHEN "iso_tilde_current" IS NOT NULL
        THEN MAKE_DATE(("iso_tilde_current")[1]::INTEGER, ("iso_tilde_current")[2]::INTEGER, 1)
      WHEN "year_range" IS NOT NULL
        THEN MAKE_DATE(("year_range")[1]::INTEGER, 1, 1)
      WHEN "year_current" IS NOT NULL
        THEN MAKE_DATE(("year_current")[1]::INTEGER, 1, 1)
      WHEN "english_range" OR "english_current"
        THEN MAKE_DATE("english_start_year", "english_start_month", 1)
      WHEN "compatible_range"
        THEN CASE
          WHEN "range_start_dot_month" IS NOT NULL
            THEN MAKE_DATE(
              ("range_start_dot_month")[1]::INTEGER,
              ("range_start_dot_month")[2]::INTEGER,
              1
            )
          WHEN "range_start_year_only" IS NOT NULL
            THEN MAKE_DATE(("range_start_year_only")[1]::INTEGER, 1, 1)
          ELSE MAKE_DATE("english_start_year", "english_start_month", 1)
        END
      WHEN "single_month" IS NOT NULL
        THEN MAKE_DATE(("single_month")[1]::INTEGER, ("single_month")[2]::INTEGER, 1)
      ELSE NULL
    END AS "parsed_start_date",
    CASE
      WHEN "dot_range" IS NOT NULL
        THEN MAKE_DATE(("dot_range")[3]::INTEGER, ("dot_range")[4]::INTEGER, 1)
      WHEN "iso_tilde_range" IS NOT NULL
        THEN MAKE_DATE(("iso_tilde_range")[3]::INTEGER, ("iso_tilde_range")[4]::INTEGER, 1)
      WHEN "year_range" IS NOT NULL
        THEN MAKE_DATE(("year_range")[2]::INTEGER, 12, 1)
      WHEN "english_range"
        THEN MAKE_DATE("english_end_year", "english_end_month", 1)
      WHEN "compatible_range"
        THEN CASE
          WHEN "range_end_dot_month" IS NOT NULL
            THEN MAKE_DATE(
              ("range_end_dot_month")[1]::INTEGER,
              ("range_end_dot_month")[2]::INTEGER,
              1
            )
          WHEN "range_end_year_only" IS NOT NULL
            THEN MAKE_DATE(("range_end_year_only")[1]::INTEGER, 12, 1)
          ELSE MAKE_DATE("english_end_year", "english_end_month", 1)
        END
      WHEN "until_month" IS NOT NULL
        THEN MAKE_DATE(("until_month")[1]::INTEGER, ("until_month")[2]::INTEGER, 1)
      ELSE NULL
    END AS "parsed_end_date",
    (
      "dot_current" IS NOT NULL
      OR "iso_tilde_current" IS NOT NULL
      OR "year_current" IS NOT NULL
      OR "english_current"
      OR "present_only"
    ) AS "parsed_is_current",
    (
      "dot_range" IS NOT NULL
      OR "dot_current" IS NOT NULL
      OR "iso_tilde_range" IS NOT NULL
      OR "iso_tilde_current" IS NOT NULL
      OR "year_range" IS NOT NULL
      OR "year_current" IS NOT NULL
      OR "english_range"
      OR "english_current"
      OR "compatible_range"
      OR "single_month" IS NOT NULL
      OR "until_month" IS NOT NULL
      OR "present_only"
    ) AS "recognized"
  FROM "classified_formats"
),
"validated_periods" AS (
  SELECT
    "extracted_periods".*,
    (
      "recognized"
      AND (
        "parsed_start_date" IS NULL
        OR "parsed_end_date" IS NULL
        OR "parsed_end_date" >= "parsed_start_date"
      )
    ) AS "valid"
  FROM "extracted_periods"
),
"candidate_period_backfill" AS (
  UPDATE "career_experience_candidate" AS "candidate"
  SET
    "start_date" = "validated_periods"."parsed_start_date",
    "end_date" = "validated_periods"."parsed_end_date",
    "is_current" = "validated_periods"."parsed_is_current"
  FROM "validated_periods"
  WHERE "validated_periods"."row_kind" = 'candidate'
    AND "validated_periods"."id" = "candidate"."id"
    AND "validated_periods"."valid"
  RETURNING "candidate"."id"
)
UPDATE "experience_brick" AS "experience"
SET
  "start_date" = "validated_periods"."parsed_start_date",
  "end_date" = "validated_periods"."parsed_end_date",
  "is_current" = "validated_periods"."parsed_is_current"
FROM "validated_periods"
WHERE "validated_periods"."row_kind" = 'experience'
  AND "validated_periods"."id" = "experience"."id"
  AND "validated_periods"."valid";
-- END legacy period-only backfill

-- Repair structured date contradictions before adding/validating constraints.
-- Reversed ranges lose both structured dates and the derived period, while
-- current rows simply lose their contradictory end date.
UPDATE "career_experience_candidate"
SET
  "start_date" = NULL,
  "end_date" = NULL,
  "period" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "start_date" IS NOT NULL
  AND "end_date" IS NOT NULL
  AND "end_date" < "start_date";

UPDATE "career_experience_candidate"
SET
  "end_date" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "is_current"
  AND "end_date" IS NOT NULL;

-- period is a display projection, never an independent source of truth.
WITH "candidate_desired_period" AS (
  SELECT
    "id",
    CASE
      WHEN "start_date" IS NOT NULL AND "is_current"
        THEN to_char("start_date", 'YYYY.MM') || ' - Present'
      WHEN "start_date" IS NOT NULL AND "end_date" IS NOT NULL
        THEN to_char("start_date", 'YYYY.MM') || ' - ' || to_char("end_date", 'YYYY.MM')
      WHEN "start_date" IS NOT NULL
        THEN to_char("start_date", 'YYYY.MM')
      WHEN "end_date" IS NOT NULL
        THEN 'Until ' || to_char("end_date", 'YYYY.MM')
      WHEN "is_current"
        THEN 'Present'
      ELSE NULLIF(BTRIM("period"), '')
    END AS "desired_period"
  FROM "career_experience_candidate"
)
UPDATE "career_experience_candidate" AS candidate
SET
  "period" = desired."desired_period",
  "updated_at" = CURRENT_TIMESTAMP
FROM "candidate_desired_period" AS desired
WHERE candidate."id" = desired."id"
  AND candidate."period" IS DISTINCT FROM desired."desired_period";

WITH repaired_experience AS (
  UPDATE "experience_brick"
  SET
    "start_date" = NULL,
    "end_date" = NULL,
    "period" = NULL,
    "memory_status" = 'NEEDS_REVIEW',
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "start_date" IS NOT NULL
    AND "end_date" IS NOT NULL
    AND "end_date" < "start_date"
  RETURNING "id", "user_id"
)
UPDATE "career_fact" AS fact
SET
  "active" = false,
  "trust_status" = 'NEEDS_REVIEW',
  "updated_at" = CURRENT_TIMESTAMP
FROM repaired_experience AS experience
WHERE fact."experience_id" = experience."id"
  AND fact."user_id" = experience."user_id"
  AND fact."kind" IN ('START_DATE', 'END_DATE');

WITH repaired_experience AS (
  UPDATE "experience_brick"
  SET
    "end_date" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
  WHERE "is_current"
    AND "end_date" IS NOT NULL
  RETURNING "id", "user_id"
)
UPDATE "career_fact" AS fact
SET
  "active" = false,
  "trust_status" = 'NEEDS_REVIEW',
  "updated_at" = CURRENT_TIMESTAMP
FROM repaired_experience AS experience
WHERE fact."experience_id" = experience."id"
  AND fact."user_id" = experience."user_id"
  AND fact."kind" = 'END_DATE';

WITH "experience_desired_period" AS (
  SELECT
    "id",
    CASE
      WHEN "start_date" IS NOT NULL AND "is_current"
        THEN to_char("start_date", 'YYYY.MM') || ' - Present'
      WHEN "start_date" IS NOT NULL AND "end_date" IS NOT NULL
        THEN to_char("start_date", 'YYYY.MM') || ' - ' || to_char("end_date", 'YYYY.MM')
      WHEN "start_date" IS NOT NULL
        THEN to_char("start_date", 'YYYY.MM')
      WHEN "end_date" IS NOT NULL
        THEN 'Until ' || to_char("end_date", 'YYYY.MM')
      WHEN "is_current"
        THEN 'Present'
      ELSE NULLIF(BTRIM("period"), '')
    END AS "desired_period"
  FROM "experience_brick"
)
UPDATE "experience_brick" AS experience
SET
  "period" = desired."desired_period",
  "updated_at" = CURRENT_TIMESTAMP
FROM "experience_desired_period" AS desired
WHERE experience."id" = desired."id"
  AND experience."period" IS DISTINCT FROM desired."desired_period";

CREATE INDEX "career_candidate_evidence_candidate_id_field_path_value_has_idx"
  ON "career_candidate_evidence"("candidate_id", "field_path", "value_hash");
CREATE INDEX "career_fact_evidence_fact_id_field_path_value_hash_idx"
  ON "career_fact_evidence"("fact_id", "field_path", "value_hash");
CREATE INDEX "career_fact_user_id_active_trust_status_kind_idx"
  ON "career_fact"("user_id", "active", "trust_status", "kind");
CREATE INDEX "career_fact_experience_id_active_trust_status_idx"
  ON "career_fact"("experience_id", "active", "trust_status");

CREATE INDEX "career_capture_proposal_user_id_status_created_at_idx"
  ON "career_capture_proposal"("user_id", "status", "created_at");
CREATE UNIQUE INDEX "career_capture_proposal_user_id_question_id_answer_hash_ans_key"
  ON "career_capture_proposal"("user_id", "question_id", "answer_hash", "answer_revision");
CREATE UNIQUE INDEX "career_experience_candidate_capture_proposal_id_final_answe_key"
  ON "career_experience_candidate"("capture_proposal_id", "final_answer_dedupe_key");

ALTER TABLE "career_experience_candidate"
  ADD CONSTRAINT "career_experience_candidate_current_end_date_check"
    CHECK (NOT "is_current" OR "end_date" IS NULL) NOT VALID,
  ADD CONSTRAINT "career_experience_candidate_final_answer_dedupe_pair_check"
    CHECK (("capture_proposal_id" IS NULL) = ("final_answer_dedupe_key" IS NULL)) NOT VALID;

ALTER TABLE "experience_brick"
  ADD CONSTRAINT "experience_brick_current_end_date_check"
    CHECK (NOT "is_current" OR "end_date" IS NULL) NOT VALID,
  ADD CONSTRAINT "experience_brick_date_order_check"
    CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "end_date" >= "start_date") NOT VALID;

-- career_candidate_dates_check from the 120000 migration already enforces
-- candidate date ordering; do not add a duplicate date-order constraint here.
ALTER TABLE "career_experience_candidate"
  VALIDATE CONSTRAINT "career_experience_candidate_current_end_date_check";
ALTER TABLE "career_experience_candidate"
  VALIDATE CONSTRAINT "career_experience_candidate_final_answer_dedupe_pair_check";
ALTER TABLE "experience_brick"
  VALIDATE CONSTRAINT "experience_brick_current_end_date_check";
ALTER TABLE "experience_brick"
  VALIDATE CONSTRAINT "experience_brick_date_order_check";

ALTER TABLE "career_capture_proposal"
  ADD CONSTRAINT "career_capture_proposal_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "career_capture_proposal_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The 120000 question FK used SET NULL, which conflicts with deleting a question
-- once its proposal cascades to the same candidate. Give both paths compatible
-- cascade semantics so proposal-backed candidates are deleted without an FK race.
ALTER TABLE "career_experience_candidate"
  DROP CONSTRAINT "career_experience_candidate_question_id_fkey",
  ADD CONSTRAINT "career_experience_candidate_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Proposal-backed candidates cannot survive with only half of their dedupe
-- identity. Cascade them with the proposal rather than using SET NULL, which
-- would violate the all-null-or-all-present check above.
ALTER TABLE "career_experience_candidate"
  ADD CONSTRAINT "career_experience_candidate_capture_proposal_id_fkey"
    FOREIGN KEY ("capture_proposal_id") REFERENCES "career_capture_proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
