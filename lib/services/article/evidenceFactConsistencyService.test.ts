import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

import {
  evaluateTeamEvidenceFactConsistency,
  loadEligibleEvidenceFactSources,
} from "./evidenceFactConsistencyService";

test("READY FACT scan encodes team, active generation, deletion and READY-successor rules", async () => {
  const source = await readFile(
    "lib/services/article/evidenceFactConsistencyService.ts",
    "utf8",
  );
  for (const predicate of [
    'kd."team_id" = ${teamId}',
    'kd."status" = \'READY\'',
    'kd."deleted_at" IS NULL',
    'kc."generation_id" = kd."active_generation_id"',
    'COALESCE(kd."classification_override", kc."auto_role") = \'FACT\'',
    'successor."replaces_document_id" = kd."id"',
    'successor."status" = \'READY\'',
  ]) assert.match(source, new RegExp(predicate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("reader cursor-pages deterministically and preserves source lineage", async () => {
  const pages = [
    [{
      chunkId: "chunk-a", documentId: "document-a", sourceVersion: 3,
      pageStart: 2, pageEnd: 4, content: "2026년 매출 200억원",
    }],
    [],
  ];
  const queries: unknown[] = [];
  const client = {
    async $queryRaw<T>(query: unknown) {
      queries.push(query);
      return pages.shift() as T;
    },
  };
  const sources = await loadEligibleEvidenceFactSources("team-a", client);
  assert.equal(queries.length, 2);
  assert.deepEqual(sources, [{
    chunkId: "chunk-a",
    documentId: "document-a",
    sourceVersion: 3,
    pageStart: 2,
    pageEnd: 4,
    content: "2026년 매출 200억원",
    excerpt: "2026년 매출 200억원",
  }]);
});

test("team service scans all eligible chunks so independent source conflicts survive", async () => {
  const evaluation = await evaluateTeamEvidenceFactConsistency({
    teamId: "team-a",
    draftText: "2026년 매출 200억원",
  }, {
    loadSources: async () => [
      { documentId: "a", sourceVersion: 1, chunkId: "a-1", pageStart: 1, pageEnd: 1, excerpt: "a", content: "2026년 매출 200억원" },
      { documentId: "b", sourceVersion: 1, chunkId: "b-1", pageStart: 1, pageEnd: 1, excerpt: "b", content: "2026년 매출 300억원" },
    ],
  });
  assert.equal(evaluation.verdict, "BLOCK");
  assert.equal(evaluation.findings[0]?.reasonCode, "SOURCE_CONFLICT");
});

test("database scan returns only current-team READY effective FACT active-generation leaves", async () => {
  const suffix = randomUUID();
  const team = await prisma.team.create({ data: { slug: `efc-${suffix}`, name: "EFC" } });
  const other = await prisma.team.create({ data: { slug: `efc-other-${suffix}`, name: "EFC other" } });
  const create = async (args: { teamId?: string; label: string; status?: "READY" | "INDEXING"; role?: "FACT" | "STYLE_POLICY"; active?: boolean; deleted?: boolean; replacesDocumentId?: string }) => {
    const owner = args.teamId ?? team.id;
    const document = await prisma.knowledgeDocument.create({ data: {
      teamId: owner, originalName: `${args.label}.pdf`, mimeType: "application/pdf", byteSize: 10,
      storageKey: `efc/${suffix}/${args.label}`, checksum: `${suffix}-${args.label}`,
      status: args.status ?? "READY", classificationOverride: args.role ?? "FACT",
      deletedAt: args.deleted ? new Date() : null, replacesDocumentId: args.replacesDocumentId,
    } });
    const generation = await prisma.knowledgeIndexGeneration.create({ data: {
      documentId: document.id, generation: 1, fingerprint: `${suffix}-${args.label}`,
      parserVersion: "test", chunkerVersion: "test", embeddingModel: "test", embeddingDimensions: 1536,
      indexStatus: "READY", classificationStatus: "READY",
    } });
    const chunk = await prisma.knowledgeChunk.create({ data: {
      teamId: owner, documentId: document.id, generationId: generation.id, ordinal: 0,
      content: `Bridge는 2026년 매출 ${args.label === "eligible" ? "200" : "999"}억원을 기록했다.`,
      pageStart: 1, pageEnd: 2, contentHash: `${suffix}-${args.label}`, parserVersion: "test", autoRole: "FACT",
    } });
    if (args.active !== false) await prisma.knowledgeDocument.update({ where: { id: document.id }, data: { activeGenerationId: generation.id } });
    return { document, generation, chunk };
  };
  try {
    const eligible = await create({ label: "eligible" });
    await create({ label: "other-team", teamId: other.id });
    await create({ label: "pending", status: "INDEXING" });
    await create({ label: "style", role: "STYLE_POLICY" });
    await create({ label: "inactive", active: false });
    await create({ label: "deleted", deleted: true });
    const predecessor = await create({ label: "predecessor" });
    const successor = await create({ label: "successor", replacesDocumentId: predecessor.document.id });
    const pendingPredecessor = await create({ label: "pending-predecessor" });
    await create({ label: "pending-successor", status: "INDEXING", replacesDocumentId: pendingPredecessor.document.id });
    const sources = await loadEligibleEvidenceFactSources(team.id);
    assert.deepEqual(new Set(sources.map((item) => item.chunkId)), new Set([eligible.chunk.id, successor.chunk.id, pendingPredecessor.chunk.id]));
    const eligibleSource = sources.find((item) => item.chunkId === eligible.chunk.id);
    assert.deepEqual(eligibleSource && { documentId: eligibleSource.documentId, sourceVersion: eligibleSource.sourceVersion, pageStart: eligibleSource.pageStart, pageEnd: eligibleSource.pageEnd, excerpt: eligibleSource.excerpt }, {
      documentId: eligible.document.id, sourceVersion: 1, pageStart: 1, pageEnd: 2,
      excerpt: "Bridge는 2026년 매출 200억원을 기록했다.",
    });
  } finally {
    await prisma.team.deleteMany({ where: { id: { in: [team.id, other.id] } } });
  }
});
