import { z } from "zod";

export const LabStageSchema = z.enum([
  "intake",
  "review",
  "writing",
  "capture",
  "done",
]);

export const LabQuestionStatusSchema = z.enum([
  "ready",
  "drafted",
  "revised",
  "saved",
  "completed",
]);

export const LabCandidateResolutionSchema = z.enum([
  "create",
  "augment",
  "link",
  "skip",
]);

const LabMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["assistant", "user"]),
    body: z.string(),
  })
  .readonly();

const LabSuggestionSchema = z
  .object({
    original: z.string(),
    revised: z.string(),
    instruction: z.string(),
  })
  .readonly();

export const LabQuestionSchema = z
  .object({
    id: z.string().min(1),
    prompt: z.string(),
    charLimit: z.number().int().min(100).max(3_000),
    answer: z.string(),
    status: LabQuestionStatusSchema,
    revisionCount: z.number().int().min(0),
    messages: z.array(LabMessageSchema).readonly(),
    pendingSuggestion: LabSuggestionSchema.nullable(),
    linkedBrickIds: z.array(z.string().min(1)).readonly(),
  })
  .readonly();

export const LabExperienceBrickSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    content: z.string().min(1),
    tags: z.array(z.string().min(1)).readonly(),
    sourceQuestionId: z.string().min(1).nullable(),
  })
  .readonly();

export const LabExperienceCandidateSchema = z
  .object({
    id: z.string().min(1),
    sourceQuestionId: z.string().min(1),
    title: z.string().min(1),
    content: z.string().min(1),
    tags: z.array(z.string().min(1)).readonly(),
    resolution: LabCandidateResolutionSchema,
    matchedBrickId: z.string().min(1).nullable(),
  })
  .readonly();

const LabIntakeSchema = z
  .object({
    rawText: z.string(),
    postingUrl: z.string(),
  })
  .readonly();

const LabTargetSchema = z
  .object({
    company: z.string(),
    role: z.string(),
    deadline: z.string(),
    summary: z.string(),
    employmentType: z.string(),
    location: z.string(),
    keySignals: z.array(z.string()).readonly(),
    writingGuidance: z.array(z.string()).readonly(),
  })
  .readonly();

export const ResumeWritingLabStateSchema = z
  .object({
    schemaVersion: z.literal(2),
    stage: LabStageSchema,
    intake: LabIntakeSchema,
    target: LabTargetSchema,
    questions: z.array(LabQuestionSchema).readonly(),
    activeQuestionId: z.string().min(1).nullable(),
    bricks: z.array(LabExperienceBrickSchema).readonly(),
    inlineCandidate: LabExperienceCandidateSchema.nullable(),
    captureCandidates: z.array(LabExperienceCandidateSchema).readonly(),
    sessionSavedBrickIds: z.array(z.string().min(1)).readonly(),
    notice: z.string().nullable(),
  })
  .readonly();

export type LabStage = z.infer<typeof LabStageSchema>;
export type LabQuestionStatus = z.infer<typeof LabQuestionStatusSchema>;
export type LabCandidateResolution = z.infer<
  typeof LabCandidateResolutionSchema
>;
export type LabQuestion = z.infer<typeof LabQuestionSchema>;
export type LabExperienceBrick = z.infer<typeof LabExperienceBrickSchema>;
export type LabExperienceCandidate = z.infer<
  typeof LabExperienceCandidateSchema
>;
export type ResumeWritingLabState = z.infer<
  typeof ResumeWritingLabStateSchema
>;
