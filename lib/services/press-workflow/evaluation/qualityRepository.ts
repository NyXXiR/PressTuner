import { Prisma, type PrismaClient, type ArticleQualityEvaluation } from "@prisma/client";
import type { QualityRun, QualityMetric, QualityProfile, QualitySnapshot } from "../../../../domain/press-workflow/evaluation/article-evaluation";
import type { QualityRepository } from "./articleEvaluation";
import { serviceError } from "../../serviceError";

const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function decode(row: ArticleQualityEvaluation): QualityRun {
  return { ...row, kind: row.kind as QualityRun["kind"], status: row.status as QualityRun["status"],
    snapshot: row.snapshot as unknown as QualitySnapshot, profile: row.profile as unknown as QualityProfile,
    results: row.results as unknown as QualityMetric[], createdAt: row.createdAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null };
}
export function makeQualityRepository(db: PrismaClient): QualityRepository {
  async function expire(articleId: string) {
    await db.articleQualityEvaluation.updateMany({ where: { articleId, status: "RUNNING", deadlineAt: { lte: new Date() } }, data: { status: "INTERRUPTED", finishedAt: new Date() } });
  }
  return {
    async list(articleId) {
      await expire(articleId);
      return (await db.articleQualityEvaluation.findMany({ where: { articleId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10 })).map(decode);
    },
    async find(articleId, id) { await expire(articleId); const row = await db.articleQualityEvaluation.findFirst({ where: { id, articleId } }); return row ? decode(row) : null; },
    async reserve(value) {
      return db.$transaction(async tx => {
        // One short DB lock serializes reservation + expiration across Node processes.
        // Two active attempts globally match this bounded synchronous demo's capacity.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('press-quality-reservations'))`;
        await tx.articleQualityEvaluation.updateMany({ where: { status: "RUNNING", deadlineAt: { lte: new Date() } }, data: { status: "INTERRUPTED", finishedAt: new Date() } });
        const existing = await tx.articleQualityEvaluation.findUnique({ where: { articleId_idempotencyKey: { articleId: value.articleId, idempotencyKey: value.idempotencyKey } } });
        if (existing) {
          if (existing.requestHash !== value.requestHash) throw serviceError(409, "IDEMPOTENCY_CONFLICT", "같은 요청 ID의 원고 또는 평가 조건이 변경됐습니다. 새 평가로 실행해 주세요.");
          return { run: decode(existing), created: false };
        }
        const active = await tx.articleQualityEvaluation.findMany({ where: { status: "RUNNING" }, select: { articleId: true }, take: 2 });
        if (active.length >= 2 || active.some(r => r.articleId === value.articleId)) throw serviceError(429, "QUALITY_BUSY", "평가가 진행 중입니다. 잠시 후 다시 실행해 주세요.");
        const row = await tx.articleQualityEvaluation.create({ data: { ...value, snapshot: json(value.snapshot), profile: json(value.profile), results: json(value.results), deadlineAt: new Date(Date.now() + 8 * 60_000) } });
        return { run: decode(row), created: true };
      }, { timeout: 30000, maxWait: 10000 });
    },
    async record(id, result) {
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM article_quality_evaluation WHERE id = ${id} FOR UPDATE`;
        const row = await tx.articleQualityEvaluation.findUniqueOrThrow({ where: { id } });
        if (row.status !== "RUNNING" || row.deadlineAt.getTime() <= Date.now()) throw serviceError(409, "QUALITY_ATTEMPT_EXPIRED", "평가 시도가 종료됐습니다. 저장된 결과를 확인해 주세요.");
        const results = decode(row).results;
        if (results.some(r => r.id === result.id)) throw new Error("DUPLICATE_METRIC_WRITE");
        await tx.articleQualityEvaluation.update({ where: { id }, data: { results: json([...results, result]) } });
      }, { timeout: 30000, maxWait: 10000 });
    },
    async finish(id, status) {
      await db.articleQualityEvaluation.updateMany({ where: { id, status: "RUNNING", deadlineAt: { gt: new Date() } }, data: { status, finishedAt: new Date() } });
      const row = await db.articleQualityEvaluation.findUniqueOrThrow({ where: { id } });
      await expire(row.articleId);
      return decode(await db.articleQualityEvaluation.findUniqueOrThrow({ where: { id } }));
    },
  };
}
