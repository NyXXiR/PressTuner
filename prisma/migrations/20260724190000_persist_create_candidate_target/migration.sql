-- A decided CREATE candidate owns the durable pointer to the experience produced by
-- approval. Pending/rejected CREATE candidates still cannot target an experience.
-- Legacy PATCH candidates durably distinguish complete replacement snapshots from
-- ordinary additive AUGMENT candidates.
ALTER TABLE "career_experience_candidate"
  ADD COLUMN "replacement_snapshot" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "career_experience_candidate"
  DROP CONSTRAINT "career_candidate_mode_target_check",
  ADD CONSTRAINT "career_candidate_mode_target_check" CHECK (
    (
      "mode" = 'CREATE'
      AND (
        "target_experience_id" IS NULL
        OR "status" = 'APPROVED'
      )
    )
    OR (
      "mode" IN ('LINK', 'AUGMENT')
      AND "target_experience_id" IS NOT NULL
    )
  );

-- Targeted candidates are review state owned by the target experience. Deleting
-- that experience removes its approved CREATE candidate plus pending or decided
-- LINK/AUGMENT candidates; evidence follows the candidate cascade while unrelated
-- owner data remains.
ALTER TABLE "career_experience_candidate"
  DROP CONSTRAINT "career_experience_candidate_target_experience_id_fkey",
  ADD CONSTRAINT "career_experience_candidate_target_experience_id_fkey"
    FOREIGN KEY ("target_experience_id") REFERENCES "experience_brick"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
