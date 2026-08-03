import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

import { detachRagFactForUserEdit } from "@/domain/article/groundingPolicy";
import {
  buildBriefUserFactSpecs,
  planBriefUserFactSync,
  type BriefUserFactInput,
} from "@/domain/article/briefUserFacts";
import { prisma } from "@/lib/prisma";

type FactHit = {
  chunkId: string;
  documentId: string;
  pageStart: number;
  pageEnd: number;
  content: string;
  score: number;
};

async function lockArticleGrounding(
  tx: Prisma.TransactionClient,
  articleId: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`article-grounding:${articleId}`}, 0))`;
}

export function groundingDiscoveryHash(rawText: string) {
  return createHash("sha256").update(rawText.trim()).digest("hex");
}

const MAX_EVIDENCE_EXCERPT_LENGTH = 700;

function queryTerms(query: string) {
  return [
    ...new Set(
      query
        .normalize("NFKC")
        .toLocaleLowerCase("ko-KR")
        .match(/[가-힣a-z0-9][가-힣a-z0-9.+%-]*/g)
        ?.filter((term) => term.length >= 2) ?? [],
    ),
  ];
}

export function selectRelevantEvidenceExcerpt(args: {
  query: string;
  content: string;
}) {
  const content = args.content.trim();
  if (content.length <= MAX_EVIDENCE_EXCERPT_LENGTH) return content;

  const terms = queryTerms(args.query);
  const sentencePattern = /[^.!?。！？]+(?:[.!?。！？]+|$)/g;
  const sentences = [...content.matchAll(sentencePattern)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    text: match[0],
  }));

  if (sentences.length > 1 && terms.length > 0) {
    let bestIndex = 0;
    let bestScore = -1;
    sentences.forEach((sentence, index) => {
      const normalized = sentence.text.normalize("NFKC").toLocaleLowerCase("ko-KR");
      const score = terms.reduce(
        (sum, term) => sum + (normalized.includes(term) ? 1 : 0),
        0,
      );
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });

    const start = sentences[bestIndex].start;
    let end = sentences[bestIndex].end;
    for (let index = bestIndex + 1; index < sentences.length; index += 1) {
      if (sentences[index].end - start > MAX_EVIDENCE_EXCERPT_LENGTH) break;
      end = sentences[index].end;
      if (index >= bestIndex + 2) break;
    }
    const focused = content.slice(start, end).trim();
    if (focused) return focused;
  }

  const normalizedContent = content.normalize("NFKC").toLocaleLowerCase("ko-KR");
  const firstMatch = terms
    .map((term) => normalizedContent.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstMatch - 180);
  return content
    .slice(start, start + MAX_EVIDENCE_EXCERPT_LENGTH)
    .trim();
}

export async function discoverArticleEvidenceCandidates(args: {
  teamId: string;
  articleId: string;
  query: string;
  contentHash: string;
  corpusVersion: number;
  hits: readonly FactHit[];
}) {
  return prisma.$transaction(async (tx) => {
    await lockArticleGrounding(tx, args.articleId);
    const article = await tx.article.findFirst({
      where: { id: args.articleId, teamId: args.teamId },
      select: { id: true },
    });
    if (!article) throw new Error("ARTICLE_NOT_FOUND");
    await tx.articleGroundingState.upsert({
      where: { articleId: article.id },
      create: {
        articleId: article.id,
        latestDiscoveryContentHash: args.contentHash,
        latestDiscoveryCorpusVersion: args.corpusVersion,
      },
      update: {
        latestDiscoveryContentHash: args.contentHash,
        latestDiscoveryCorpusVersion: args.corpusVersion,
      },
    });
    for (const hit of args.hits) {
      const content = selectRelevantEvidenceExcerpt({
        query: args.query,
        content: hit.content,
      });
      await tx.articleEvidenceCandidate.upsert({
        where: {
          articleId_chunkId: {
            articleId: article.id,
            chunkId: hit.chunkId,
          },
        },
        create: {
          articleId: article.id,
          teamId: args.teamId,
          documentId: hit.documentId,
          chunkId: hit.chunkId,
          content,
          pageStart: hit.pageStart,
          pageEnd: hit.pageEnd,
          excerpt: content,
          score: hit.score,
          discoveredCorpusVersion: args.corpusVersion,
        },
        update: {
          content,
          pageStart: hit.pageStart,
          pageEnd: hit.pageEnd,
          excerpt: content,
          score: hit.score,
          discoveredCorpusVersion: args.corpusVersion,
        },
      });
    }
    return tx.articleEvidenceCandidate.findMany({
      where: { articleId: article.id, teamId: args.teamId },
      include: { document: { select: { originalName: true } } },
      orderBy: [{ decision: "asc" }, { score: "desc" }],
    });
  });
}

export async function listArticleGrounding(args: {
  teamId: string;
  articleId: string;
}) {
  const article = await prisma.article.findFirst({
    where: { id: args.articleId, teamId: args.teamId },
    select: {
      groundingState: true,
      evidenceCandidates: {
        where: { teamId: args.teamId },
        include: { document: { select: { originalName: true } } },
        orderBy: [{ decision: "asc" }, { score: "desc" }],
      },
      facts: {
        where: { teamId: args.teamId },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!article) throw new Error("ARTICLE_NOT_FOUND");
  return article;
}

export async function decideArticleEvidenceCandidate(args: {
  teamId: string;
  articleId: string;
  candidateId: string;
  decision: "ACCEPTED" | "REJECTED";
}) {
  return prisma.$transaction(async (tx) => {
    await lockArticleGrounding(tx, args.articleId);
    const candidate = await tx.articleEvidenceCandidate.findFirst({
      where: {
        id: args.candidateId,
        articleId: args.articleId,
        teamId: args.teamId,
      },
      include: { fact: true },
    });
    if (!candidate) throw new Error("ARTICLE_EVIDENCE_CANDIDATE_NOT_FOUND");
    const factWasActive = candidate.fact?.active ?? false;
    const changed =
      candidate.decision !== args.decision ||
      (args.decision === "ACCEPTED" && !factWasActive) ||
      (args.decision === "REJECTED" && factWasActive);
    await tx.articleEvidenceCandidate.update({
      where: { id: candidate.id },
      data: { decision: args.decision, decidedAt: new Date() },
    });
    if (args.decision === "ACCEPTED") {
      await tx.articleFact.upsert({
        where: { candidateId: candidate.id },
        create: {
          articleId: args.articleId,
          teamId: args.teamId,
          candidateId: candidate.id,
          origin: "RAG",
          content: candidate.content,
          active: true,
          documentId: candidate.documentId,
          chunkId: candidate.chunkId,
          pageStart: candidate.pageStart,
          pageEnd: candidate.pageEnd,
          excerpt: candidate.excerpt,
        },
        update: { active: true },
      });
    } else if (candidate.fact) {
      await tx.articleFact.update({
        where: { id: candidate.fact.id },
        data: { active: false },
      });
    }
    if (changed) {
      await tx.articleGroundingState.upsert({
        where: { articleId: args.articleId },
        create: { articleId: args.articleId, groundingRevision: 1 },
        update: { groundingRevision: { increment: 1 } },
      });
    }
    return { changed, decision: args.decision };
  });
}

export async function createUserArticleFact(args: {
  teamId: string;
  articleId: string;
  content: string;
}) {
  return prisma.$transaction(async (tx) => {
    await lockArticleGrounding(tx, args.articleId);
    const article = await tx.article.findFirst({
      where: { id: args.articleId, teamId: args.teamId },
      select: { id: true },
    });
    if (!article) throw new Error("ARTICLE_NOT_FOUND");
    const fact = await tx.articleFact.create({
      data: {
        articleId: article.id,
        teamId: args.teamId,
        origin: "USER",
        content: args.content.trim(),
      },
    });
    await tx.articleGroundingState.upsert({
      where: { articleId: article.id },
      create: { articleId: article.id, groundingRevision: 1 },
      update: { groundingRevision: { increment: 1 } },
    });
    return fact;
  });
}

export async function syncBriefUserFacts(args: {
  teamId: string;
  articleId: string;
  brief: BriefUserFactInput;
}) {
  const desired = buildBriefUserFactSpecs(args.brief);
  return prisma.$transaction(async (tx) => {
    await lockArticleGrounding(tx, args.articleId);
    const article = await tx.article.findFirst({
      where: { id: args.articleId, teamId: args.teamId },
      select: { id: true },
    });
    if (!article) throw new Error("ARTICLE_NOT_FOUND");
    const current = await tx.articleFact.findMany({
      where: {
        articleId: article.id,
        teamId: args.teamId,
        origin: "USER",
      },
      select: {
        id: true,
        sourceKey: true,
        content: true,
        active: true,
      },
    });
    const plan = planBriefUserFactSync(current, desired);
    for (const fact of plan.upserts) {
      await tx.articleFact.upsert({
        where: {
          articleId_sourceKey: {
            articleId: article.id,
            sourceKey: fact.sourceKey,
          },
        },
        create: {
          articleId: article.id,
          teamId: args.teamId,
          origin: "USER",
          sourceKey: fact.sourceKey,
          content: fact.content,
          active: true,
        },
        update: {
          content: fact.content,
          active: true,
        },
      });
    }
    if (plan.deactivateIds.length > 0) {
      await tx.articleFact.updateMany({
        where: { id: { in: plan.deactivateIds } },
        data: { active: false },
      });
    }
    if (plan.changed) {
      await tx.articleGroundingState.upsert({
        where: { articleId: article.id },
        create: { articleId: article.id, groundingRevision: 1 },
        update: { groundingRevision: { increment: 1 } },
      });
    }
    return {
      ...plan,
      facts: await tx.articleFact.findMany({
        where: {
          articleId: article.id,
          teamId: args.teamId,
          sourceKey: { startsWith: "brief:" },
          active: true,
        },
        orderBy: { sourceKey: "asc" },
      }),
    };
  });
}

export async function updateArticleFact(args: {
  teamId: string;
  articleId: string;
  factId: string;
  content?: string;
  active?: boolean;
}) {
  return prisma.$transaction(async (tx) => {
    await lockArticleGrounding(tx, args.articleId);
    const fact = await tx.articleFact.findFirst({
      where: { id: args.factId, articleId: args.articleId, teamId: args.teamId },
    });
    if (!fact) throw new Error("ARTICLE_FACT_NOT_FOUND");
    const nextContent = args.content?.trim() ?? fact.content;
    const edited = args.content !== undefined && nextContent !== fact.content;
    const active = args.active ?? fact.active;
    if (!edited && active === fact.active) return { fact, changed: false };
    const detached = edited
      ? detachRagFactForUserEdit({
          text: fact.content,
          origin: fact.origin,
          candidateId: fact.candidateId,
          documentId: fact.documentId,
          chunkId: fact.chunkId,
          pageStart: fact.pageStart,
          pageEnd: fact.pageEnd,
          excerpt: fact.excerpt,
        }, nextContent)
      : null;
    const updated = await tx.articleFact.update({
      where: { id: fact.id },
      data: detached
        ? {
            content: detached.text,
            origin: detached.origin,
            candidateId: null,
            documentId: null,
            chunkId: null,
            pageStart: null,
            pageEnd: null,
            excerpt: null,
            active,
          }
        : { active },
    });
    await tx.articleGroundingState.upsert({
      where: { articleId: args.articleId },
      create: { articleId: args.articleId, groundingRevision: 1 },
      update: { groundingRevision: { increment: 1 } },
    });
    return { fact: updated, changed: true };
  });
}
