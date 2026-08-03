import { z } from "zod";

export const ApplicationIdSchema = z.string().trim().min(1).brand("ApplicationId");
export const QuestionIdSchema = z.string().trim().min(1).brand("QuestionId");
export const CaptureIdSchema = z.string().trim().min(1).brand("CaptureId");
export const CaptureTaskIdSchema = z.string().trim().min(1).brand("CaptureTaskId");

export const ResumeExperienceCaptureItemSchema = z.object({
  previewId: z.string().min(1),
  mode: z.enum(["create", "link", "augment"]),
  title: z.string().min(1),
  content: z.string().min(1),
  originalText: z.string().min(1),
  period: z.string().nullable(),
  tags: z.array(z.string()),
  matchedBrickId: z.string().nullable(),
  matchedBrickTitle: z.string().nullable(),
  reason: z.string().nullable(),
  existingContent: z.string().nullable(),
  existingOriginalText: z.string().nullable(),
});

export const ExperienceCaptureMetaSchema = z.object({
  type: z.literal("resume_writing_experience_capture_v1"),
  schemaVersion: z.literal(1),
  applicationId: ApplicationIdSchema,
  questionId: QuestionIdSchema,
  summary: z.string(),
  items: z.array(ResumeExperienceCaptureItemSchema),
});

export const ExperienceCaptureResolutionMetaSchema = z.object({
  type: z.literal("resume_writing_experience_capture_resolution_v1"),
  schemaVersion: z.literal(1),
  captureId: CaptureIdSchema,
  action: z.enum(["apply", "dismiss"]),
  selectedPreviewIds: z.array(z.string().min(1)),
});

const RecentMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  body: z.string(),
});

export const WritingTurnBodySchema = z.object({
  questionId: QuestionIdSchema,
  message: z.string().trim().min(1),
  recentMessages: z.array(RecentMessageSchema).max(20).optional(),
  selectedFeedbackNotes: z
    .array(
      z.object({
        quote: z.string(),
        note: z.string(),
        type: z.string().optional(),
      }),
    )
    .max(20)
    .optional(),
});

export const CompleteQuestionBodySchema = z.object({
  answer: z.string().trim().min(1),
  expectedAnswerRevision: z.number().int().nonnegative(),
});

export const CaptureActionBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("apply"),
    selectedPreviewIds: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    action: z.literal("dismiss"),
  }),
]);

export const RetryCaptureTaskBodySchema = z.object({
  action: z.enum(["RETRY", "SKIP"]).default("RETRY"),
  reopenApplication: z.boolean().default(false),
  skipReason: z.string().trim().min(1).max(500).optional(),
}).superRefine((value, context) => {
  if (value.action === "SKIP" && !value.skipReason) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["skipReason"],
      message: "skipReason is required",
    });
  }
});

export type ApplicationId = z.infer<typeof ApplicationIdSchema>;
export type QuestionId = z.infer<typeof QuestionIdSchema>;
export type CaptureId = z.infer<typeof CaptureIdSchema>;
export type ResumeExperienceCaptureItemInput = z.infer<
  typeof ResumeExperienceCaptureItemSchema
>;
export type ExperienceCaptureMeta = z.infer<typeof ExperienceCaptureMetaSchema>;
export type WritingTurnBody = z.infer<typeof WritingTurnBodySchema>;
export type CaptureActionBody = z.infer<typeof CaptureActionBodySchema>;
