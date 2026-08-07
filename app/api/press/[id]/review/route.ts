import { NextRequest, NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/auth";
import OpenAI from "openai";
import { apiError } from "@/lib/utils/api";
import { getPressReviewRules } from "@/lib/services/pressReviewService";
import { consumeAiQuota } from "@/domain/quota/aiQuota";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

type RouteContext = { params: Promise<{ id: string }> };

type ReviewBody = {
  title?: string;
  plain: string;
};

// ... (ReviewSpan, Sentence, LLMSpan, normalize, splitSentences, callReviewLLM 로직은 동일) ...
// (지면 관계상 생략, 기존 코드 그대로 사용)

type ReviewSpan = {
  id: string;
  start: number;
  end: number;
  note?: string;
};

type Sentence = { index: number; text: string; start: number; end: number };

type LLMSpan = {
  sentIndex: number;
  note: string;
  severity?: "info" | "warn";
};

function normalize(s: string) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function splitSentences(plain: string): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  const re = /([.!?]|다\.)\s+|\n+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(plain)) !== null) {
    const end = m.index + m[0].length;
    const chunk = plain.slice(start, end);
    if (normalize(chunk)) {
      out.push({ index: out.length, text: chunk, start, end });
    }
    start = end;
  }
  if (start < plain.length) {
    const chunk = plain.slice(start);
    if (normalize(chunk)) {
      out.push({ index: out.length, text: chunk, start, end: plain.length });
    }
  }
  return out;
}

async function callReviewLLM(args: {
  title: string;
  plain: string;
  sentences: { index: number; text: string }[];
  rules: any;
}): Promise<LLMSpan[]> {
  // ... 기존 구현 그대로 ...
  const { title, sentences, rules } = args;

  const system = `
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
`;

  const user = `
입력(JSON):
${JSON.stringify({ title, rules, sentences }, null, 2)}

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
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system.trim() },
      { role: "user", content: user.trim() },
    ],
  });

  const content = completion.choices[0].message.content;
  if (!content) throw new Error("LLM 응답이 비어 있습니다.");

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    console.error("review LLM JSON parse 실패", e, content);
    throw new Error("LLM JSON 파싱 실패");
  }

  const spans = Array.isArray(parsed?.spans) ? parsed.spans : [];
  return spans
    .map((s: any) => ({
      sentIndex: Number(s?.sentIndex),
      note: typeof s?.note === "string" ? s.note : "",
      severity:
        s?.severity === "warn" || s?.severity === "info"
          ? s.severity
          : undefined,
    }))
    .filter((s: LLMSpan) => s.note && !Number.isNaN(s.sentIndex));
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;

    const currentUserId = await requireCurrentUserId();
    if (!currentUserId) {
      return NextResponse.json(
        apiError("UNAUTHORIZED", "로그인이 필요합니다.", 401).body,
        { status: 401 }
      );
    }

    const { article, rules } = await getPressReviewRules({
      articleId: id,
      userId: currentUserId,
    });

    const body = (await req.json()) as ReviewBody;
    const plain = body.plain ?? "";
    const title = body.title ?? "";

    if (!plain.trim()) {
      return NextResponse.json({ highlights: null });
    }

    const sentences = splitSentences(plain);
    if (!sentences.length) {
      return NextResponse.json({ highlights: null });
    }

    if (!rules) {
      return NextResponse.json({ highlights: null });
    }

    if (!article.teamId) {
      return NextResponse.json(
        apiError("INVALID_ARTICLE_STATE", "팀 문서가 아닙니다.", 400).body,
        { status: 400 }
      );
    }

    const usageAfter = await consumeAiQuota({
      teamId: article.teamId,
      userId: currentUserId,
      targetId: id,
      action: "press_review",
      meta: {
        route: "/api/press/[id]/review",
        plainLength: plain.length,
      },
    });

    let llmSpans: LLMSpan[] = [];
    try {
      llmSpans = await callReviewLLM({
        title,
        plain,
        sentences: sentences.map((s) => ({ index: s.index, text: s.text })),
        rules,
      });
    } catch (e) {
      console.error("[review] LLM 호출 실패, fallback 사용", e);
      return NextResponse.json({ highlights: null });
    }

    if (!llmSpans.length) {
      return NextResponse.json({ highlights: null });
    }

    const spans: ReviewSpan[] = [];
    for (const s of llmSpans) {
      const sent = sentences.find((it) => it.index === s.sentIndex);
      if (!sent) continue;
      spans.push({
        id: `llm-${s.sentIndex}-${spans.length}`,
        start: sent.start,
        end: sent.end,
        note: s.note,
      });
    }

    return NextResponse.json({
      highlights: { spans },
      usage: usageAfter,
    });
  } catch (e: any) {
    console.error(e);
    const status = e?.status ?? 500;
    return NextResponse.json(
      apiError(
        e?.code ?? "REVIEW_FAILED",
        e?.message ?? "검수 중 오류가 발생했습니다.",
        status,
        e?.details ? { details: e.details } : undefined,
      ).body,
      { status }
    );
  }
}
