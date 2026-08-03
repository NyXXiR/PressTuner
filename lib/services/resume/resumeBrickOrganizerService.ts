import OpenAI from "openai";
import { z } from "zod";
import { zodResponseFormat } from "openai/helpers/zod";

import { resolveModel } from "@/lib/ai/modelPolicy";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM 형식이어야 합니다.");

const OrganizedBrickDraftSchema = z.object({
  title: z.string().min(1).max(50),
  content: z.string().min(10).max(1000),
  originalText: z.string().min(10).max(2000),
  startDate: MonthSchema.nullable(),
  endDate: MonthSchema.nullable(),
  isCurrent: z.boolean(),
  tags: z.array(z.string().min(1).max(16)).max(6),
});

const OrganizedBrickDraftsSchema = z.object({
  items: z.array(OrganizedBrickDraftSchema).min(1).max(6),
});

export type OrganizedBrickDraft = z.infer<typeof OrganizedBrickDraftSchema>;

function firstMeaningfulLine(text: string) {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "새 경험"
  );
}

function normalizeTags(tags: readonly string[]) {
  return Array.from(
    new Set(tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
  ).slice(0, 6);
}

function splitFallbackExperienceText(text: string) {
  const chunks = text
    .split(/(?=\n\s*(?:첫째|둘째|셋째|넷째|다섯째|[1-6][.)]|[-*]\s+))/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 40);

  return chunks.length > 1 ? chunks.slice(0, 6) : [text];
}

function buildFallbackDraft(text: string): OrganizedBrickDraft {
  const content = text.slice(0, 1000);
  return {
    title: firstMeaningfulLine(text).slice(0, 50),
    content,
    originalText: text.slice(0, 2000),
    startDate: null,
    endDate: null,
    isCurrent: false,
    tags: [],
  };
}

function normalizeDraft(draft: OrganizedBrickDraft): OrganizedBrickDraft {
  const content = draft.content.trim();
  const originalText = draft.originalText.trim();
  return {
    title: (draft.title.trim() || firstMeaningfulLine(originalText)).slice(0, 50),
    content: (content || originalText).slice(0, 1000),
    originalText: originalText.slice(0, 2000),
    startDate: draft.startDate,
    endDate: draft.isCurrent ? null : draft.endDate,
    isCurrent: draft.isCurrent,
    tags: normalizeTags(draft.tags),
  };
}

function buildFallbackDrafts(sourceText: string) {
  return splitFallbackExperienceText(sourceText).map(buildFallbackDraft);
}

export async function organizeResumeBrickDrafts(
  roughText: string,
): Promise<OrganizedBrickDraft[]> {
  const trimmed = roughText.trim();
  const sourceText = trimmed.slice(0, 6000);

  const completion = await openai.chat.completions.parse({
    model: resolveModel("resume.brick.organize"),
    messages: [
      {
        role: "system",
        content: `
You turn rough Korean resume material into reusable experience bricks.

Rules:
- Preserve the user's actual facts. Do not invent metrics, companies, dates, or outcomes.
- Do not merge separate experiences into one summary.
- If the source has numbered sections like "첫째/둘째/셋째" or clearly separate paragraphs, return one item per concrete experience.
- Ignore generic intro/conclusion paragraphs unless they contain concrete experience facts.
- title: Korean, specific, up to 50 characters.
- content: Korean, 4-7 sentences. Preserve concrete context, problem, action, result, and reusable lesson when present.
- originalText: copy the source excerpt that supports this item. Do not put the whole input unless there is only one experience.
- startDate/endDate: use YYYY-MM only when the memo clearly provides a month. Otherwise null.
- isCurrent: true only when the memo clearly says the work is ongoing.
- tags: up to 6 short nouns or noun phrases, Korean or English.
- For the sample shape "첫째/둘째/셋째", produce three items, not one overview.
- If the memo is messy, organize it. Do not lecture the user.
        `.trim(),
      },
      {
        role: "user",
        content: `rough Korean experience memo with possibly multiple experiences:\n\n${sourceText}`,
      },
    ],
    response_format: zodResponseFormat(
      OrganizedBrickDraftsSchema,
      "resume_brick_organizer",
    ),
    temperature: 0.1,
  });

  const parsedItems = completion.choices[0].message.parsed?.items;
  if (!parsedItems || parsedItems.length === 0) {
    return buildFallbackDrafts(sourceText);
  }

  return parsedItems.map(normalizeDraft);
}

export async function organizeResumeBrickDraft(
  roughText: string,
): Promise<OrganizedBrickDraft> {
  const drafts = await organizeResumeBrickDrafts(roughText);
  const firstDraft = drafts.at(0);
  return firstDraft ?? buildFallbackDraft(roughText.trim().slice(0, 6000));
}
