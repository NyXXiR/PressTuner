import { Prisma, type PrismaClient, type PressQualityStudy } from "@prisma/client";
import type { Study } from "../../../../domain/press-workflow/evaluation/study-contracts";
import { requireStudy } from "../../../../domain/press-workflow/evaluation/study";
import { hash } from "../../../../domain/press-workflow/evaluation/contracts";
import { serviceError } from "../../serviceError";
import type { StudyRecord, StudyRepository } from "./studyService";

function decode(row: PressQualityStudy): StudyRecord {
  const data = structuredClone(row.data) as unknown as Study;
  requireStudy(data.version === "press-quality-study/v1", "UNSUPPORTED_STUDY_VERSION");
  return { id: row.id, teamId: row.teamId, createdById: row.createdById, createHash: row.createHash, revision: row.revision, data };
}
function encode(data: Study) {
  const serialized = JSON.stringify(data);
  requireStudy(Buffer.byteLength(serialized) <= 8 * 1024 * 1024, "STUDY_STORAGE_LIMIT");
  return JSON.parse(serialized) as Prisma.InputJsonValue;
}
export function makeStudyRepository(db: PrismaClient): StudyRepository {
  return {
    async create(row) {
      return db.$transaction(async tx => {
        await tx.$queryRaw`SELECT set_config('idle_in_transaction_session_timeout', '60000', true), set_config('statement_timeout', '55000', true), set_config('lock_timeout', '10000', true)`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quality-study:${row.teamId}`}))`;
        const existing = await tx.pressQualityStudy.findUnique({ where: { id: row.id } });
        if (existing) { requireStudy(existing.teamId === row.teamId && existing.createdById === row.createdById && existing.createHash === row.createHash, "STUDY_IDEMPOTENCY_CONFLICT"); return decode(existing); }
        requireStudy(await tx.pressQualityStudy.count({ where: { teamId: row.teamId } }) < 50, "TEAM_STUDY_LIMIT");
        return decode(await tx.pressQualityStudy.create({ data: { ...row, name: row.data.name, data: encode(row.data) } }));
      }, { timeout: 60000, maxWait: 10000 });
    },
    async list(teamId) { return db.pressQualityStudy.findMany({ where: { teamId }, select: { id: true, revision: true, name: true }, orderBy: { createdAt: "desc" }, take: 50 }); },
    async get(id, teamId) {
      const row = await db.pressQualityStudy.findFirst({ where: { id, teamId } });
      if (!row) throw serviceError(404, "STUDY_NOT_FOUND", "평가 연구를 찾을 수 없습니다."); return decode(row);
    },
    async mutate(id, teamId, change) {
      return db.$transaction(async tx => {
        // Server-side limits release locks even if the Node connection vanishes.
        await tx.$queryRaw`SELECT set_config('idle_in_transaction_session_timeout', '60000', true), set_config('statement_timeout', '55000', true), set_config('lock_timeout', '10000', true)`;
        // Serialize source assignment and aggregate mutation in a fixed lock order.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`quality-study:${teamId}`}))`;
        await tx.$queryRaw`SELECT id FROM press_quality_study WHERE id = ${id} AND team_id = ${teamId} FOR UPDATE`;
        const current = await tx.pressQualityStudy.findFirst({ where: { id, teamId } });
        if (!current) throw serviceError(404, "STUDY_NOT_FOUND", "평가 연구를 찾을 수 없습니다.");
        const row = decode(current); change(row);
        if (row.revision === current.revision) return row;
        requireStudy(row.revision === current.revision + 1, "INVALID_STUDY_REVISION");
        if ((current.data as unknown as Study).samples.length !== row.data.samples.length) {
          const assignments = row.data.samples.flatMap(x => x.sourceKeys.map(key => ({ teamId, sourceHash: hash(key), partition: x.partition, firstStudyId: id })));
          const prior = await tx.pressQualitySourceAssignment.findMany({ where: { teamId, sourceHash: { in: assignments.map(x => x.sourceHash) } } });
          requireStudy(assignments.every(x => prior.every(p => p.sourceHash !== x.sourceHash || p.partition === x.partition)), "CROSS_STUDY_SOURCE_SPLIT_LEAKAGE");
          await tx.pressQualitySourceAssignment.createMany({ data: assignments, skipDuplicates: true });
        }
        return decode(await tx.pressQualityStudy.update({ where: { id }, data: { revision: row.revision, data: encode(row.data) } }));
      }, { timeout: 60000, maxWait: 10000 });
    },
  };
}
