import { createHash } from "node:crypto";

import {
  BrickSource,
  CareerEvidenceOrigin,
  CareerExperienceStatus,
  CareerExperienceType,
  CareerFactKind,
  CareerFactTrustStatus,
  KnowledgeChunkRole,
  KnowledgeClassificationStatus,
  KnowledgeDocumentStatus,
  KnowledgeGenerationStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  decideDevRagFixtureTransition,
  PRESS_DEV_RAG_FIXTURE_CONTENT,
  type DevRagFixtureState,
} from "@/domain/dev-rag-fixtures/contracts";
import {
  fingerprintCareerValue,
} from "@/domain/career-memory/evidencePolicy";
import { normalizeCareerFactValue } from "@/domain/career-memory/factProjection";
import { prisma } from "@/lib/prisma";
import { lockKnowledgeTeam } from "@/lib/services/knowledge/knowledgeTransaction";

export const PRESS_FIXTURE_VERSION = "press-rag-qa-v1";
export const PRESS_FIXTURE_SUMMARY =
  "brieFFlow Press RAG QA fixture — 2026 launch facts";
export const RESUME_FIXTURE_VERSION = "resume-rag-qa-v1";
export const RESUME_FIXTURE_SUMMARY =
  "brieFFlow Resume RAG QA fixture — Korean product growth experience";

const RESUME_TAG = `dev-rag-fixture:${RESUME_FIXTURE_VERSION}`;
const RESUME_EXPERIENCE = {
  title: "제품 성장 실험 리드",
  content:
    "브리프플로에서 온보딩 실험을 설계하고 데이터 기반 개선으로 전환율을 높였다.",
  organization: "브리프플로",
  roleTitle: "제품 성장 매니저",
  period: "2025.01–2026.06",
  startDate: new Date("2025-01-01T00:00:00.000Z"),
  endDate: new Date("2026-06-30T00:00:00.000Z"),
  actions: ["사용자 인터뷰 24건과 퍼널 분석으로 온보딩 병목을 정의했다."],
  outcomes: ["개인화 체크리스트를 출시해 활성화율을 개선했다."],
  metrics: ["신규 사용자 7일 활성화율을 28%에서 41%로 높였다."],
  tools: ["SQL", "Amplitude", "Figma"],
  tags: [RESUME_TAG, "제품 성장", "온보딩"],
} as const;

type ResourceRead = { mounted: boolean; resourceVersion: number };
type TransitionWrite = { affectedArticles?: number };

export type DevRagFixtureTransaction = unknown;

export interface DevRagFixtureRepository {
  transaction<T>(
    operation: (tx: DevRagFixtureTransaction) => Promise<T>,
  ): Promise<T>;
  lockPress(tx: DevRagFixtureTransaction, teamId: string): Promise<void>;
  lockResume(tx: DevRagFixtureTransaction, userId: string): Promise<void>;
  readPress(
    tx: DevRagFixtureTransaction,
    teamId: string,
    identity: ReturnType<typeof pressFixtureIdentity>,
  ): Promise<ResourceRead>;
  readResume(
    tx: DevRagFixtureTransaction,
    userId: string,
    identity: ReturnType<typeof resumeFixtureIdentity>,
  ): Promise<ResourceRead>;
  mountPress(
    tx: DevRagFixtureTransaction,
    input: {
      teamId: string;
      userId: string;
      identity: ReturnType<typeof pressFixtureIdentity>;
    },
  ): Promise<TransitionWrite>;
  unmountPress(
    tx: DevRagFixtureTransaction,
    input: {
      teamId: string;
      identity: ReturnType<typeof pressFixtureIdentity>;
    },
  ): Promise<TransitionWrite>;
  mountResume(
    tx: DevRagFixtureTransaction,
    input: {
      userId: string;
      teamId: string;
      identity: ReturnType<typeof resumeFixtureIdentity>;
    },
  ): Promise<TransitionWrite>;
  unmountResume(
    tx: DevRagFixtureTransaction,
    input: {
      userId: string;
      identity: ReturnType<typeof resumeFixtureIdentity>;
    },
  ): Promise<TransitionWrite>;
  incrementPressVersion(
    tx: DevRagFixtureTransaction,
    teamId: string,
  ): Promise<number>;
  incrementResumeVersion(
    tx: DevRagFixtureTransaction,
    userId: string,
  ): Promise<number>;
}

