import type {
  createResumeWriteFlowApiClient,
  ResumeStructuredBrief,
} from "./resumeWriteFlowApiClient";

export type ResumeWriteFlowApi = ReturnType<
  typeof createResumeWriteFlowApiClient
>;

export async function startIntakeWithBricks(input: {
  api: ResumeWriteFlowApi;
  intake: { rawText: string; postingUrl: string };
  onBricksLoaded?: (
    bricks: Awaited<ReturnType<ResumeWriteFlowApi["loadUserBricks"]>>,
  ) => void;
}) {
  const organizedPromise = input.api.organizeIntake(input.intake);
  const bricksPromise = input.api
    .loadUserBricks()
    .then((bricks) => {
      input.onBricksLoaded?.(bricks);
      return bricks;
    })
    .catch(() => []);
  const [organized, bricks] = await Promise.all([
    organizedPromise,
    bricksPromise,
  ]);
  return { organized, bricks };
}

export async function startWorkspaceWithFirstDraft(input: {
  api: ResumeWriteFlowApi;
  workspace: {
    company: string;
    job: string;
    brief: ResumeStructuredBrief;
    questions: readonly { prompt: string; charLimit: number }[];
  };
  instructionFor: (question: {
    id: string;
    prompt: string;
    charLimit: number;
    aiAdvice: string;
    linkedBrickIds: readonly string[];
  }) => string;
  onWorkspaceCreated?: (
    workspace: Awaited<ReturnType<ResumeWriteFlowApi["startWorkspace"]>>,
  ) => void;
  onFirstDraftStarted?: (questionId: string) => void;
  onFirstDraftSucceeded?: (
    questionId: string,
    draft: Awaited<ReturnType<ResumeWriteFlowApi["generateDraft"]>>,
  ) => void;
  onFirstDraftFailed?: (questionId: string, error: unknown) => void;
}) {
  const workspace = await input.api.startWorkspace(input.workspace);
  input.onWorkspaceCreated?.(workspace);
  const firstQuestion = workspace.questions[0] ?? null;
  let firstDraft: Awaited<
    ReturnType<ResumeWriteFlowApi["generateDraft"]>
  > | null = null;
  let firstDraftError: unknown = null;
  if (firstQuestion) {
    input.onFirstDraftStarted?.(firstQuestion.id);
    try {
      firstDraft = await input.api.generateDraft({
        questionId: firstQuestion.id,
        instruction: input.instructionFor(firstQuestion),
        charLimit: firstQuestion.charLimit,
      });
      input.onFirstDraftSucceeded?.(firstQuestion.id, firstDraft);
    } catch (error) {
      firstDraftError = error;
      input.onFirstDraftFailed?.(firstQuestion.id, error);
    }
  }
  return { workspace, firstQuestion, firstDraft, firstDraftError };
}

export async function saveThenCompleteQuestion(input: {
  api: ResumeWriteFlowApi;
  appId: string;
  questionId: string;
  answer: string;
}) {
  const saved = await input.api.saveQuestionAnswer({
    questionId: input.questionId,
    answer: input.answer,
    isCompleted: false,
  });
  const completed = await input.api.completeQuestion({
    appId: input.appId,
    questionId: input.questionId,
    answer: input.answer,
    expectedAnswerRevision: saved.answerRevision,
  });
  return { saved, completed };
}

export function assertWorkspaceReadyForCompletion(
  workspace: Awaited<
    ReturnType<ResumeWriteFlowApi["loadExistingApplication"]>
  >,
) {
  if (
    workspace.questions.length === 0 ||
    workspace.questions.some((question) => question.status !== "completed") ||
    workspace.captures.length > 0
  ) {
    throw new Error(
      "Workspace is not ready: complete every question and resolve pending captures first.",
    );
  }
}

export async function completeReadyApplication(input: {
  api: ResumeWriteFlowApi;
  appId: string;
}) {
  const workspace = await input.api.loadExistingApplication(input.appId);
  assertWorkspaceReadyForCompletion(workspace);
  await input.api.completeApplication(input.appId);
  return workspace;
}
