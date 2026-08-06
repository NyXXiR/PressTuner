// lib/llm/articleGenerator.ts
import OpenAI from "openai";
import type { ArticleResult } from "../types/article";
import { getEventPublishRelation, formatYMDHM } from "@/lib/utils/datetime";
import { PRESS_RELEASE_SYSTEM_PROMPT, PRESS_RELEASE_USER_PROMPT } from "./prompts/press-release";
import { AI_MODELS } from "../constants/ai";
import type { PressAiDependencyOverrides } from "@/lib/services/article/pressAiDependencies";

let client: OpenAI | null = null;
function openAiClient() { return client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); }

type GenerateArticleParams = {
  serviceName?: string;
  announceType: string;
  oneLiner?: string;
  points: string[];
  quoteMessage?: string;
  quoteWho?: string;
  tone: "formal" | "neutral" | "friendly";

  rawText?: string;
  eventAt?: string;
  publishAt?: string;

  acceptedFacts?: Array<{ id: string; content: string; evidence?: string }>;
  stylePolicy?: string;
  styleExamples?: string;
};

type GenerateArticleOptions = {
  model?: "gpt-4o" | "gpt-4o-mini" | "gpt-4-turbo" | string;
  dependencies?: Pick<PressAiDependencyOverrides, "completeJson" | "now">;
};

export function normalizeUsedFactIds(value: unknown): string[] {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter((id: unknown): id is string => typeof id === "string"),
        ),
      ]
    : [];
}

/**
 * 템플릿 치환 유틸리티
 */
function fillTemplate(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`{{${key}}}`, "g"), value);
  }
  return result;
}

