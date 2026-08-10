import type { Prisma } from "@prisma/client";

import { hashArticleContent } from "@/domain/article/articleContentHash";
import {
  classifyPressVerification,
  derivePressPhase,
  type PressApprovalState,
  type PressArticleStatus,
  type PressProcessState,
  type PressVerificationState,
} from "@/domain/press/pressProcess";
import { prisma } from "@/lib/prisma";
import { readPressEditHarness } from "@/lib/services/press/pressEditHarness";

export const PRESS_PROCESS_LOCK_PREFIX = "press-process";

type AssignmentStatus =
  | "PENDING"
  | "APPROVED"
  | "CHANGES_REQUESTED"
  | "DISMISSED";

export type PressProcessPersistenceRecord = {
  status: PressArticleStatus;
  title: string;
  bodyJson: unknown;
  rawInput: string | null;
  refinementQna: unknown;
  updatedAt: Date;
  pressExtra: { lead: string | null; fact: string | null } | null;
  groundingRevision: number;
  corpusVersion: number;
  assignments: readonly AssignmentStatus[];
  verification: {
    result: "PASS" | "WARN" | "BLOCK";
    draftHash: string;
    groundingRevision: number;
    corpusVersion: number;
  } | null;
};

export type PressProcessSnapshot = { state: PressProcessState };

function deriveApproval(
  status: PressArticleStatus,
  assignments: readonly AssignmentStatus[],
): PressApprovalState {
  if (assignments.includes("PENDING")) return "PENDING";
  if (assignments.includes("DISMISSED") || status === "DECLINED") return "DISMISSED";
  if (assignments.includes("CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  if (assignments.includes("APPROVED")) return "APPROVED";
  return "NOT_REQUESTED";
}

function hasGeneratedBody(bodyJson: unknown) {
  if (!bodyJson || typeof bodyJson !== "object") return false;
  const body = bodyJson as Record<string, unknown>;
  return (
    (Array.isArray(body.paragraphs) && body.paragraphs.length > 0) ||
    (typeof body.closing === "string" && body.closing.trim().length > 0)
  );
}

export function rehydratePressProcessState(
  record: PressProcessPersistenceRecord,
): PressProcessState {
  const harness = readPressEditHarness(record.refinementQna);
  const approval = deriveApproval(record.status, record.assignments);
  const body = record.bodyJson && typeof record.bodyJson === "object"
    ? record.bodyJson as Record<string, unknown>
    : {};
  const currentFingerprint = {
    draftHash: hashArticleContent({
      title: record.title,
      bodyJson: {
        lead: record.pressExtra?.lead ?? "",
        fact: record.pressExtra?.fact ?? "",
        paragraphs: Array.isArray(body.paragraphs) ? body.paragraphs : [],
        closing: typeof body.closing === "string" ? body.closing : "",
      },
    }),
    groundingRevision: record.groundingRevision,
    corpusVersion: record.corpusVersion,
  };
  const verification: PressVerificationState = record.verification
    ? {
        kind: "CURRENT",
        result: record.verification.result,
        fingerprint: {
          draftHash: record.verification.draftHash,
          groundingRevision: record.verification.groundingRevision,
          corpusVersion: record.verification.corpusVersion,
        },
      }
    : { kind: "MISSING" };

  return {
    phase: derivePressPhase({
      status: record.status,
      hasRawInput: Boolean(record.rawInput?.trim()),
      hasGeneratedContent:
        (record.title.trim().length > 0 && record.title.trim() !== "제목 미정") ||
        hasGeneratedBody(record.bodyJson) ||
        Boolean(record.pressExtra?.lead?.trim() || record.pressExtra?.fact?.trim()),
      hasHarness: Boolean(harness),
      approval,
    }),
    verification: classifyPressVerification(verification, currentFingerprint),
    approval,
    hasReview: Boolean(harness?.review),
    hasPendingRewrite: Boolean(harness?.pendingRewrite),
  };
}

type SnapshotClient = Pick<Prisma.TransactionClient, "article">;

export async function loadPressProcessSnapshot(
  client: SnapshotClient,
  input: { articleId: string; teamId?: string | null },
): Promise<PressProcessSnapshot> {
  const article = await client.article.findFirst({
    where: {
      id: input.articleId,
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
    },
    select: {
      status: true,
      title: true,
      bodyJson: true,
      rawInput: true,
      refinementQna: true,
      updatedAt: true,
      pressExtra: { select: { lead: true, fact: true } },
      groundingState: { select: { groundingRevision: true } },
      team: { select: { knowledgeCorpusVersion: true } },
      reviewAssignments: { select: { status: true } },
      verifications: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          result: true,
          draftHash: true,
          groundingRevision: true,
          corpusVersion: true,
        },
      },
    },
  });
  if (!article) throw new Error("ARTICLE_NOT_FOUND");
  return {
    state: rehydratePressProcessState({
      status: article.status,
      title: article.title,
      bodyJson: article.bodyJson,
      rawInput: article.rawInput,
      refinementQna: article.refinementQna,
      updatedAt: article.updatedAt,
      pressExtra: article.pressExtra,
      groundingRevision: article.groundingState?.groundingRevision ?? 0,
      corpusVersion: article.team?.knowledgeCorpusVersion ?? 0,
      assignments: article.reviewAssignments.map(({ status }) => status),
      verification: article.verifications[0] ?? null,
    }),
  };
}

type BoundaryDatabase = Pick<typeof prisma, "$transaction">;

export async function withLockedPressProcess<T>(
  input: { articleId: string; teamId?: string | null },
  callback: (context: {
    tx: Prisma.TransactionClient;
    snapshot: PressProcessSnapshot;
  }) => Promise<T>,
  database: BoundaryDatabase = prisma,
): Promise<T> {
  return database.$transaction(async (tx) => {
    const key = `${PRESS_PROCESS_LOCK_PREFIX}:${input.articleId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const snapshot = await loadPressProcessSnapshot(tx, input);
    return callback({ tx, snapshot });
  });
}