function digest(...parts: string[]) {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

function stableId(kind: string, scopeId: string, fixtureVersion: string) {
  return `dev_${kind}_${digest(kind, scopeId, fixtureVersion).slice(0, 32)}`;
}

export function pressFixtureIdentity(teamId: string) {
  const checksum = digest("press-content", teamId, PRESS_FIXTURE_VERSION);
  return {
    documentId: stableId("knowledge_document", teamId, PRESS_FIXTURE_VERSION),
    generationId: stableId(
      "knowledge_generation",
      teamId,
      PRESS_FIXTURE_VERSION,
    ),
    chunkId: stableId("knowledge_chunk", teamId, PRESS_FIXTURE_VERSION),
    storageKey: `dev-rag-fixtures/${teamId}/${PRESS_FIXTURE_VERSION}.txt`,
    checksum,
    contentHash: digest("press-chunk", PRESS_DEV_RAG_FIXTURE_CONTENT),
  };
}

export function resumeFixtureIdentity(userId: string) {
  return {
    brickId: stableId("experience_brick", userId, RESUME_FIXTURE_VERSION),
    factId: (fieldPath: string) =>
      stableId(
        `career_fact_${fieldPath.replaceAll(/[^a-zA-Z0-9]/g, "_")}`,
        userId,
        RESUME_FIXTURE_VERSION,
      ),
    evidenceId: (fieldPath: string) =>
      stableId(
        `career_evidence_${fieldPath.replaceAll(/[^a-zA-Z0-9]/g, "_")}`,
        userId,
        RESUME_FIXTURE_VERSION,
      ),
  };
}

function pressState(
  teamId: string,
  read: ResourceRead,
  changed?: boolean,
): DevRagFixtureState {
  return {
    domain: "PRESS",
    mounted: read.mounted,
    ...(changed === undefined ? {} : { changed }),
    fixtureVersion: PRESS_FIXTURE_VERSION,
    summary: PRESS_FIXTURE_SUMMARY,
    scope: { kind: "TEAM", id: teamId },
    resourceVersion: read.resourceVersion,
  };
}

function resumeState(
  userId: string,
  read: ResourceRead,
  changed?: boolean,
): DevRagFixtureState {
  return {
    domain: "RESUME",
    mounted: read.mounted,
    ...(changed === undefined ? {} : { changed }),
    fixtureVersion: RESUME_FIXTURE_VERSION,
    summary: RESUME_FIXTURE_SUMMARY,
    scope: { kind: "USER", id: userId },
    resourceVersion: read.resourceVersion,
  };
}

export function createDevRagFixtureService(repository: DevRagFixtureRepository) {
  return {
    async read(input: { teamId: string; userId: string }) {
      return repository.transaction(async (tx) => {
        const [press, resume] = await Promise.all([
          repository.readPress(tx, input.teamId, pressFixtureIdentity(input.teamId)),
          repository.readResume(
            tx,
            input.userId,
            resumeFixtureIdentity(input.userId),
          ),
        ]);
        return [
          pressState(input.teamId, press),
          resumeState(input.userId, resume),
        ] satisfies DevRagFixtureState[];
      });
    },

    async setPressMounted(input: {
      teamId: string;
      userId: string;
      mounted: boolean;
    }) {
      return repository.transaction(async (tx) => {
        await repository.lockPress(tx, input.teamId);
        const identity = pressFixtureIdentity(input.teamId);
        const before = await repository.readPress(tx, input.teamId, identity);
        const transition = decideDevRagFixtureTransition(
          before.mounted,
          input.mounted,
        );
        if (!transition.changed) return pressState(input.teamId, before, false);
        if (input.mounted) {
          await repository.mountPress(tx, { ...input, identity });
        } else {
          await repository.unmountPress(tx, { ...input, identity });
        }
        const resourceVersion = await repository.incrementPressVersion(
          tx,
          input.teamId,
        );
        return pressState(
          input.teamId,
          { mounted: input.mounted, resourceVersion },
          true,
        );
      });
    },

    async setResumeMounted(input: {
      teamId: string;
      userId: string;
      mounted: boolean;
    }) {
      return repository.transaction(async (tx) => {
        await repository.lockResume(tx, input.userId);
        const identity = resumeFixtureIdentity(input.userId);
        const before = await repository.readResume(tx, input.userId, identity);
        const transition = decideDevRagFixtureTransition(
          before.mounted,
          input.mounted,
        );
        if (!transition.changed) return resumeState(input.userId, before, false);
        if (input.mounted) {
          await repository.mountResume(tx, { ...input, identity });
        } else {
          await repository.unmountResume(tx, { ...input, identity });
        }
        const resourceVersion = await repository.incrementResumeVersion(
          tx,
          input.userId,
        );
        return resumeState(
          input.userId,
          { mounted: input.mounted, resourceVersion },
          true,
        );
      });
    },
  };
}

type Tx = Prisma.TransactionClient;
type Db = PrismaClient;
const asTx = (value: DevRagFixtureTransaction) => value as Tx;

const RESUME_FACTS: ReadonlyArray<{
  kind: CareerFactKind;
  fieldPath: string;
  value: string | Date;
}> = [
  {
    kind: CareerFactKind.ORGANIZATION,
    fieldPath: "organization",
    value: RESUME_EXPERIENCE.organization,
  },
  {
    kind: CareerFactKind.TITLE,
    fieldPath: "roleTitle",
    value: RESUME_EXPERIENCE.roleTitle,
  },
  {
    kind: CareerFactKind.START_DATE,
    fieldPath: "startDate",
    value: RESUME_EXPERIENCE.startDate,
  },
  {
    kind: CareerFactKind.END_DATE,
    fieldPath: "endDate",
    value: RESUME_EXPERIENCE.endDate,
  },
  {
    kind: CareerFactKind.ACTION,
    fieldPath: "actions[0]",
    value: RESUME_EXPERIENCE.actions[0],
  },
  {
    kind: CareerFactKind.OUTCOME,
    fieldPath: "outcomes[0]",
    value: RESUME_EXPERIENCE.outcomes[0],
  },
  {
    kind: CareerFactKind.METRIC,
    fieldPath: "metrics[0]",
    value: RESUME_EXPERIENCE.metrics[0],
  },
  {
    kind: CareerFactKind.TOOL,
    fieldPath: "tools[0]",
    value: RESUME_EXPERIENCE.tools[0],
  },
  {
    kind: CareerFactKind.SUMMARY,
    fieldPath: "summary",
    value: RESUME_EXPERIENCE.content,
  },
];

export function createPrismaDevRagFixtureRepository(
  client: Db = prisma,
): DevRagFixtureRepository {
  return {
    transaction: (operation) =>
      client.$transaction((tx) => operation(tx as DevRagFixtureTransaction)),

    lockPress: (tx, teamId) => lockKnowledgeTeam(asTx(tx), teamId),

    async lockResume(tx, userId) {
      await asTx(tx).$executeRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`dev-rag-resume:${userId}`}, 0)
        )
      `;
    },

    async readPress(tx, teamId, identity) {
      const [team, document] = await Promise.all([
        asTx(tx).team.findUnique({
          where: { id: teamId },
          select: { knowledgeCorpusVersion: true },
        }),
        asTx(tx).knowledgeDocument.findFirst({
          where: { id: identity.documentId, teamId },
          select: {
            deletedAt: true,
            status: true,
            activeGenerationId: true,
          },
        }),
      ]);
      if (!team) throw new Error("DEV_RAG_FIXTURE_TEAM_NOT_FOUND");
      return {
        mounted:
          document?.deletedAt === null &&
          document.status === KnowledgeDocumentStatus.READY &&
          document.activeGenerationId === identity.generationId,
        resourceVersion: team.knowledgeCorpusVersion,
      };
    },

    async readResume(tx, userId, identity) {
      const [user, brick, activeFactCount] = await Promise.all([
        asTx(tx).user.findUnique({
          where: { id: userId },
          select: { careerMemoryVersion: true },
        }),
        asTx(tx).experienceBrick.findFirst({
          where: { id: identity.brickId, userId },
          select: { memoryStatus: true },
        }),
        asTx(tx).careerFact.count({
          where: {
            id: {
              in: RESUME_FACTS.map((fact) => identity.factId(fact.fieldPath)),
            },
            userId,
            experienceId: identity.brickId,
            active: true,
            trustStatus: CareerFactTrustStatus.TRUSTED,
          },
        }),
      ]);
      if (!user) throw new Error("DEV_RAG_FIXTURE_USER_NOT_FOUND");
      return {
        mounted:
          brick?.memoryStatus === CareerExperienceStatus.CONFIRMED &&
          activeFactCount === RESUME_FACTS.length,
        resourceVersion: user.careerMemoryVersion,
      };
    },

    async mountPress(tx, { teamId, userId, identity }) {
      const db = asTx(tx);
      const now = new Date();
      await db.knowledgeDocument.upsert({
        where: { id: identity.documentId },
        create: {
          id: identity.documentId,
          teamId,
          uploadedById: userId,
          originalName: PRESS_FIXTURE_SUMMARY,
          mimeType: "text/plain",
          byteSize: Buffer.byteLength(PRESS_DEV_RAG_FIXTURE_CONTENT),
          storageKey: identity.storageKey,
          checksum: identity.checksum,
          status: KnowledgeDocumentStatus.READY,
          sourceVersion: 1,
          pageCount: 1,
          chunkCount: 1,
          parserVersion: PRESS_FIXTURE_VERSION,
          indexedAt: now,
          classificationOverride: KnowledgeChunkRole.FACT,
        },
        update: {
          deletedAt: null,
          status: KnowledgeDocumentStatus.READY,
          uploadedById: userId,
          originalName: PRESS_FIXTURE_SUMMARY,
          chunkCount: 1,
          pageCount: 1,
          indexedAt: now,
          errorCode: null,
          errorMessage: null,
        },
      });
      await db.knowledgeIndexGeneration.upsert({
        where: { id: identity.generationId },
        create: {
          id: identity.generationId,
          documentId: identity.documentId,
          generation: 1,
          fingerprint: identity.checksum,
          parserVersion: PRESS_FIXTURE_VERSION,
          chunkerVersion: PRESS_FIXTURE_VERSION,
          embeddingModel: "text-fallback",
          embeddingDimensions: 1536,
          classifierVersion: PRESS_FIXTURE_VERSION,
          indexStatus: KnowledgeGenerationStatus.READY,
          classificationStatus: KnowledgeClassificationStatus.READY,
          indexedAt: now,
          classifiedAt: now,
        },
        update: {
          indexStatus: KnowledgeGenerationStatus.READY,
          classificationStatus: KnowledgeClassificationStatus.READY,
          errorCode: null,
          errorMessage: null,
          indexedAt: now,
          classifiedAt: now,
        },
      });
      await db.knowledgeChunk.upsert({
        where: { id: identity.chunkId },
        create: {
          id: identity.chunkId,
          teamId,
          documentId: identity.documentId,
          generationId: identity.generationId,
          ordinal: 0,
          content: PRESS_DEV_RAG_FIXTURE_CONTENT,
          pageStart: 1,
          pageEnd: 1,
          sectionTitle: "QA fixture facts",
          contentHash: identity.contentHash,
          parserVersion: PRESS_FIXTURE_VERSION,
          autoRole: KnowledgeChunkRole.FACT,
          roleConfidence: 1,
          roleRationale: "Server-owned development QA fixture",
          classifierVersion: PRESS_FIXTURE_VERSION,
          classifiedAt: now,
        },
        update: {
          content: PRESS_DEV_RAG_FIXTURE_CONTENT,
          autoRole: KnowledgeChunkRole.FACT,
          roleConfidence: 1,
          classifiedAt: now,
        },
      });
      await db.knowledgeDocument.update({
        where: { id: identity.documentId },
        data: { activeGenerationId: identity.generationId },
      });
      return {};
    },

    async unmountPress(tx, { teamId, identity }) {
      const db = asTx(tx);
      await db.knowledgeDocument.updateMany({
        where: { id: identity.documentId, teamId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      const affected = await db.articleFact.findMany({
        where: {
          teamId,
          documentId: identity.documentId,
          active: true,
          article: { status: { not: "FINAL" } },
        },
        select: { id: true, articleId: true },
      });
      if (affected.length) {
        await db.articleFact.updateMany({
          where: { id: { in: affected.map((fact) => fact.id) } },
          data: { active: false },
        });
        for (const articleId of new Set(affected.map((fact) => fact.articleId))) {
          await db.articleGroundingState.upsert({
            where: { articleId },
            create: { articleId, groundingRevision: 1 },
            update: { groundingRevision: { increment: 1 } },
          });
        }
      }
      return { affectedArticles: new Set(affected.map((fact) => fact.articleId)).size };
    },

    async mountResume(tx, { userId, teamId, identity }) {
      const db = asTx(tx);
      await db.experienceBrick.upsert({
        where: { id: identity.brickId },
        create: {
          id: identity.brickId,
          userId,
          teamId,
          title: RESUME_EXPERIENCE.title,
          content: RESUME_EXPERIENCE.content,
          originalText: RESUME_EXPERIENCE.content,
          period: RESUME_EXPERIENCE.period,
          startDate: RESUME_EXPERIENCE.startDate,
          endDate: RESUME_EXPERIENCE.endDate,
          tags: [...RESUME_EXPERIENCE.tags],
          source: BrickSource.MANUAL,
          organization: RESUME_EXPERIENCE.organization,
          roleTitle: RESUME_EXPERIENCE.roleTitle,
          experienceType: CareerExperienceType.WORK,
          actions: [...RESUME_EXPERIENCE.actions],
          outcomes: [...RESUME_EXPERIENCE.outcomes],
          metrics: [...RESUME_EXPERIENCE.metrics],
          tools: [...RESUME_EXPERIENCE.tools],
          memoryStatus: CareerExperienceStatus.CONFIRMED,
          confirmedAt: new Date(),
          confirmedByUserId: userId,
        },
        update: {
          memoryStatus: CareerExperienceStatus.CONFIRMED,
          confirmedAt: new Date(),
          confirmedByUserId: userId,
        },
      });
      for (const fact of RESUME_FACTS) {
        const factId = identity.factId(fact.fieldPath);
        const displayValue =
          fact.value instanceof Date
            ? fact.value.toISOString().slice(0, 10)
            : fact.value;
        await db.careerFact.upsert({
          where: { id: factId },
          create: {
            id: factId,
            userId,
            experienceId: identity.brickId,
            kind: fact.kind,
            fieldPath: fact.fieldPath,
            value: displayValue,
            normalizedValue: normalizeCareerFactValue(displayValue),
            active: true,
            trustStatus: CareerFactTrustStatus.TRUSTED,
          },
          update: {
            active: true,
            trustStatus: CareerFactTrustStatus.TRUSTED,
            value: displayValue,
            normalizedValue: normalizeCareerFactValue(displayValue),
          },
        });
        await db.careerFactEvidence.upsert({
          where: { id: identity.evidenceId(fact.fieldPath) },
          create: {
            id: identity.evidenceId(fact.fieldPath),
            factId,
            fieldPath: fact.fieldPath,
            origin: CareerEvidenceOrigin.USER_ASSERTION,
            valueHash: fingerprintCareerValue(fact.value),
            excerpt: `QA fixture assertion: ${displayValue}`,
          },
          update: {
            factId,
            origin: CareerEvidenceOrigin.USER_ASSERTION,
            valueHash: fingerprintCareerValue(fact.value),
            excerpt: `QA fixture assertion: ${displayValue}`,
          },
        });
      }
      return {};
    },

    async unmountResume(tx, { userId, identity }) {
      const db = asTx(tx);
      await db.experienceBrick.updateMany({
        where: { id: identity.brickId, userId },
        data: { memoryStatus: CareerExperienceStatus.ARCHIVED },
      });
      await db.careerFact.updateMany({
        where: { userId, experienceId: identity.brickId, active: true },
        data: { active: false },
      });
      return {};
    },

    async incrementPressVersion(tx, teamId) {
      return (
        await asTx(tx).team.update({
          where: { id: teamId },
          data: { knowledgeCorpusVersion: { increment: 1 } },
          select: { knowledgeCorpusVersion: true },
        })
      ).knowledgeCorpusVersion;
    },

    async incrementResumeVersion(tx, userId) {
      return (
        await asTx(tx).user.update({
          where: { id: userId },
          data: { careerMemoryVersion: { increment: 1 } },
          select: { careerMemoryVersion: true },
        })
      ).careerMemoryVersion;
    },
  };
}

const defaultService = createDevRagFixtureService(
  createPrismaDevRagFixtureRepository(),
);

export const readDevRagFixtures = defaultService.read;
export const setPressDevRagFixtureMounted = defaultService.setPressMounted;
export const setResumeDevRagFixtureMounted = defaultService.setResumeMounted;
