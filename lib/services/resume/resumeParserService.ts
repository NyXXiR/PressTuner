import OpenAI from "openai";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ✅ 1. Zod 스키마 정의 (누락된 companyOrOrg, type 필드 복구)
const ExperienceBrickSchema = z.object({
  title: z
    .string()
    .describe(
      "프로젝트명 (예: '기상청 친환경에너지 프로젝트'). 회사명이 아님."
    ),
  companyOrOrg: z
    .string()
    .nullable()
    .describe(
      "소속 회사 또는 조직명 (예: '씨씨미디어서비스', '개인 프로젝트'). 없으면 null."
    ),
  period: z.string().nullable().describe("기간 (YYYY.MM - YYYY.MM)"),
  content: z.string().describe("STAR 기법 요약 (200-300자)"),
  originalText: z
    .string()
    .describe("관련된 이력서 내 원문 전체 발췌 (상세 기술 내용 포함)"),
  tags: z.array(z.string()).describe("핵심 기술 스택 3~4개"),
  type: z
    .enum(["PROJECT", "WORK_EXPERIENCE", "SIDE_PROJECT", "OTHER"])
    .describe("경험의 유형"),
});

// 분석(Analysis) 단계가 포함된 전체 응답 스키마
const ResumeParseResultSchema = z.object({
  analysis: z.object({
    detected_project_count: z
      .number()
      .describe("이력서 전체에서 감지된 프로젝트 및 주요 경험의 총 개수"),
    format_type: z
      .enum(["STRUCTURED_LIST", "NARRATIVE_PROSE", "MIXED"])
      .describe("이력서 서술 방식"),
    reasoning: z
      .string()
      .describe(
        "추출 기준 근거 (예: '대괄호 프로젝트 5개와 자소서 내 튜닝 경험 1개 발견')"
      ),
  }),
  items: z.array(ExperienceBrickSchema).describe("추출된 경험 브릭 리스트"),
});

// 타입 추출 (이 타입은 이제 companyOrOrg, type을 포함합니다)
export type ExtractedBrick = z.infer<typeof ExperienceBrickSchema>;

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const cleanText = Array.isArray(text) ? text.join("\n\n") : text;
    // 간단한 전처리
    return cleanText.replace(/\0/g, "").replace(/ {2,}/g, " ").trim();
  } catch (error) {
    console.error("PDF Extraction Failed:", error);
    return "";
  }
}

export async function parseResumeToBricks(
  text: string
): Promise<ExtractedBrick[]> {
  const truncatedText = text.slice(0, 35000);

  const completion = await openai.chat.completions.parse({
    model: "gpt-5.1", // 혹은 gpt-4o-2024-08-06
    messages: [
      {
        role: "system",
        content: `
You are a Resume Architect. Extract granular "Experience Bricks" from the resume.

**CORE GOAL:** Extract **ALL** distinct technical experiences. Aim for **8 to 12 bricks**.

**🚨 EXTRACTION RULES:**

1.  **Explicit Projects (JobKorea Style):**
    *   Look for text inside brackets like **[Project Name]**.
    *   Look for sections titled "Side Projects", "Internships".
    *   **Action:** EVERY explicit section MUST be a separate brick.

2.  **Implicit/Narrative Projects (Saramin Style):**
    *   Scan the "Self-Introduction" prose.
    *   If the candidate details a specific technical achievement (e.g., "Query Optimization"), extract it as a **separate brick**.

3.  **Strict "No-Grouping":**
    *   Do **NOT** group multiple projects under one "Company Brick".
    *   If "Samsung" has 3 projects, create **3 separate bricks**.

**Field Guidelines:**
*   **companyOrOrg:** The company name (e.g., "Samsung Electronics"). If it's a personal project, use "Personal Project".
*   **type:** Choose 'PROJECT' for specific tasks/projects, 'WORK_EXPERIENCE' for general roles if no specific project is listed, 'SIDE_PROJECT' for personal work.

**Output Logic:**
1.  First, populate the 'analysis' object.
2.  Then, generate the 'items' array.
        `.trim(),
      },
      {
        role: "user",
        content: `Here is the resume text:\n\n${truncatedText}`,
      },
    ],
    response_format: zodResponseFormat(
      ResumeParseResultSchema,
      "resume_extraction"
    ),
    temperature: 0.05,
  });

  const parsed = completion.choices[0].message.parsed;

  if (!parsed?.items) {
    return [];
  }

  // ✅ 매핑 시 companyOrOrg와 type을 포함하여 타입 에러 해결
  return parsed.items.map((it) => ({
    title: it.title,
    companyOrOrg: it.companyOrOrg,
    period: it.period,
    content: it.content,
    originalText: it.originalText,
    tags: it.tags,
    type: it.type,
  }));
}
