import type { KnowledgeChunkRole, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { lockKnowledgeTeam } from "./knowledgeTransaction";

type ClassificationTx = Pick<
  Prisma.TransactionClient,
  "knowledgeDocument" | "team" | "$executeRaw"
>;

export async function applyKnowledgeClassificationOverride(
  tx: ClassificationTx,
  args: {
    teamId: string;
    documentId: string;
    override: KnowledgeChunkRole | null;
  },
) {
  await lockKnowledgeTeam(tx as Prisma.TransactionClient, args.teamId);
  const document = await tx.knowledgeDocument.findFirst({
    where: { id: args.documentId, teamId: args.teamId, deletedAt: null },
    select: { id: true, classificationOverride: true },
  });
  if (!document) throw new Error("KNOWLEDGE_DOCUMENT_NOT_FOUND");
  if (document.classificationOverride === args.override) {
    return { changed: false, override: args.override };
  }
  await tx.knowledgeDocument.update({
    where: { id: document.id },
    data: { classificationOverride: args.override },
  });
  await tx.team.update({
    where: { id: args.teamId },
    data: { knowledgeCorpusVersion: { increment: 1 } },
  });
  return { changed: true, override: args.override };
}

export function setKnowledgeClassificationOverride(args: {
  teamId: string;
  documentId: string;
  override: KnowledgeChunkRole | null;
}) {
  return prisma.$transaction((tx) =>
    applyKnowledgeClassificationOverride(tx, args),
  );
}
