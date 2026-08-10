import { prisma } from "@/lib/prisma";
import { serviceError } from "@/lib/services/serviceError";
import { loadKnowledgeContexts } from "@/lib/services/knowledge/knowledgeContextService";
import OpenAI from "openai";
import { consumeAiQuota } from "@/domain/quota/aiQuota";
import {
  projectArticleStatus,
} from "@/domain/press/pressProcess";
import { loadPressProcessSnapshot, withLockedPressProcess } from "@/lib/services/press/adapters/pressProcessPrismaAdapter";
import { requirePressTransition } from "@/domain/press/pressProcess";

type Sentence = { index: number; text: string; start: number; end: number };
type LlmSpan = {
  sentIndex: number;
  note: string;
  severity?: "info" | "warn";
};

function normalize(value: string) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function splitSentences(plain: string): Sentence[] {
  const sentences: Sentence[] = [];
  let start = 0;
  const expression = /([.!?]|다\.)\s+|\n+/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(plain)) !== null) {
    const end = match.index + match[0].length;
    const text = plain.slice(start, end);
    if (normalize(text)) {
      sentences.push({ index: sentences.length, text, start, end });
    }
    start = end;
  }
  if (start < plain.length) {
    const text = plain.slice(start);
    if (normalize(text)) {
      sentences.push({
        index: sentences.length,
        text,
        start,
        end: plain.length,
      });
    }
  }
  return sentences;
}

async function completeLegacyReview(input: {
  title: string;
  sentences: Array<{ index: number; text: string }>;
  rules: unknown;
}): Promise<LlmSpan[]> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `
너는 한국어 보도자료를 검토하는 편집 리뷰어다.
팀의 지식 기반 스타일 정책, 비사실 예시, 승인된 사실과 기사 초안을 보고,
어디를 어떻게 고치면 좋을지 "문장 단위"로 하이라이트 후보를 제안한다.

주의사항:
- rules.stylePolicy은 규범적 스타일 정책이다.
- rules.styleExamples는 표현 참고 전용이며 이름, 직함, 날짜, 인용, 수치를 사실 근거로 사용하면 안 된다.
- 사실 수정은 rules.acceptedFacts의 사실만 근거로 삼아라.
- 규칙을 그대로 복창하지 말고, 실제 문장에 어떻게 적용될지에 집중해라.
- 너무 사소한 것까지 전부 지적하지 말고, 중요한 포인트 위주로 5~15개 정도만 골라라.
- 결과는 반드시 JSON 형식으로만, 아래 포맷을 지켜서 응답해야 한다.
        `.trim(),
      },
      {
        role: "user",
        content: `
입력(JSON):
${JSON.stringify(
  { title: input.title, rules: input.rules, sentences: input.sentences },
  null,
  2,
)}

응답 형식(JSON):
{
  "spans": [
    {
      "sentIndex": number,
      "note": string,
      "severity": "info" | "warn"
    }
  ]
}
        `.trim(),
      },
    ],
  });
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("LLM 응답이 비어 있습니다.");
  const parsed = JSON.parse(content) as { spans?: unknown[] };
  return (Array.isArray(parsed.spans) ? parsed.spans : [])
    .map((value) => {
      const span = value as Record<string, unknown>;
      return {
        sentIndex: Number(span.sentIndex),
        note: typeof span.note === "string" ? span.note : "",
        severity:
          span.severity === "warn" || span.severity === "info"
            ? (span.severity as "warn" | "info")
            : undefined,
      };
    })
    .filter((span) => span.note && !Number.isNaN(span.sentIndex));
}

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

export async function reviewLegacyPressArticle(input: {
  articleId: string;
  userId: string;
  title: string;
  plain: string;
}) {
  const { article, rules } = await getPressReviewRules({
    articleId: input.articleId,
    userId: input.userId,
  });
  if (!input.plain.trim()) return { highlights: null };
  const sentences = splitSentences(input.plain);
  if (sentences.length === 0) return { highlights: null };
  if (!rules) return { highlights: null };
  if (!article.teamId) {
    throw serviceError(400, "INVALID_ARTICLE_STATE", "팀 문서가 아닙니다.");
  }

  const snapshot = await loadPressProcessSnapshot(prisma, {
    articleId: input.articleId,
    teamId: article.teamId,
  });
  requirePressTransition(snapshot.state, {
    type: "COMPLETE_REVIEW",
  });

  const usage = await consumeAiQuota({
    teamId: article.teamId,
    userId: input.userId,
    targetId: input.articleId,
    action: "press_review",
    meta: {
      route: "/api/press/[id]/review",
      plainLength: input.plain.length,
    },
  });

  let llmSpans: LlmSpan[];
  try {
    llmSpans = await completeLegacyReview({
      title: input.title,
      sentences: sentences.map(({ index, text }) => ({ index, text })),
      rules,
    });
  } catch (error) {
    console.error("[review] LLM 호출 실패, fallback 사용", error);
    return { highlights: null };
  }
  if (llmSpans.length === 0) return { highlights: null };

  const spans: Array<{
    id: string;
    start: number;
    end: number;
    note: string;
  }> = [];
  for (const span of llmSpans) {
    const sentence = sentences.find((item) => item.index === span.sentIndex);
    if (!sentence) continue;
    spans.push({
      id: `llm-${span.sentIndex}-${spans.length}`,
      start: sentence.start,
      end: sentence.end,
      note: span.note,
    });
  }
  await withLockedPressProcess(
    { articleId: input.articleId, teamId: article.teamId },
    async ({ tx, snapshot: freshSnapshot }) => {
      const processState = requirePressTransition(freshSnapshot.state, {
        type: "COMPLETE_REVIEW",
      });
      await tx.article.update({
        where: { id: input.articleId },
        data: { status: projectArticleStatus(processState) },
      });
    },
  );
  return { highlights: { spans }, usage };
}
