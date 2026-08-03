import { z } from "zod";

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const nullableText = (max: number) => boundedText(max).nullable();
const briefList = z.array(boundedText(500)).max(30);

export const ResumeBriefTextInputSchema = z.string().trim().min(20).max(20_000);
export const ResumeBriefUrlInputSchema = z
  .string()
  .trim()
  .url()
  .max(2_048)
  .refine((value) => /^https?:\/\//i.test(value), {
    message: "Only HTTP(S) URLs are supported",
  });

export const ResumeBriefInputSchema = z
  .object({
    text: ResumeBriefTextInputSchema.optional(),
    url: ResumeBriefUrlInputSchema.optional(),
  })
  .refine((value) => Boolean(value.text || value.url), {
    message: "text or url is required",
  });

export const ResumeBriefQuestionSchema = z.object({
  questionText: boundedText(1_000),
  charLimit: z.number().int().min(1).max(10_000).nullable().default(null),
});

export const ResumeBriefSchema = z.object({
  companyName: boundedText(200),
  jobTitle: boundedText(200),
  deadline: nullableText(100),
  employmentType: nullableText(100),
  location: nullableText(200),
  summary: z.string().trim().max(4_000),
  coreResponsibilities: briefList,
  requirements: briefList,
  preferredQualifications: briefList,
  keySignals: briefList,
  writingGuidance: briefList,
  questions: z.array(ResumeBriefQuestionSchema).min(1).max(8),
});

export const ResumeBriefExtractionSchema = z.object({
  companyName: nullableText(200),
  jobTitle: nullableText(200),
  deadline: nullableText(100),
  employmentType: nullableText(100),
  location: nullableText(200),
  jdSummary: z.string().trim().max(4_000),
  coreResponsibilities: briefList,
  requirements: briefList,
  preferredQualifications: briefList,
  keySignals: briefList,
  writingGuidance: briefList,
  questions: z.array(ResumeBriefQuestionSchema).max(8),
});

export const StartResumeApplicationCommandSchema = z.object({
  clientRequestId: boundedText(128),
  brief: ResumeBriefSchema,
  commonWritingGuidance: briefList.default([]),
});

export const CompleteResumeQuestionCommandSchema = z.object({
  answer: boundedText(20_000),
  expectedAnswerRevision: z.number().int().nonnegative(),
});

export type ResumeBrief = z.infer<typeof ResumeBriefSchema>;
export type StartResumeApplicationCommand = z.infer<
  typeof StartResumeApplicationCommandSchema
>;
