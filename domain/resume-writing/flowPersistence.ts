import { z } from "zod";

import type { ResumeWriteFlowState } from "./flowMachine";

const FLOW_STORAGE_PREFIX = "presstuner.resume-write-flow.v1";

export function resumeWriteFlowStorageKey(appId: string | null): string {
  return appId ? `${FLOW_STORAGE_PREFIX}:${appId}` : `${FLOW_STORAGE_PREFIX}:new`;
}

const AsyncStatusSchema = z.enum(["idle", "pending", "error"]);

const BriefSchema = z.object({
  summary: z.string(),
  deadline: z.string().nullable(),
  employmentType: z.string().nullable(),
  location: z.string().nullable(),
  coreResponsibilities: z.array(z.string()),
  requirements: z.array(z.string()),
  preferredQualifications: z.array(z.string()),
  keySignals: z.array(z.string()),
  writingGuidance: z.array(z.string()),
});

const BrickSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()).readonly(),
});

const MessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  body: z.string(),
});

const GroundingExperienceSchema = z.object({
  experienceId: z.string(),
  title: z.string(),
  organization: z.string().nullable(),
  roleTitle: z.string().nullable(),
});

const GroundingFactSchema = z.object({
  factId: z.string(),
  kind: z.string(),
  fieldPath: z.string(),
  value: z.string(),
  active: z.boolean(),
  trustStatus: z.string(),
  evidence: z
    .array(
      z.object({
        documentName: z.string(),
        excerpt: z.string(),
        pageStart: z.number().int().nullable(),
        pageEnd: z.number().int().nullable(),
      }),
    )
    .readonly(),
});

const SuggestionSchema = z.object({
  original: z.string(),
  revised: z.string(),
  instruction: z.string(),
  grounding: z
    .object({
      id: z.string(),
      experienceIds: z.array(z.string()).readonly(),
      factIds: z.array(z.string()).readonly(),
      experiences: z.array(GroundingExperienceSchema).default([]).readonly(),
      facts: z.array(GroundingFactSchema).default([]).readonly(),
    })
    .nullable()
    .optional(),
});

const GroundingSchema = z.object({
  id: z.string(),
  experienceIds: z.array(z.string()).readonly(),
  factIds: z.array(z.string()).readonly(),
  experiences: z
    .array(GroundingExperienceSchema)
    .default([])
    .readonly(),
  facts: z
    .array(GroundingFactSchema)
    .default([])
    .readonly(),
});

const VerificationSchema = z.object({
  id: z.string(),
  result: z.enum(["PASS", "WARN", "BLOCK"]),
  findings: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum(["SUPPORTED", "CONTRADICTION", "UNSUPPORTED"]),
        riskCategory: z.enum(["NUMBER", "DATE", "ORGANIZATION", "TITLE", "OTHER"]),
        claim: z.string(),
        explanation: z.string(),
        supportingFactIds: z.array(z.string()).readonly(),
        supportingFacts: z
          .array(
            z.object({
              factId: z.string(),
              kind: z.string(),
              value: z.string(),
              fieldPath: z.string(),
              experience: z.object({
                title: z.string(),
                organization: z.string().nullable(),
                roleTitle: z.string().nullable(),
              }),
              evidence: z
                .array(
                  z.object({
                    documentName: z.string(),
                    excerpt: z.string(),
                    pageStart: z.number().int().nullable(),
                    pageEnd: z.number().int().nullable(),
                  }),
                )
                .readonly(),
            }),
          )
          .default([])
          .readonly(),
      }),
    )
    .readonly(),
});

const QuestionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string(),
  charLimit: z.number().int().min(100).max(3_000),
  answer: z.string(),
  status: z.enum(["ready", "drafted", "revised", "saved", "completed"]),
  aiAdvice: z.string(),
  draftStatus: z.enum(["idle", "generating", "ready", "error"]),
  draftError: z.string().nullable(),
  linkedBrickIds: z.array(z.string().min(1)).readonly(),
  messages: z.array(MessageSchema).readonly(),
  pendingPrompt: z.string().nullable(),
  pendingSuggestion: SuggestionSchema.nullable(),
  suggestionStatus: AsyncStatusSchema,
  suggestionError: z.string().nullable(),
  saving: z.boolean(),
  saveError: z.string().nullable(),
  revisionCount: z.number().int().min(0),
  deferredCapture: z.boolean(),
  grounding: GroundingSchema.nullable().optional(),
  verification: VerificationSchema.nullable().optional(),
});

