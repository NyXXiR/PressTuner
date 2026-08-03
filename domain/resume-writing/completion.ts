export type ResumeExperienceCaptureItem = {
  readonly previewId: string;
  readonly mode: "create" | "link" | "augment";
  readonly title: string;
  readonly content: string;
  readonly originalText: string;
  readonly period: string | null;
  readonly tags: readonly string[];
  readonly matchedBrickId: string | null;
  readonly matchedBrickTitle: string | null;
  readonly reason: string | null;
  readonly existingContent: string | null;
  readonly existingOriginalText: string | null;
};

export type CompleteResumeWritingQuestionInput = {
  readonly applicationId: string;
  readonly questionId: string;
  readonly userId: string;
  readonly teamId: string;
  readonly questionText: string;
  readonly answer: string;
};

type ExperiencePreview = {
  readonly summary: string;
  readonly items: readonly ResumeExperienceCaptureItem[];
};

type CaptureProposal = CompleteResumeWritingQuestionInput & ExperiencePreview;

type CompleteQuestionDependencies = {
  readonly saveCompletion: (
    input: CompleteResumeWritingQuestionInput,
  ) => Promise<void>;
  readonly previewExperience: (
    input: CompleteResumeWritingQuestionInput,
  ) => Promise<ExperiencePreview>;
  readonly saveCaptureProposal: (
    input: CaptureProposal,
  ) => Promise<{ readonly captureId: string }>;
};

export type CompleteResumeWritingQuestionResult = {
  readonly completed: true;
  readonly capture:
    | { readonly kind: "none"; readonly summary: string }
    | {
        readonly kind: "pending_approval";
        readonly captureId: string;
        readonly summary: string;
        readonly items: readonly ResumeExperienceCaptureItem[];
      }
    | {
        readonly kind: "deferred";
        readonly reason:
          | "EXTRACTION_UNAVAILABLE"
          | "CAPTURE_PERSISTENCE_UNAVAILABLE";
        readonly taskId?: string;
        readonly status?: "retrying" | "needs_attention";
        readonly attemptCount?: number;
        readonly nextRetryAt?: string | null;
      };
};

export async function completeResumeWritingQuestion(
  input: CompleteResumeWritingQuestionInput,
  dependencies: CompleteQuestionDependencies,
): Promise<CompleteResumeWritingQuestionResult> {
  await dependencies.saveCompletion(input);

  let preview: ExperiencePreview;
  try {
    preview = await dependencies.previewExperience(input);
  } catch {
    return {
      completed: true,
      capture: {
        kind: "deferred",
        reason: "EXTRACTION_UNAVAILABLE",
      },
    };
  }

  if (preview.items.length === 0) {
    return {
      completed: true,
      capture: {
        kind: "none",
        summary: preview.summary,
      },
    };
  }

  try {
    const proposal = await dependencies.saveCaptureProposal({
      ...input,
      summary: preview.summary,
      items: preview.items,
    });
    return {
      completed: true,
      capture: {
        kind: "pending_approval",
        captureId: proposal.captureId,
        summary: preview.summary,
        items: preview.items,
      },
    };
  } catch {
    return {
      completed: true,
      capture: {
        kind: "deferred",
        reason: "CAPTURE_PERSISTENCE_UNAVAILABLE",
      },
    };
  }
}