export async function generateArticleWithLLM(
  params: GenerateArticleParams,
  options: GenerateArticleOptions = {}
): Promise<ArticleResult> {
  const {
    serviceName,
    announceType,
    oneLiner,
    points,
    quoteMessage,
    quoteWho,
    tone,
    rawText,
    eventAt,
    publishAt,
    acceptedFacts = [],
    stylePolicy = "",
    styleExamples = "",
  } = params;

  const model = options.model || AI_MODELS.DEFAULT; // 중앙 관리되는 기본 모델 사용

  const filteredPoints = (points || []).filter((p) => p && p.trim().length > 0);

  const toneDesc =
    tone === "formal"
      ? "한국 통신사(뉴시스, 연합뉴스 등)의 보도자료/스트레이트 기사체를 참고해, 정중하고 간결하게 작성해라."
      : tone === "neutral"
      ? "과장되지 않고 담백한 스트레이트 기사체로 작성해라."
      : "스타트업/IT 서비스 소개 기사 느낌으로, 너무 튀지 않게 약간만 친근한 표현을 섞어라.";

  // eventAt / publishAt 관계 분석 (시제 가이드용)
  const relation = getEventPublishRelation(eventAt, publishAt);
  const nowLabel = formatYMDHM(options.dependencies?.now?.() ?? new Date());

  let tenseGuide = "";
  if (relation === "future" && eventAt) {
    tenseGuide = `
- eventAt(${eventAt})는 미래 시점이지만, 보도자료의 핵심인 리드(Lead)와 팩트(Fact) 문단은 뉴스의 시의성을 살리기 위해 **현재형(~한다, ~선보인다, ~출시한다, ~개최한다)**을 적극적으로 사용해라.
- 단, 이후 본문(paragraphs)에서 구체적인 진행 과정, 기대 효과, 향후 계획 등을 상세히 설명할 때는 문맥에 따라 미래 시제(~할 예정이다, ~할 계획이다)를 자연스럽게 사용해도 좋다.
    `.trim();
  } else if (relation === "pastOrSame" && eventAt) {
    const publishLabel =
      publishAt && publishAt.trim().length > 0 ? publishAt : nowLabel;

    tenseGuide = `
- eventAt(${eventAt})는 publishAt(${publishLabel})와 같거나 이전이므로, 사건은 이미 일어났다.
- 리드(Lead)나 팩트(Fact)에서 사건의 완료를 강조할 때는 과거형(~했다, ~마쳤다)을 쓰되, 현재까지 지속되는 효과나 상태를 설명할 때는 현재형을 섞어 써도 된다.
    `.trim();
  } else {
    tenseGuide = `
- eventAt / publishAt이 불명확할 경우, 리드(Lead)는 가급적 현재형(~한다)으로 작성하여 뉴스의 현장감을 살려라.
    `.trim();
  }

  const styleGuideBlock = stylePolicy
    ? `[STYLE_POLICY - prescriptive rules]\n${stylePolicy}`
    : "별도의 팀 스타일 규칙 없이 일반 보도자료 표준 양식을 따른다.";

  // 인용구(Quote) 처리 로직 개선
  const hasQuoteInfo = (quoteMessage && quoteMessage.trim().length > 0) || (quoteWho && quoteWho.trim().length > 0);
  let quotePromptSection = "";

  if (hasQuoteInfo) {
    const speakerInstruction = (quoteWho && quoteWho.trim().length > 0)
      ? `발언자 지정됨: "${quoteWho}" (이 이름과 직함을 정확히 그대로 사용할 것)`
      : `발언자 미지정: **입력된 메모(rawText)에 인명이 있다면 그것을 사용하고, 없다면 '회사 관계자' 또는 'OOO 대표'와 같이 직함만 사용해라.** (🚨주의: 입력되지 않은 사람 이름(예: 김철수)을 절대 창작해내지 마라.)`;

    const messageInstruction = (quoteMessage && quoteMessage.trim().length > 0)
      ? `메시지 지정됨: "${quoteMessage}" (문맥에 맞게 다듬어 인용문으로 사용)`
      : `메시지 미지정: 위 핵심 포인트와 메모 내용을 바탕으로, 서비스의 비전이나 기대 효과를 담은 문장을 구성해라. (없는 사실을 지어내지 말 것)`;

    quotePromptSection = `[인용문(Quote) 작성 가이드]\n- ${speakerInstruction}\n- ${messageInstruction}`;
  } else {
    quotePromptSection = `[인용문(Quote) 처리]\n사용자가 별도의 인용문을 입력하지 않았다. 메모(rawText)에 인용문 형태가 있다면 활용하고, 없다면 억지로 만들지 마라.`;
  }

  const systemPrompt = fillTemplate(PRESS_RELEASE_SYSTEM_PROMPT, {
    styleGuideBlock
  });

  const userPrompt = fillTemplate(PRESS_RELEASE_USER_PROMPT, {
    announceType: announceType || "일반",
    serviceName: serviceName || "미지정",
    oneLiner: oneLiner || "미지정",
    pointsSection: filteredPoints.length ? `강조해야 할 핵심 포인트:\n- ${filteredPoints.join("\n- ")}` : "",
    quotePromptSection,
    toneDesc,
    eventAtSection: eventAt ? `주요 사건 시점(eventAt): ${eventAt}` : "",
    publishAtSection: publishAt && publishAt.trim().length > 0
      ? `게재 희망 시점(publishAt): ${publishAt}`
      : `게재 시점(publishAt) 미정이므로, 현재(${nowLabel}) 기준으로 작성.`,
    tenseGuideSection: tenseGuide ? `시제 규칙:\n${tenseGuide}` : "",
    rawTextSection: rawText
      ? `[사용자 입력 메모 - 가장 중요함]\n${rawText}\n(이 메모에 있는 팩트를 중심으로 기사를 작성해라. 없는 내용은 지어내지 마라.)`
      : "",
    acceptedFactsSection: acceptedFacts.length
      ? `[ACCEPTED FACTS - only factual evidence]\n${acceptedFacts
          .map((fact) => `[${fact.id}] ${fact.content}${fact.evidence ? `\nEvidence: ${fact.evidence}` : ""}`)
          .join("\n\n")}`
      : "[ACCEPTED FACTS]\n없음",
    stylePolicySection: stylePolicy
      ? `[STYLE_POLICY]\n${stylePolicy}`
      : "",
    styleExamplesSection: styleExamples
      ? `[STYLE_EXAMPLE - expression only, NEVER factual evidence]\n${styleExamples}`
      : "",
  });

  console.log(`[generateArticleWithLLM] Using model: ${model}`);

  const raw = options.dependencies?.completeJson
    ? await options.dependencies.completeJson({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.3, responseFormat: { type: "json_object" } })
    : (await openAiClient().chat.completions.create({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.3, response_format: { type: "json_object" } })).choices[0]?.message?.content ?? "{}";

  let parsed: ArticleResult;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error("JSON 파싱 실패, raw 응답:", raw);
    parsed = {
      title: "",
      lead: "",
      fact: "",
      paragraphs: [{ text: raw, importance: 3 }],
      closing: "",
    } as any;
  }

  // Paragraphs 안전 정렬
  const safeParagraphs = Array.isArray((parsed as any).paragraphs)
    ? (parsed as any).paragraphs.map((p: any) => ({
        text: String(p?.text ?? ""),
        importance: typeof p?.importance === "number" ? p.importance : 3,
      }))
    : [];

  (parsed as any).paragraphs = [...safeParagraphs].sort(
    (a, b) => (b.importance ?? 0) - (a.importance ?? 0),
  );
  (parsed as any).usedFactIds = normalizeUsedFactIds(
    (parsed as any).usedFactIds,
  );

  return parsed;
}
