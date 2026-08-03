import { prisma } from "@/lib/prisma";
import { cosineSimilarity, getEmbedding } from "@/lib/llm/embedding";

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lexicalScore(query: string, target: string) {
  const queryTokens = new Set(
    normalizeText(query)
      .split(" ")
      .filter((token) => token.length >= 2),
  );
  const targetTokens = new Set(
    normalizeText(target)
      .split(" ")
      .filter((token) => token.length >= 2),
  );

  if (queryTokens.size === 0 || targetTokens.size === 0) return 0;

  let matched = 0;
  for (const token of queryTokens) {
    if (targetTokens.has(token)) matched += 1;
  }

  return matched / queryTokens.size;
}

export async function searchResumeAnswers(input: {
  query: string;
  userId: string;
  teamId: string;
}) {
  const { query, userId, teamId } = input;

  const candidates = await prisma.question.findMany({
    where: {
      answer: { not: null },
      application: {
        userId,
        OR: [{ teamId }, { teamId: null }],
      },
    },
    select: {
      id: true,
      questionText: true,
      answer: true,
      updatedAt: true,
      application: {
        select: {
          id: true,
          companyName: true,
          jobTitle: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  if (candidates.length === 0) {
    return { ok: true, items: [] };
  }

  let queryEmbedding: number[] = [];
  try {
    queryEmbedding = await getEmbedding(query);
  } catch (error) {
    console.error("resume answer search embedding(query) failed", error);
  }

  const scored = await Promise.all(
    candidates.map(async (candidate) => {
      const searchableText = [
        candidate.application.companyName,
        candidate.application.jobTitle,
        candidate.questionText,
        candidate.answer ?? "",
      ].join("\n");

      let embeddingScore = 0;
      if (queryEmbedding.length > 0) {
        try {
          const answerEmbedding = await getEmbedding(searchableText.slice(0, 5000));
          if (answerEmbedding.length > 0) {
            embeddingScore = cosineSimilarity(queryEmbedding, answerEmbedding);
          }
        } catch (error) {
          console.error("resume answer search embedding(candidate) failed", error);
        }
      }

      const keywordScore = lexicalScore(query, searchableText);
      const score = queryEmbedding.length > 0
        ? embeddingScore * 0.72 + keywordScore * 0.28
        : keywordScore;

      return {
        id: candidate.id,
        questionText: candidate.questionText,
        answer: candidate.answer ?? "",
        updatedAt: candidate.updatedAt,
        application: candidate.application,
        score,
      };
    }),
  );

  return {
    ok: true,
    items: scored
      .filter((item) => item.score >= 0.18)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5),
  };
}