const CaptureItemSchema = z.object({
  previewId: z.string().min(1),
  mode: z.enum(["create", "link", "augment"]),
  title: z.string(),
  content: z.string(),
  originalText: z.string(),
  period: z.string().nullable(),
  tags: z.array(z.string()).readonly(),
  matchedBrickId: z.string().nullable(),
  matchedBrickTitle: z.string().nullable(),
  reason: z.string().nullable(),
  existingContent: z.string().nullable(),
  existingOriginalText: z.string().nullable(),
});

const CaptureSchema = z.object({
  captureId: z.string().min(1),
  questionId: z.string().min(1),
  summary: z.string(),
  items: z.array(CaptureItemSchema).readonly(),
  selectedPreviewIds: z.array(z.string().min(1)).readonly(),
  status: z.enum(["pending", "applying", "applied", "dismissed"]),
  error: z.string().nullable(),
});

const DeferredCaptureSchema = z.object({
  taskId: z.string().min(1),
  questionId: z.string().min(1),
  status: z.enum(["retrying", "needs_attention"]),
  attemptCount: z.number().int().min(0),
  nextRetryAt: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  requiresReopen: z.boolean(),
  retryStatus: AsyncStatusSchema.default("idle"),
  error: z.string().nullable().default(null),
});

const MemoryReadinessSchema = z.object({
  status: z.enum([
    "READY",
    "PROCESSING",
    "REVIEW_REQUIRED",
    "EMPTY",
    "FAILED",
  ]),
  confirmedExperienceCount: z.number().int().min(0),
  trustedFactCount: z.number().int().min(0),
  pendingCandidateCount: z.number().int().min(0),
  processingSourceCount: z.number().int().min(0),
  recoveryHref: z.literal("/resume/bricks"),
});

const ProductivitySchema = z.object({
  availableBrickCount: z.number().int().min(0),
  capturedFromWritingCount: z.number().int().min(0),
  reusedBrickCount: z.number().int().min(0),
});

const ResumeWriteFlowStateSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  stage: z.enum(["intake", "review", "writing", "capture", "done"]),
  intake: z.object({ rawText: z.string(), postingUrl: z.string() }),
  organize: z.object({
    status: AsyncStatusSchema,
    error: z.string().nullable(),
  }),
  company: z.string(),
  job: z.string(),
  brief: BriefSchema,
  direction: z.string(),
  userBricks: z.array(BrickSchema).readonly(),
  pinnedBrickIds: z.array(z.string().min(1)).readonly(),
  appId: z.string().min(1).nullable(),
  start: z.object({
    status: AsyncStatusSchema,
    error: z.string().nullable(),
  }),
  questions: z.array(QuestionSchema).readonly(),
  activeQuestionId: z.string().min(1).nullable(),
  captures: z.array(CaptureSchema).readonly(),
  deferredCaptures: z.array(DeferredCaptureSchema).readonly().default([]),
  memoryReadiness: MemoryReadinessSchema.nullable().default(null),
  productivity: ProductivitySchema.nullable(),
  finish: z
    .object({
      status: AsyncStatusSchema,
      error: z.string().nullable(),
    })
    .default({ status: "idle", error: null }),
  notice: z.string().nullable(),
});

function normalizeForStorage(
  state: ResumeWriteFlowState,
): ResumeWriteFlowState {
  return {
    ...state,
    organize: {
      status: state.organize.status === "pending" ? "idle" : state.organize.status,
      error: state.organize.error,
    },
    start: {
      status: state.start.status === "pending" ? "idle" : state.start.status,
      error: state.start.error,
    },
    questions: state.questions.map((question) => ({
      ...question,
      draftStatus:
        question.draftStatus === "generating" ? "idle" : question.draftStatus,
      suggestionStatus:
        question.suggestionStatus === "pending"
          ? "idle"
          : question.suggestionStatus,
      pendingPrompt: null,
      saving: false,
    })),
    captures: state.captures.map((capture) =>
      capture.status === "applying" ? { ...capture, status: "pending" } : capture,
    ),
    deferredCaptures: state.deferredCaptures.map((task) => ({
      ...task,
      retryStatus: task.retryStatus === "pending" ? "idle" : task.retryStatus,
    })),
  };
}

export function serializeResumeWriteFlowState(
  state: ResumeWriteFlowState,
): string {
  return JSON.stringify(normalizeForStorage(state));
}

export function parseResumeWriteFlowState(
  serialized: string,
): ResumeWriteFlowState | null {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }

  const parsed = ResumeWriteFlowStateSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    schemaVersion: 3,
    questions: parsed.data.questions.map((question) => ({
      ...question,
      grounding: question.grounding ?? null,
      verification: question.verification ?? null,
      pendingSuggestion: question.pendingSuggestion
        ? {
            ...question.pendingSuggestion,
            grounding: question.pendingSuggestion.grounding ?? null,
          }
        : null,
    })),
  };
}
