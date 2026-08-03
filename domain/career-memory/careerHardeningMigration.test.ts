import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const schemaPath = resolve(process.cwd(), "prisma/schema.prisma");
const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260724180000_harden_career_memory_flow/migration.sql",
);
const createTargetMigrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260724190000_persist_create_candidate_target/migration.sql",
);
const initialCareerMigrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260724120000_add_career_memory_rag/migration.sql",
);

test("Phase 1 hardening migration and app schema remain aligned", async () => {
  const [schema, migration] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(migrationPath, "utf8"),
  ]);

  assert.match(
    schema,
    /processingAttemptToken\s+String\?\s+@map\("processing_attempt_token"\)/,
  );
  assert.match(
    migration,
    /ALTER TABLE "career_source"[\s\S]*ADD COLUMN\s+"processing_attempt_token"\s+TEXT/,
  );
});

test("hardening migration projects desired periods only when the stored value changes", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const candidateProjection = migration.match(
    /WITH "candidate_desired_period" AS \([\s\S]*?\)\s*UPDATE "career_experience_candidate" AS candidate[\s\S]*?;/,
  )?.[0];
  const experienceProjection = migration.match(
    /WITH "experience_desired_period" AS \([\s\S]*?\)\s*UPDATE "experience_brick" AS experience[\s\S]*?;/,
  )?.[0];

  assert.ok(candidateProjection, "missing candidate_desired_period CTE projection");
  assert.ok(experienceProjection, "missing experience_desired_period CTE projection");
  for (const projection of [candidateProjection, experienceProjection]) {
    assert.match(projection, /END AS "desired_period"/);
    assert.match(projection, /ELSE NULLIF\(BTRIM\("period"\), ''\)/);
    assert.match(projection, /"period"\s*=\s*desired\."desired_period"/);
    assert.match(projection, /"updated_at"\s*=\s*CURRENT_TIMESTAMP/);
    assert.match(
      projection,
      /"period" IS DISTINCT FROM desired\."desired_period"/,
      "unchanged periods must not receive a new updated_at",
    );
    assert.match(projection, /WHEN "is_current"\s+THEN 'Present'/);
    assert.match(projection, /to_char\([^)]*,\s*'YYYY\.MM'\)/);
  }
});

test("hardening migration backfills supported period-only rows without erasing unknown legacy text", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const backfill = migration.match(
    /-- BEGIN legacy period-only backfill([\s\S]*?)-- END legacy period-only backfill/,
  )?.[1];

  assert.ok(backfill, "missing bounded legacy period-only backfill");
  assert.match(backfill, /FROM "career_experience_candidate"/);
  assert.match(backfill, /FROM "experience_brick"/);
  assert.match(backfill, /"start_date" IS NULL/);
  assert.match(backfill, /"end_date" IS NULL/);
  assert.match(backfill, /NOT "is_current"/);
  assert.match(
    backfill,
    /BTRIM\(\("matched"\."dash_match"\)\[1\]\) AS "range_start"/,
    "range endpoints must be trimmed before month-name and mixed parsing",
  );

  for (const formatBranch of [
    "dot_range",
    "dot_current",
    "iso_tilde_range",
    "iso_tilde_current",
    "year_range",
    "year_current",
    "english_range",
    "english_current",
    "compatible_range",
    "single_month",
    "until_month",
    "present_only",
  ]) {
    assert.match(backfill, new RegExp(`AS "${formatBranch}"`), `missing ${formatBranch} parser branch`);
  }
  assert.match(backfill, /'january'/i);
  assert.match(backfill, /'december'/i);
  assert.match(backfill, /현재/);
  assert.match(backfill, /"parsed_end_date" >= "parsed_start_date"/);
  assert.doesNotMatch(
    backfill,
    /career_fact|trust_status|'TRUSTED'/i,
    "migration parsing must not manufacture trusted date facts",
  );

  const backfillEnd = migration.indexOf("-- END legacy period-only backfill");
  const contradictionRepairStart = migration.indexOf(
    "-- Repair structured date contradictions before adding/validating constraints.",
  );
  const candidateProjectionStart = migration.indexOf('WITH "candidate_desired_period" AS');
  const firstExperienceRepair = migration.indexOf('WITH repaired_experience AS', backfillEnd);
  const secondExperienceRepair = migration.indexOf(
    'WITH repaired_experience AS',
    firstExperienceRepair + 1,
  );
  const experienceProjectionStart = migration.indexOf('WITH "experience_desired_period" AS');
  assert.ok(
    backfillEnd < contradictionRepairStart &&
      contradictionRepairStart < candidateProjectionStart,
    "candidate legacy parsing and contradiction repairs must precede canonical projection",
  );
  assert.ok(
    backfillEnd < firstExperienceRepair &&
      firstExperienceRepair < secondExperienceRepair &&
      secondExperienceRepair < experienceProjectionStart,
    "experience legacy parsing and both contradiction repairs must precede canonical projection",
  );
  assert.ok(
    candidateProjectionStart < firstExperienceRepair,
    "candidate projection must complete before experience contradiction repair and projection",
  );
});

test("follow-up migration relaxes approved CREATE targets and cascades target deletion", async () => {
  const [schema, initialMigration, followUpMigration] = await Promise.all([
    readFile(schemaPath, "utf8"),
    readFile(initialCareerMigrationPath, "utf8"),
    readFile(createTargetMigrationPath, "utf8"),
  ]);

  assert.match(
    followUpMigration,
    /DROP CONSTRAINT "career_candidate_mode_target_check"[\s\S]*ADD CONSTRAINT "career_candidate_mode_target_check"/,
  );
  assert.match(
    followUpMigration,
    /"mode" = 'CREATE'[\s\S]*"target_experience_id" IS NULL[\s\S]*OR "status" = 'APPROVED'/,
  );
  assert.match(
    initialMigration,
    /"career_experience_candidate_target_experience_id_fkey"[^\n]*ON DELETE SET NULL/,
  );
  assert.match(
    followUpMigration,
    /DROP CONSTRAINT "career_experience_candidate_target_experience_id_fkey"[\s\S]*ADD CONSTRAINT "career_experience_candidate_target_experience_id_fkey"[\s\S]*ON DELETE CASCADE ON UPDATE CASCADE/,
  );
  assert.match(
    schema,
    /targetExperience\s+ExperienceBrick\?[^\n]*onDelete:\s*Cascade/,
  );
});

test("hardening migration trusts only low-risk summaries for provably manual legacy memory", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const summaryPromotion = [...migration.matchAll(
    /UPDATE "career_fact" AS fact\s+SET "trust_status" = 'TRUSTED'[\s\S]*?;/g,
  )]
    .map((match) => match[0])
    .find((statement) => /fact\."kind" = 'SUMMARY'/.test(statement));

  assert.ok(summaryPromotion, "missing deterministic legacy summary promotion");
  assert.match(summaryPromotion, /fact\."kind" = 'SUMMARY'/);
  assert.match(summaryPromotion, /experience\."source" = 'MANUAL'/);
  assert.match(summaryPromotion, /candidate\."source_id" IS NOT NULL/);
  assert.doesNotMatch(
    summaryPromotion,
    /ORGANIZATION|TITLE|START_DATE|END_DATE|METRIC/,
    "high-risk facts must not be mass-promoted",
  );
});
