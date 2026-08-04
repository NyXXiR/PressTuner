import { createHash, randomUUID } from "node:crypto";
import { basename, relative, resolve } from "node:path";

import type { KnowledgeChunkRole } from "@prisma/client";
import type { PressKnowledgeRetrievalConfiguration } from "@/domain/knowledge/retrievalRuntime";

import type {
  AdapterTenantContext,
  ControlledLiveCorpus,
  PressAgentControlledLiveAdapter,
} from "@/domain/evaluation/controlledLiveEvaluation";

type ControlledLiveCorpusDocument = ControlledLiveCorpus["documents"][number];

type ProductOperation = {
  result: unknown;
  costMicros: number;
};

type AdapterDependencies = {
  assertCapacity(documentCount: number): Promise<unknown>;
  createTenant(executionId: string): Promise<{ teamId: string; userId: string }>;
  loadCorpusFile(path: string): Promise<Uint8Array>;
  uploadDocument(args: {
    teamId: string;
    userId: string;
    document: ControlledLiveCorpusDocument;
    bytes: Uint8Array;
    configurationId: PressKnowledgeRetrievalConfiguration["id"];
  }): Promise<{ documentId: string }>;
  indexDocuments(args: {
    teamId: string;
    documentIds: string[];
    configurationId: PressKnowledgeRetrievalConfiguration["id"];
  }): Promise<unknown>;
  waitUntilIndexed(args: {
    teamId: string;
    documentIds: string[];
  }): Promise<unknown>;
  currentConfigurationHash(): Promise<string>;
  retrieve(args: {
    teamId: string;
    prompt: string;
    configurationId: PressKnowledgeRetrievalConfiguration["id"];
  }): Promise<ProductOperation>;
  runAgent(args: {
    teamId: string;
    userId: string;
    prompt: string;
    configurationId: PressKnowledgeRetrievalConfiguration["id"];
  }): Promise<ProductOperation>;
  cleanupTenant(args: { teamId: string; userId: string }): Promise<unknown>;
  now(): number;
};

type TenantState = {
  teamId: string;
  userId: string;
  documentIdMap: Record<string, string>;
  indexingStageMetrics: unknown[];
};

function fail(code: string): never {
  throw new Error(code);
}

function stateFor(
  states: Map<string, TenantState>,
  tenant: AdapterTenantContext | Readonly<{ tenantId: string }>,
) {
  const state = states.get(tenant.tenantId);
  if (!state) fail("CONTROLLED_LIVE_UNKNOWN_TENANT");
  return state;
}

function measuredResult(args: {
  caseId: string;
  startedAt: number;
  finishedAt: number;
  operation: ProductOperation;
  documentIdMap: Record<string, string>;
  indexingStageMetrics?: readonly unknown[];
}) {
  const baseResult =
    args.operation.result && typeof args.operation.result === "object"
      ? args.operation.result
      : { value: args.operation.result };
  return {
    caseRunId: `${args.caseId}-${randomUUID()}`,
    latencyMs: Math.max(0, args.finishedAt - args.startedAt),
    costMicros: args.operation.costMicros,
    result: {
      productResult: baseResult,
      documentIdMap: { ...args.documentIdMap },
      indexingStageMetrics: [...(args.indexingStageMetrics ?? [])],
    } as Record<string, unknown>,
  };
}

