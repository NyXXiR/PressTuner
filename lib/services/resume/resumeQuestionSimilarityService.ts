import { prisma } from "@/lib/prisma";
import { ServiceError } from "@/lib/errors";

function throwErr(code: string, status: number, message?: string): never {
  throw new ServiceError(code, status, message);
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTokens(text: string) {
  return new Set(
    normalizeText(text)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

function buildBigrams(text: string) {
  const normalized = normalizeText(text).replace(/\s+/g, "");
  const grams = new Set<string>();
  for (let index = 0; index < normalized.length - 1; index += 1) {
    grams.add(normalized.slice(index, index + 2));
  }
  return grams;
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return intersection / (left.size + right.size - intersection);
}

function scoreQuestionSimilarity(source: string, target: string) {
  const tokenScore = jaccard(buildTokens(source), buildTokens(target));
  const bigramScore = jaccard(buildBigrams(source), buildBigrams(target));
  return bigramScore * 0.7 + tokenScore * 0.3;
}

export async function findSimilarResumeQuestions(input: {
  applicationId: string;
  questionId: string;
  userId: string;
  teamId: string;
}) {
  const { applicationId, questionId, userId, teamId } = input;

  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: {
      questions: {
        where: { id: questionId },
        select: {
          id: true,
          questionText: true,
        },
      },
    },
  });

  if (!app) {
    throwErr("NOT_FOUND", 404, "Application not found");
  }
  if (app.userId !== userId) {
    throwErr("FORBIDDEN", 403, "Unauthorized");
  }
  if (app.teamId && app.teamId !== teamId) {
    throwErr("FORBIDDEN", 403, "Team access denied");
  }

  const currentQuestion = app.questions[0];
  if (!currentQuestion) {
    throwErr("NOT_FOUND", 404, "Question not found");
  }

  const candidateQuestions = await prisma.question.findMany({
    where: {
      id: { not: questionId },
      answer: { not: null },
      application: {
        userId,
        OR: [{ teamId }, { id: applicationId }],
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
    take: 80,
  });

  const items = candidateQuestions
    .map((candidate) => ({
      id: candidate.id,
      questionText: candidate.questionText,
      answer: candidate.answer ?? "",
      updatedAt: candidate.updatedAt,
      application: candidate.application,
      similarityScore: scoreQuestionSimilarity(
        currentQuestion.questionText,
        candidate.questionText,
      ),
    }))
    .filter((candidate) => candidate.similarityScore >= 0.16)
    .sort((left, right) => right.similarityScore - left.similarityScore)
    .slice(0, 5);

  return {
    currentQuestionText: currentQuestion.questionText,
    items,
  };
}
