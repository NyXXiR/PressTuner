import type {
  GenerateArticleInput,
  NormalizeBriefInput,
  createPressFlowApiClient,
} from "./pressFlowApiClient";

export type PressFlowApi = ReturnType<typeof createPressFlowApiClient>;

async function ensureArticle(
  api: PressFlowApi,
  articleId: string | null | undefined,
  teamId?: string,
) {
  if (articleId) return articleId;
  const initialized = await api.initializeArticle({
    type: "PRESS_RELEASE",
    ...(teamId ? { teamId } : {}),
  });
  return initialized.articleId;
}
export async function normalizeSimplifiedPressFlow(input: {
  api: PressFlowApi;
  articleId?: string | null;
  teamId?: string;
  brief: Omit<NormalizeBriefInput, "quotaMode">;
}) {
  const articleId = await ensureArticle(
    input.api,
    input.articleId,
    input.teamId,
  );
  const result = await input.api.normalizeBrief(articleId, {
    ...input.brief,
    quotaMode: "simplified",
  });
  return { articleId, result };
}

export async function generateSimplifiedPressFlow(input: {
  api: PressFlowApi;
  articleId?: string | null;
  teamId?: string;
  draft: Omit<GenerateArticleInput, "quotaMode">;
}) {
  const articleId = await ensureArticle(
    input.api,
    input.articleId,
    input.teamId,
  );
  const result = await input.api.generateArticle(articleId, {
    ...input.draft,
    quotaMode: "simplified",
  });
  return { articleId, result };
}
