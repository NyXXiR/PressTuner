import { Prisma } from "@prisma/client";

import {
  evaluateEvidenceFactConsistency,
  type EvidenceFactConsistencyEvaluation,
  type EvidenceFactSource,
} from "@/domain/article/evidenceFactConsistency";
import { prisma } from "@/lib/prisma";

type EvidenceFactRow = Readonly<{
  chunkId: string;
  documentId: string;
  sourceVersion: number | bigint;
  pageStart: number;
  pageEnd: number;
  content: string;
}>;

type RawQueryClient = Readonly<{
  $queryRaw<T>(query: Prisma.Sql): Promise<T>;
}>;

const PAGE_SIZE = 200;
const MAX_EXCERPT_LENGTH = 2_000;

/**
 * Deterministically scans every numeric FACT chunk that is authoritative for the
 * team at query time. This intentionally does not use ranked/top-K retrieval.
 */
export async function loadEligibleEvidenceFactSources(
  teamId: string,
  client: RawQueryClient = prisma,
): Promise<EvidenceFactSource[]> {
  const sources: EvidenceFactSource[] = [];
  let cursor: string | null = null;
  for (;;) {
    const rows: EvidenceFactRow[] = await client.$queryRaw<EvidenceFactRow[]>(Prisma.sql`
      SELECT
        kc."id" AS "chunkId",
        kd."id" AS "documentId",
        kd."source_version" AS "sourceVersion",
        kc."page_start" AS "pageStart",
        kc."page_end" AS "pageEnd",
        kc."content"
      FROM "knowledge_chunk" kc
      JOIN "knowledge_document" kd
        ON kd."id" = kc."document_id"
      WHERE kd."team_id" = ${teamId}
        AND kc."team_id" = ${teamId}
        AND kd."status" = 'READY'
        AND kd."deleted_at" IS NULL
        AND kc."generation_id" = kd."active_generation_id"
        AND COALESCE(kd."classification_override", kc."auto_role") = 'FACT'
        AND kc."content" ~ '[0-9０-９]'
        AND kc."content" ~* '(원|KRW|₩)'
        AND (${cursor}::text IS NULL OR kc."id" > ${cursor})
        AND NOT EXISTS (
          SELECT 1
          FROM "knowledge_document" successor
          WHERE successor."replaces_document_id" = kd."id"
            AND successor."team_id" = ${teamId}
            AND successor."deleted_at" IS NULL
            AND successor."status" = 'READY'
        )
      ORDER BY kc."id" ASC
      LIMIT ${PAGE_SIZE}
    `);
    if (rows.length === 0) break;
    sources.push(...rows.map((row) => ({
      documentId: row.documentId,
      sourceVersion: Number(row.sourceVersion),
      chunkId: row.chunkId,
      pageStart: row.pageStart,
      pageEnd: row.pageEnd,
      content: row.content,
      excerpt: row.content.slice(0, MAX_EXCERPT_LENGTH),
    })));
    const nextCursor: string = rows.at(-1)!.chunkId;
    if (nextCursor === cursor) throw new Error("EVIDENCE_FACT_SCAN_CURSOR_STALLED");
    cursor = nextCursor;
  }
  return sources;
}

export async function evaluateTeamEvidenceFactConsistency(
  args: { teamId: string; draftText: string },
  dependencies: {
    loadSources?: (teamId: string) => Promise<readonly EvidenceFactSource[]>;
  } = {},
): Promise<EvidenceFactConsistencyEvaluation> {
  const sources = await (dependencies.loadSources ?? loadEligibleEvidenceFactSources)(args.teamId);
  return evaluateEvidenceFactConsistency({ draftText: args.draftText, sources });
}
