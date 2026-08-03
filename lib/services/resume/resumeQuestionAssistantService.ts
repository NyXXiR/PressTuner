import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { prisma } from "@/lib/prisma";
import { cosineSimilarity, getEmbedding } from "@/lib/llm/embedding";
import { AI_MODELS } from "@/lib/constants/ai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const AssistantReplySchema = z.object({
  assistantMessage: z.string().min(1),
  suggestedQuery: z.string().min(1),
});

type AssistantReply = z.infer<typeof AssistantReplySchema>;

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

function buildSearchDocument(candidate: {
  questionText: string;
  answer: string | null;
  application: {
    companyName: string;
    jobTitle: string;
  };
}) {
  return [
    candidate.application.companyName,
    candidate.application.jobTitle,
    candidate.questionText,
    candidate.answer ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function rewriteQuestionSearchQuery(input: {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  hints: Array<{
    companyName: string;
    jobTitle: string;
    questionText: string;
  }>;
}): Promise<AssistantReply> {
  const completion = await openai.chat.completions.parse({
    model: AI_MODELS.SMART_MINI,
    messages: [
      {
        role: "system",
        content: `
You help users search Korean resume questions.

Your job:
1. Infer the search intent from the conversation.
2. Convert vague descriptions into a short Korean search query for the existing question list.
3. Answer in Korean.

Rules:
- suggestedQuery must be a short search phrase the existing search box can use immediately.
- Prefer concrete nouns or noun phrases, not full sentences.
- Include company/job words only when they clearly help narrow the search.
- If the user is vague, make the best useful guess instead of asking a follow-up.
- assistantMessage should briefly explain what you searched for and what kind of questions are likely to appear.
        `.trim(),
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            conversation: input.messages,
            hintCandidates: input.hints,
          },
          null,
          2,
        ),
      },
    ],
    response_format: zodResponseFormat(
      AssistantReplySchema,
      "resume_question_assistant_reply",
    ),
    temperature: 0.2,
  });

  return (
    completion.choices[0].message.parsed ?? {
      assistantMessage:
        "대화를 기준으로 가장 가능성이 높은 키워드로 문항을 찾아보겠습니다.",
      suggestedQuery:
        input.messages
          .filter((message) => message.role === "user")
          .at(-1)
          ?.content.trim()
          .slice(0, 30) || "문항 검색",
    }
  );
}

export async function assistResumeQuestionSearch(input: {
  userId: string;
  teamId: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  filter?: "ALL" | "COMPLETED" | "PENDING";
}) {
  const latestUserMessage =
    [...input.messages].reverse().find((message) => message.role === "user")
      ?.content ?? "";

  const candidates = await prisma.question.findMany({
    where: {
      application: {
        userId: input.userId,
        status: { not: "ARCHIVED" },
        OR: [{ teamId: input.teamId }, { teamId: null }],
      },
      ...(input.filter === "COMPLETED"
        ? { isCompleted: true }
        : input.filter === "PENDING"
          ? { isCompleted: false }
          : {}),
    },
    select: {
      id: true,
      questionText: true,
      answer: true,
      isCompleted: true,
      charLimit: true,
      updatedAt: true,
      application: {
        select: {
          id: true,
          companyName: true,
          jobTitle: true,
          status: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 80,
  });

  const hintCandidates = candidates
    .map((candidate) => ({
      companyName: candidate.application.companyName,
      jobTitle: candidate.application.jobTitle,
      questionText: candidate.questionText,
      lexicalScore: lexicalScore(
        latestUserMessage,
        buildSearchDocument(candidate),
      ),
    }))
    .sort((left, right) => right.lexicalScore - left.lexicalScore)
    .slice(0, 8)
    .map(({ companyName, jobTitle, questionText }) => ({
      companyName,
      jobTitle,
      questionText,
    }));

  const rewritten = await rewriteQuestionSearchQuery({
    messages: input.messages,
    hints: hintCandidates,
  });

  const searchQuery = rewritten.suggestedQuery.trim() || latestUserMessage.trim();

  let queryEmbedding: number[] = [];
  try {
    queryEmbedding = await getEmbedding(searchQuery);
  } catch (error) {
    console.error("question assistant embedding(query) failed", error);
  }

  const scored = await Promise.all(
    candidates.map(async (candidate) => {
      const searchableText = buildSearchDocument(candidate);
      const keywordScore = lexicalScore(searchQuery, searchableText);

      let embeddingScore = 0;
      if (queryEmbedding.length > 0) {
        try {
          const candidateEmbedding = await getEmbedding(searchableText.slice(0, 3000));
          if (candidateEmbedding.length > 0) {
            embeddingScore = cosineSimilarity(queryEmbedding, candidateEmbedding);
          }
        } catch (error) {
          console.error("question assistant embedding(candidate) failed", error);
        }
      }

      const score =
        queryEmbedding.length > 0
          ? embeddingScore * 0.72 + keywordScore * 0.28
          : keywordScore;

      return {
        ...candidate,
        score,
      };
    }),
  );

  const items = scored
    .filter((candidate) => candidate.score >= 0.12)
    .sort((left, right) => right.score - left.score)
    .slice(0, 6);

  return {
    ok: true,
    assistantMessage: rewritten.assistantMessage,
    suggestedQuery: searchQuery,
    items,
  };
}
