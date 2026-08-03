import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";
import { loadKnowledgeContexts } from "@/lib/services/knowledge/knowledgeContextService";

export async function getPressReviewRules(input: {
  articleId: string;
  userId: string;
}) {
  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: { id: true, teamId: true, userId: true },
  });
  if (!article) {
    throw serviceError(404, "NOT_FOUND", "문서를 찾을 수 없습니다.");
  }

  let allowed = false;
  if (article.teamId) {
    const membership = await prisma.teamMember.findFirst({
      where: { teamId: article.teamId, userId: input.userId },
      select: { teamId: true },
    });
    allowed = !!membership;
  } else {
    allowed = article.userId === input.userId;
  }
  if (!allowed) {
    throw serviceError(403, "FORBIDDEN", "권한이 없습니다.");
  }

  if (!article.teamId) {
    return { article, rules: null as any };
  }

  const [contexts, acceptedFacts] = await Promise.all([
    loadKnowledgeContexts({
      teamId: article.teamId,
      query: input.articleId,
      topK: 8,
    }),
    prisma.articleFact.findMany({
      where: { articleId: input.articleId, teamId: article.teamId, active: true },
      select: { id: true, content: true, excerpt: true },
    }),
  ]);
  if (!contexts.stylePolicy && !contexts.styleExamples && !acceptedFacts.length) {
    return { article, rules: null as any };
  }

  return {
    article,
    rules: {
      stylePolicy: contexts.stylePolicy,
      styleExamples: contexts.styleExamples,
      acceptedFacts,
    },
  };
}
