import type { ArticleVerificationResult } from "@prisma/client";

import {
  PressDomainError,
  assertPressFinalizable,
  classifyPressVerification,
  requirePressTransition,
  type PressProcessState,
} from "@/domain/press/pressProcess";
import { prisma } from "@/lib/prisma";
import {
  loadPressProcessSnapshot,
  withLockedPressProcess,
} from "@/lib/services/press/adapters/pressProcessPrismaAdapter";
import { loadArticleVerificationSnapshot } from "./articleVerificationService";

export function assertFinalizableVerification(
  verification:
    | {
        result: ArticleVerificationResult;
        draftHash: string;
        groundingRevision: number;
        corpusVersion: number;
      }
    | null,
  current: {
    draftHash: string;
    groundingRevision: number;
    corpusVersion: number;
  },
) {
  const state: PressProcessState = {
    phase: "EDITING",
    approval: "NOT_REQUESTED",
    hasReview: false,
    hasPendingRewrite: false,
    verification: classifyPressVerification(
      verification
        ? {
            kind: "CURRENT",
            result: verification.result,
            fingerprint: verification,
          }
        : { kind: "MISSING" },
      current,
    ),
  };
  assertPressFinalizable(state);
}

export async function finalizeVerifiedArticle(args: {
  articleId: string;
  teamId?: string | null;
}) {
  const initialSnapshot = await loadPressProcessSnapshot(prisma, args);
  return withLockedPressProcess(args, async ({ tx, snapshot: processSnapshot }) => {
    if (processSnapshot.state.phase === "FINALIZED") {
      if (initialSnapshot.state.phase !== "FINALIZED") {
        throw new PressDomainError("PRESS_FINALIZED_IMMUTABLE");
      }

      // Repeated FINAL requests retain the legacy idempotent response contract.
      const [article, verification] = await Promise.all([
        tx.article.findFirstOrThrow({
          where: {
            id: args.articleId,
            ...(args.teamId !== undefined ? { teamId: args.teamId } : {}),
          },
          select: { id: true, title: true, status: true, updatedAt: true },
        }),
        tx.articleVerification.findFirst({
          where: { articleId: args.articleId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        }),
      ]);
      return { ok: true, article, verificationId: verification?.id ?? null };
    }

    requirePressTransition(processSnapshot.state, { type: "FINALIZE" });

    const snapshot = await loadArticleVerificationSnapshot(tx, args);
    const verification = await tx.articleVerification.findFirst({
      where: {
        articleId: args.articleId,
        ...(args.teamId ? { teamId: args.teamId } : {}),
      },
      include: { findings: true },
      orderBy: { createdAt: "desc" },
    });
    assertFinalizableVerification(verification, snapshot);

    const draftEvidence = await tx.articleDraftEvidence.findMany({
      where: { articleId: args.articleId, draftHash: snapshot.draftHash },
      select: { factId: true },
    });
    const findingFactIds =
      verification?.findings.flatMap((finding) =>
        finding.result === "BLOCK" ? [] : finding.evidenceFactIds,
      ) ?? [];
    const factIds = [
      ...new Set([
        ...draftEvidence.map(({ factId }) => factId),
        ...findingFactIds,
      ]),
    ];
    const facts = await tx.articleFact.findMany({
      where: {
        id: { in: factIds },
        articleId: args.articleId,
        active: true,
        origin: "RAG",
        documentId: { not: null },
        chunkId: { not: null },
      },
    });
    if (verification && facts.length > 0) {
      await tx.articleFinalCitation.createMany({
        data: facts.map((fact) => ({
          articleId: args.articleId,
          teamId: snapshot.article.teamId,
          verificationId: verification.id,
          factId: fact.id,
          documentId: fact.documentId!,
          chunkId: fact.chunkId!,
          pageStart: fact.pageStart!,
          pageEnd: fact.pageEnd!,
          excerpt: fact.excerpt!,
        })),
        skipDuplicates: true,
      });
    }
    const article = await tx.article.update({
      where: { id: args.articleId },
      data: { status: "FINAL" },
      select: { id: true, title: true, status: true, updatedAt: true },
    });
    return { ok: true, article, verificationId: verification!.id };
  });
}