export function createControlledLiveProductAdapter(args: {
  projectRoot: string;
  dependencies: AdapterDependencies;
  configurationId?: PressKnowledgeRetrievalConfiguration["id"];
}): PressAgentControlledLiveAdapter {
  const root = resolve(args.projectRoot);
  const states = new Map<string, TenantState>();

  return {
    async createIsolatedTenant({ executionId }) {
      const created = await args.dependencies.createTenant(executionId);
      states.set(created.teamId, {
        ...created,
        documentIdMap: {},
        indexingStageMetrics: [],
      });
      return { tenantId: created.teamId };
    },

    async materializeCorpusThroughProductPath(input) {
      const state = stateFor(states, input);
      const { corpus } = input;
      await args.dependencies.assertCapacity(corpus.documents.length);
      const actualDocumentIds: string[] = [];
      for (const document of corpus.documents) {
        const sourcePath = resolve(root, document.filePath);
        const pathFromRoot = relative(root, sourcePath);
        if (pathFromRoot.startsWith("..") || resolve(root, pathFromRoot) !== sourcePath) {
          fail("CONTROLLED_LIVE_CORPUS_PATH_OUTSIDE_ROOT");
        }
        const bytes = await args.dependencies.loadCorpusFile(sourcePath);
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (hash !== document.fileSha256) {
          fail(`CONTROLLED_LIVE_CORPUS_HASH_MISMATCH:${document.id}`);
        }
        const uploaded = await args.dependencies.uploadDocument({
          teamId: state.teamId,
          userId: state.userId,
          document,
          bytes,
          configurationId: args.configurationId ?? "baseline-v1",
        });
        state.documentIdMap[uploaded.documentId] = document.id;
        actualDocumentIds.push(uploaded.documentId);
      }
      await args.dependencies.indexDocuments({
        teamId: state.teamId,
        documentIds: actualDocumentIds,
        configurationId: args.configurationId ?? "baseline-v1",
      });
      const indexed = await args.dependencies.waitUntilIndexed({
        teamId: state.teamId,
        documentIds: actualDocumentIds,
      });
      if (
        indexed &&
        typeof indexed === "object" &&
        Array.isArray((indexed as { stageMetrics?: unknown }).stageMetrics)
      ) {
        state.indexingStageMetrics.push(
          ...(indexed as { stageMetrics: unknown[] }).stageMetrics,
        );
      }
    },

    async readRuntimeConfigurationHash(input) {
      stateFor(states, input);
      return args.dependencies.currentConfigurationHash();
    },

    async executeRetrievalCase(input) {
      const state = stateFor(states, input);
      const startedAt = args.dependencies.now();
      const operation = await args.dependencies.retrieve({
        teamId: state.teamId,
        prompt: input.case.prompt,
        configurationId: args.configurationId ?? "baseline-v1",
      });
      return measuredResult({
        caseId: input.case.id,
        startedAt,
        finishedAt: args.dependencies.now(),
        operation,
        documentIdMap: state.documentIdMap,
        indexingStageMetrics: state.indexingStageMetrics,
      });
    },

    async executeAgentCase(input) {
      const state = stateFor(states, input);
      const startedAt = args.dependencies.now();
      const operation = await args.dependencies.runAgent({
        teamId: state.teamId,
        userId: state.userId,
        prompt: input.case.prompt,
        configurationId: args.configurationId ?? "baseline-v1",
      });
      return measuredResult({
        caseId: input.case.id,
        startedAt,
        finishedAt: args.dependencies.now(),
        operation,
        documentIdMap: state.documentIdMap,
        indexingStageMetrics: state.indexingStageMetrics,
      });
    },

    async cleanupIsolatedTenant(input) {
      const state = stateFor(states, input);
      await args.dependencies.cleanupTenant(state);
      states.delete(input.tenantId);
    },
  };
}

