import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("career source upload is asynchronous and active-source dedupe is not a schema unique", async () => {
  const [route, schema, migration] = await Promise.all([
    source("app/api/resume/career/sources/route.ts"),
    source("prisma/schema.prisma"),
    source("prisma/migrations/20260724120000_add_career_memory_rag/migration.sql"),
  ]);
  assert.match(route, /status: result\.deduplicated \? 200 : 202/);
  assert.doesNotMatch(schema, /@@unique\(\[userId, checksum/);
  assert.doesNotMatch(
    migration,
    /UNIQUE[^;\n]*career_source[^;\n]*(user_id|checksum)/i,
  );
});

test("career retrieval and legacy ranking are owner-scoped and persisted-vector only", async () => {
  const [retrieval, ranking] = await Promise.all([
    source("lib/services/resume/careerRetrievalService.ts"),
    source("lib/services/resume/resumeRagService.ts"),
  ]);
  for (const text of [retrieval, ranking]) {
    assert.match(text, /"user_id"\s*=\s*\$\{/);
    assert.match(text, /"embedding"\s+IS NOT NULL/);
    assert.match(text, /"embedding_content_hash"\s+IS NOT NULL/);
  }
  assert.doesNotMatch(ranking, /bricks\.map\(async/);
});

test("question completion has one authoritative isCompleted=true write", async () => {
  const [finalization, legacyCompletion, resumeService] = await Promise.all([
    source("lib/services/resume/careerFinalizationService.ts"),
    source("lib/services/resume/resumeWritingCompletionService.ts"),
    source("lib/services/resume/resumeService.ts"),
  ]);
  assert.match(finalization, /data: \{ isCompleted: true \}/);
  assert.doesNotMatch(legacyCompletion, /isCompleted:\s*true/);
  assert.doesNotMatch(resumeService, /data:\s*\{\s*isCompleted:\s*true/);
  assert.match(resumeService, /finalizeCareerAnswer/);
});

test("final-answer extraction has a durable bounded retry surface", async () => {
  const [schema, migration, taskService, completionRoute, retryRoute, batchRoute] =
    await Promise.all([
      source("prisma/schema.prisma"),
      source(
        "prisma/migrations/20260727090000_add_career_final_answer_capture_tasks/migration.sql",
      ),
      source(
        "lib/services/resume/careerFinalAnswerCaptureTaskService.ts",
      ),
      source(
        "app/api/resume/writing-workspaces/[applicationId]/questions/[questionId]/complete/route.ts",
      ),
      source(
        "app/api/resume/writing-workspaces/[applicationId]/capture-tasks/[taskId]/retry/route.ts",
      ),
      source("app/api/internal/career-memory/capture-retries/route.ts"),
    ]);
  assert.match(schema, /model CareerFinalAnswerCaptureTask/);
  assert.match(schema, /@@unique\(\[userId, questionId, answerHash, answerRevision\]\)/);
  assert.match(migration, /ON DELETE SET NULL/);
  assert.match(taskService, /processingToken/);
  assert.match(taskService, /CAREER_CAPTURE_LEASE_MS/);
  assert.match(taskService, /attemptCount: \{ increment: 1 \}/);
  assert.match(taskService, /ApplicationStatus\.WRITING/);
  assert.match(completionRoute, /completeResumeWritingQuestionWithServices/);
  assert.match(retryRoute, /APPLICATION_REOPEN_REQUIRED|retryCareerFinalAnswerCaptureTask/);
  assert.match(batchRoute, /timingSafeEqual/);
  assert.match(batchRoute, /Math\.min\(20, Math\.max\(1/);
});

test("empty career memory keeps manual writing and structured recovery", async () => {
  const [writing, generateRoute, repolishRoute, review, editor] =
    await Promise.all([
      source("lib/services/resume/careerWritingService.ts"),
      source("app/api/resume/generate/route.ts"),
      source("app/api/resume/repolish/route.ts"),
      source("app/resume/write/components/FlowReview.tsx"),
      source("app/resume/write/components/FlowDraftEditor.tsx"),
    ]);
  assert.match(writing, /manualWritingAllowed: true/);
  assert.match(writing, /memoryReadiness/);
  for (const route of [generateRoute, repolishRoute]) {
    assert.match(route, /e\?\.code === "CAREER_MEMORY_NOT_INDEXED"/);
  }
  assert.match(review, /href="\/resume\/bricks"/);
  assert.match(editor, /초안 없이도 아래에 직접 작성/);
  assert.match(editor, /href="\/resume\/bricks"/);
});

test("source deletion purges bytes and chunks while preserving immutable evidence", async () => {
  const service = await source("lib/services/resume/careerSourceService.ts");
  assert.match(service, /careerSourceChunk\.deleteMany/);
  assert.match(service, /sourceData: null/);
  assert.match(service, /CareerExperienceStatus\.NEEDS_REVIEW/);
  assert.doesNotMatch(service, /careerCandidateEvidence\.deleteMany/);
  assert.doesNotMatch(service, /careerFactEvidence\.deleteMany/);
});

test("career hardening migration never promotes legacy DIRECT_INPUT facts without exact hashes", async () => {
  const migration = await source(
    "prisma/migrations/20260724180000_harden_career_memory_flow/migration.sql",
  );
  assert.doesNotMatch(
    migration,
    /UPDATE\s+"career_fact"[\s\S]*?SET\s+"trust_status"\s*=\s*'TRUSTED'[\s\S]*?candidate\."origin"\s*=\s*'DIRECT_INPUT'/i,
  );
});

test("career hardening migration only rewrites changed canonical period projections", async () => {
  const migration = await source(
    "prisma/migrations/20260724180000_harden_career_memory_flow/migration.sql",
  );
  const projectionSection = migration.slice(
    migration.indexOf("-- period is a display projection"),
    migration.indexOf("CREATE INDEX", migration.indexOf("-- period is a display projection")),
  );

  assert.match(projectionSection, /candidate_desired_period/i);
  assert.match(projectionSection, /experience_desired_period/i);
  assert.match(
    projectionSection,
    /candidate\."period"\s+IS\s+DISTINCT\s+FROM\s+desired\."desired_period"/i,
  );
  assert.match(
    projectionSection,
    /experience\."period"\s+IS\s+DISTINCT\s+FROM\s+desired\."desired_period"/i,
  );
  const candidateProjection = projectionSection.match(
    /WITH\s+"candidate_desired_period"[\s\S]*?AND\s+candidate\."period"\s+IS\s+DISTINCT\s+FROM\s+desired\."desired_period"\s*;/i,
  )?.[0];
  const experienceProjection = projectionSection.match(
    /WITH\s+"experience_desired_period"[\s\S]*?AND\s+experience\."period"\s+IS\s+DISTINCT\s+FROM\s+desired\."desired_period"\s*;/i,
  )?.[0];
  assert.ok(candidateProjection);
  assert.ok(experienceProjection);
  assert.equal(
    (candidateProjection.match(/"updated_at"\s*=\s*CURRENT_TIMESTAMP/gi) ?? []).length,
    1,
  );
  assert.equal(
    (experienceProjection.match(/"updated_at"\s*=\s*CURRENT_TIMESTAMP/gi) ?? []).length,
    1,
  );
});

test("POST and PATCH routes consume the shared bounded candidate field schemas", async () => {
  const [postRoute, patchRoute] = await Promise.all([
    source("app/api/resume/career/candidates/route.ts"),
    source("app/api/resume/career/candidates/[candidateId]/route.ts"),
  ]);
  assert.match(postRoute, /careerCandidateCreateFieldsSchema/);
  assert.match(patchRoute, /careerCandidatePatchFieldsSchema/);
});

test("legacy batch route extends the shared candidate schema and uses its policy bound", async () => {
  const [batchRoute, policy] = await Promise.all([
    source("app/api/resume/bricks/batch/route.ts"),
    source("domain/career-memory/candidatePolicy.ts"),
  ]);
  assert.match(batchRoute, /careerCandidateCreateFieldsSchema\.extend/);
  assert.match(batchRoute, /\.max\(CAREER_CANDIDATE_BATCH_LIMIT\)/);
  assert.match(policy, /export const CAREER_CANDIDATE_BATCH_LIMIT\s*=\s*20/);
});

test("replacement snapshot marker is durable in the app schema and follow-up migration", async () => {
  const [schema, migration] = await Promise.all([
    source("prisma/schema.prisma"),
    source("prisma/migrations/20260724190000_persist_create_candidate_target/migration.sql"),
  ]);
  assert.match(
    schema,
    /replacementSnapshot\s+Boolean\s+@default\(false\)\s+@map\("replacement_snapshot"\)/,
  );
  assert.match(
    migration,
    /ADD COLUMN "replacement_snapshot" BOOLEAN NOT NULL DEFAULT false/,
  );
});

test("verification UI presents readable grounding instead of raw ID lists", async () => {
  const panel = await source(
    "app/resume/write/components/FlowVerificationPanel.tsx",
  );
  assert.match(panel, /experience\.title/);
  assert.match(panel, /experience\.organization/);
  assert.match(panel, /fact\.kind/);
  assert.match(panel, /fact\.value/);
  assert.match(panel, /evidence\.documentName/);
  assert.match(panel, /evidence\.excerpt/);
  assert.doesNotMatch(panel, /experienceIds\.join/);
  assert.doesNotMatch(panel, /factIds\.join/);
});

test("career source UI refreshes candidates once on READY and exposes recoverable operations", async () => {
  const sourceList = await source("components/resume/CareerSourceList.tsx");
  assert.match(sourceList, /notifiedReadySourceIds/);
  assert.match(sourceList, /previousStatus/);
  assert.match(sourceList, /previousStatus\s*&&\s*busy\.has\(previousStatus\)/);
  assert.match(sourceList, /onChangedRef\.current\?\.\(\)/);
  assert.match(sourceList, /loadError/);
  assert.match(sourceList, /operationErrors\[source\.id\]/);
  assert.match(sourceList, /operationLocks\.current\.has\(source\.id\)/);
  assert.match(sourceList, /disabled=\{Boolean\(operations\[source\.id\]\)\}/);
  assert.match(sourceList, /if \(!response\.ok\)\s*\{\s*throw/);
});

test("career candidate review preserves failed cards and serializes save then approval", async () => {
  const review = await source("components/resume/CareerCandidateReview.tsx");
  assert.match(review, /loadError/);
  assert.match(review, /operationErrors\[candidate\.id\]/);
  assert.match(review, /operationLocks\.current\.has\(candidate\.id\)/);
  assert.match(review, /operation === "saving"/);
  assert.match(review, /operation === "approving"/);
  assert.match(review, /if \(!saved\.ok\) throw/);
  assert.match(review, /if \(!approved\.ok\) throw/);
  assert.match(review, /disabled=\{Boolean\(operation\)/);
  assert.doesNotMatch(review, /if \(!saved\.ok\) return/);
});

test("career memory wall exposes review-only status and an explicit reconfirm path", async () => {
  const [page, store, service] = await Promise.all([
    source("app/resume/bricks/page.tsx"),
    source("stores/resume/useResumeBrickStore.ts"),
    source("lib/services/resume/resumeBrickService.ts"),
  ]);
  assert.match(store, /memoryStatus: "CONFIRMED" \| "NEEDS_REVIEW"/);
  assert.match(service, /memoryStatus:\s*true/);
  assert.match(page, /brick\.memoryStatus === "NEEDS_REVIEW"/);
  assert.match(page, /내용 확인 후 다시 승인/);
  assert.match(page, /재확인 전에는 글쓰기에 사용되지 않습니다/);
});

test("career candidate dates show a client-side invalid-order error", async () => {
  const fields = await source("components/resume/CareerExperienceFields.tsx");
  assert.match(fields, /dateOrderError/);
  assert.match(fields, /종료일은 시작일보다 빠를 수 없습니다/);
  assert.match(fields, /aria-invalid=\{Boolean\(dateOrderError\)\}/);
});
