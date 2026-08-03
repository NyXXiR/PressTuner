import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";
import { resolveModel } from "@/lib/ai/modelPolicy";
import { ResumeBriefExtractionSchema } from "@/domain/resume-writing/contracts";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type ResumeIntakeResult = z.infer<typeof ResumeBriefExtractionSchema>;

function normalizeQuestionEvidence(text: string) {
  return text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function hasExplicitQuestionEvidence(
  sourceText: string,
  questionText: string,
) {
  const normalizedSource = normalizeQuestionEvidence(sourceText);
  const normalizedQuestion = normalizeQuestionEvidence(questionText);

  if (!normalizedQuestion || normalizedQuestion.length < 12) {
    return false;
  }

  if (normalizedSource.includes(normalizedQuestion)) {
    return true;
  }

  const chunks = normalizedQuestion
    .split(/(?:작성해주세요|기술해주세요|설명해주세요|서술해주세요|말해주세요|적어주세요)/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 10);

  return chunks.some((chunk) => normalizedSource.includes(chunk));
}

export async function parseResumeApplicationInput(
  text: string,
): Promise<ResumeIntakeResult> {
  const truncatedText = text.slice(0, 20000);

  const completion = await openai.chat.completions.parse({
    model: resolveModel("resume.intake.compose"),
    messages: [
      {
        role: "system",
        content: `
You organize Korean hiring information for a resume-writing assistant.

Extract:
1. companyName: 회사명
2. jobTitle: 직무명
3. deadline: 마감일 문자열 (예: 2026년 4월 19일 23:59), 없으면 null
4. employmentType: 고용형태, 없으면 null
5. location: 근무지, 없으면 null
6. jdSummary: 지원자가 참고하면 좋은 공고 핵심 요약 (한국어, 2~4문장)
7. coreResponsibilities: 주요 업무 핵심 bullet list
8. requirements: 필수 요건 bullet list
9. preferredQualifications: 우대 사항 bullet list
10. keySignals: 이 공고가 중요하게 볼 평가 포인트 bullet list
11. writingGuidance: 자소서 초안 작성 시 반영할 작성 가이드 bullet list
12. questions: 자기소개서 문항 배열

Rules:
- Output MUST be Korean for jdSummary.
- If a field is unknown, use null for companyName/jobTitle.
- If deadline/employmentType/location is unknown, use null.
- Preserve original question wording as much as possible.
- If character limit is missing, return null.
- Extract up to 8 questions.
- Each array field should contain concise Korean phrases. Return an empty array when unknown.
- Ignore irrelevant boilerplate like benefits or hiring process unless it helps summarize jdSummary.
- questions must contain only explicitly written self-introduction / essay questions from the source.
- If the source does not explicitly include cover-letter questions, return an empty array.
- Never invent, infer, or convert requirements/responsibilities into questions.
        `.trim(),
      },
      {
        role: "user",
        content: `정리할 원문:\n\n${truncatedText}`,
      },
    ],
    response_format: zodResponseFormat(
      ResumeBriefExtractionSchema,
      "resume_application_intake",
    ),
    temperature: 0.1,
  });

  const parsed = completion.choices[0].message.parsed;

  if (parsed) {
    parsed.questions = parsed.questions.filter((question) =>
      hasExplicitQuestionEvidence(truncatedText, question.questionText),
    );
  }

  return (
    parsed ?? {
      companyName: null,
      jobTitle: null,
      deadline: null,
      employmentType: null,
      location: null,
      jdSummary: "",
      coreResponsibilities: [],
      requirements: [],
      preferredQualifications: [],
      keySignals: [],
      writingGuidance: [],
      questions: [],
    }
  );
}

const ResumeQuestionSchema = z.object({
  questions: z.array(
    z.object({
      questionText: z.string(),
      charLimit: z.number().int().positive().nullable(),
    }),
  ),
});

export async function organizeResumeQuestions(
  text: string,
): Promise<Array<{ questionText: string; charLimit: number | null }>> {
  const truncatedText = text.slice(0, 12000);

  const completion = await openai.chat.completions.parse({
    model: resolveModel("resume.intake.questions"),
    messages: [
      {
        role: "system",
        content: `
You extract Korean cover-letter questions from pasted text.

Rules:
- Return only actual self-introduction / essay questions.
- Keep original wording as much as possible.
- If character limit is missing, return null.
- Ignore job description bullets that are not questions.
- Extract up to 8 questions.
        `.trim(),
      },
      {
        role: "user",
        content: `문항 정리 대상 원문:\n\n${truncatedText}`,
      },
    ],
    response_format: zodResponseFormat(
      ResumeQuestionSchema,
      "resume_question_organizer",
    ),
    temperature: 0,
  });

  return completion.choices[0].message.parsed?.questions ?? [];
}