async function sleep(milliseconds: number) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function defaultDependencies(
  configurationId: PressKnowledgeRetrievalConfiguration["id"] = "baseline-v1",
): AdapterDependencies {
  return {
    async assertCapacity(documentCount) {
      const { knowledgeLimits } = await import("@/config/knowledge/limits");
      if (
        knowledgeLimits.maxDocumentsPerTeam < documentCount ||
        knowledgeLimits.uploadRateLimit < documentCount
      ) {
        fail(
          `CONTROLLED_LIVE_CORPUS_CAPACITY_TOO_LOW:documents=${documentCount};maxDocuments=${knowledgeLimits.maxDocumentsPerTeam};uploadRate=${knowledgeLimits.uploadRateLimit}`,
        );
      }
    },

    async createTenant(executionId) {
      const { prisma } = await import("@/lib/prisma");
      const suffix = `${executionId}-${randomUUID()}`.toLowerCase();
      const user = await prisma.user.create({
        data: {
          loginId: `controlled-live-${suffix}`,
          label: "Controlled Live Evaluator",
          email: `controlled-live-${suffix}@example.invalid`,
        },
      });
      const team = await prisma.team.create({
        data: {
          slug: `controlled-live-${suffix}`,
          name: "Controlled Live Evaluation",
          planId: "free_v1",
          plan: "FREE",
          planCategory: "STANDARD",
          nextPaymentAmount: 0,
        },
      });
      return { teamId: team.id, userId: user.id };
    },

    async loadCorpusFile(path) {
      const { readFile } = await import("node:fs/promises");
      return readFile(path);
    },

    async uploadDocument({ teamId, userId, document, bytes, configurationId }) {
      const { createKnowledgeDocument } = await import(
        "@/lib/services/knowledge/knowledgeDocumentService"
      );
      const file = new File([Buffer.from(bytes)], basename(document.filePath), {
        type: "application/pdf",
      });
      const created = await createKnowledgeDocument({
        teamId,
        userId,
        file,
        sourceRole: document.role as KnowledgeChunkRole,
        chunkProfileMode:
          configurationId === "candidate-v1"
            ? "ROLE_AWARE_CANDIDATE"
            : "PAGE_CHAR_BASELINE",
        indexingDispatch: "CONTROLLED_DEFERRED",
      });
      return { documentId: created.document.id };
    },

    async indexDocuments({ documentIds, configurationId }) {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const schedulerRoot = resolve(
        process.env.PT_CONTROLLED_LIVE_SCHEDULER_ROOT ??
          resolve(process.cwd(), "../PressTuner-scheduler"),
      );
      const chunkProfile =
        configurationId === "candidate-v1"
          ? "ROLE_AWARE_CANDIDATE"
          : "PAGE_CHAR_BASELINE";
      const execute = promisify(execFile);
      await execute(
        process.platform === "win32" ? "npm.cmd" : "npm",
        [
          "run",
          "controlled:index:knowledge",
          "--",
          "--document-ids",
          documentIds.join(","),
          "--chunk-profile",
          chunkProfile,
        ],
        {
          cwd: schedulerRoot,
          env: {
            ...process.env,
            PT_KNOWLEDGE_CHUNK_PROFILE: chunkProfile,
          },
          maxBuffer: 10 * 1024 * 1024,
        },
      );
    },

    async waitUntilIndexed({ teamId, documentIds }) {
      const { prisma } = await import("@/lib/prisma");
      const timeoutMs = Number(process.env.PT_CONTROLLED_LIVE_INDEX_TIMEOUT_MS ?? 600_000);
      const deadline = Date.now() + timeoutMs;
      while (Date.now() <= deadline) {
        const documents = await prisma.knowledgeDocument.findMany({
          where: { teamId, id: { in: documentIds } },
          select: { id: true, status: true, errorCode: true, errorMessage: true },
        });
        const failed = documents.find(({ status }) => status === "FAILED");
        if (failed) {
          fail(
            `CONTROLLED_LIVE_INDEX_FAILED:${failed.id}:${failed.errorCode ?? "UNKNOWN"}:${failed.errorMessage ?? ""}`,
          );
        }
        if (
          documents.length === documentIds.length &&
          documents.every(({ status }) => status === "READY")
        ) {
          const generations = await prisma.knowledgeIndexGeneration.findMany({
            where: { documentId: { in: documentIds }, indexStatus: "READY" },
            select: { documentId: true, stageMetrics: true },
            orderBy: { createdAt: "desc" },
          });
          return { stageMetrics: generations.map((generation) => ({
            documentId: generation.documentId,
            ...(generation.stageMetrics && typeof generation.stageMetrics === "object"
              ? (generation.stageMetrics as Record<string, unknown>)
              : {}),
          })) };
        }
        await sleep(1_000);
      }
      fail("CONTROLLED_LIVE_INDEX_TIMEOUT");
    },

    async currentConfigurationHash() {
      const { resolvePressRagControlledLiveConfigurationIdentity } = await import(
        "@/domain/evaluation/pressRagRuntimeIdentity"
      );
      return resolvePressRagControlledLiveConfigurationIdentity(
        configurationId,
      ).contentHash;
    },

    async retrieve({ teamId, prompt, configurationId }) {
      const { KnowledgeChunkRole } = await import("@prisma/client");
      const { searchKnowledge } = await import(
        "@/lib/services/knowledge/knowledgeRetrievalService"
      );
      const result = await searchKnowledge({
        teamId,
        query: prompt,
        roles: [KnowledgeChunkRole.FACT, KnowledgeChunkRole.CAREER],
        topK: 8,
        configurationId,
      });
      const measuredComponentCosts = Object.values(result.componentCostMicros).filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value),
      );
      return {
        result: {
          ...result,
          costAccounting: {
            kind: "ESTIMATED_QUERY_EMBEDDING",
            estimatedInputTokens: Math.ceil(prompt.length / 4),
          },
        },
        costMicros: measuredComponentCosts.reduce((sum, value) => sum + value, 0),
      };
    },

    async runAgent({ teamId, userId, prompt, configurationId }) {
      const { startPressAgentRun } = await import(
        "@/lib/services/press-agent/pressAgentRuntime"
      );
      const run = await startPressAgentRun({
        teamId,
        userId,
        prompt,
        retrievalConfigurationId: configurationId,
      });
      return {
        result: {
          ...run,
          componentCostMicros: { agent: run.estimatedCostMicros },
        },
        costMicros: run.estimatedCostMicros,
      };
    },

    async cleanupTenant({ teamId, userId }) {
      const { prisma } = await import("@/lib/prisma");
      await prisma.$transaction(async (tx) => {
        // Retrieved sources intentionally restrict direct document deletion so
        // evidence cannot disappear in product flows. The isolated evaluator
        // owns the whole tenant, therefore remove its runs (and cascading
        // evidence rows) before deleting the tenant corpus.
        await tx.agentRun.deleteMany({ where: { teamId } });
        await tx.team.deleteMany({ where: { id: teamId } });
        await tx.user.deleteMany({ where: { id: userId } });
      });
    },

    now: () => Date.now(),
  };
}

export function createPressRagControlledLiveAdapter(args?: {
  projectRoot?: string;
  configurationId?: PressKnowledgeRetrievalConfiguration["id"];
}) {
  return createControlledLiveProductAdapter({
    projectRoot: args?.projectRoot ?? process.cwd(),
    dependencies: defaultDependencies(args?.configurationId),
    configurationId: args?.configurationId,
  });
}
