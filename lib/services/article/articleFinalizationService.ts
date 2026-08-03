import type { ArticleVerificationResult } from "@prisma/client";

import { isVerificationCurrent } from "@/domain/article/verificationPolicy";
import { prisma } from "@/lib/prisma";
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
  if (!verification) throw new Error("ARTICLE_VERIFICATION_REQUIRED");
  if (!isVerificationCurrent(verification, current)) {
    throw new Error("ARTICLE_VERIFICATION_STALE");
  }
  if (verification.result === "BLOCK") {
    throw new Error("ARTICLE_VERIFICATION_BLOCKED");
  }
}

export async function finalizeVerifiedArticle(args: {
  articleId: string;
  teamId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`article-finalize:${args.articleId}`}, 0))`;
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
