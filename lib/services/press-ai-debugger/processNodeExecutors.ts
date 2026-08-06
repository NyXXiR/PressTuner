import { buildGeneratedPlain, evaluatePressDraftQuality } from "@/domain/press-ai-debugger/processExecutor";
import { initArticleDraft, generateArticleFromBrief } from "@/lib/services/press/pressService";
import { normalizeBriefUseCase } from "@/lib/services/article/generationUseCases";
import { reviewUseCase, rePolishUseCase } from "@/lib/services/article/reviewUseCases";
import type { PressAiDependencyOverrides } from "@/lib/services/article/pressAiDependencies";

export const PRESS_AI_DEBUG_EXECUTOR_VERSION = "press-ai-checkpoint-executor/1";
type RecordValue = Record<string, any>;
export async function createPressDebugArticle(args: { teamId: string; userId: string }) { return initArticleDraft({ teamId: args.teamId, userId: args.userId, type: "PRESS_RELEASE" }); }

export async function executePressDebugNode(args: { teamId: string; userId: string; nodeId: string; input: RecordValue; dependencies?: PressAiDependencyOverrides }) {
  switch (args.nodeId) {
    case "article-initialization": return { articleId: args.input.articleId, teamId: args.teamId, type: "PRESS_RELEASE" };
    case "brief-normalization": { const value = await normalizeBriefUseCase({ team: { id: args.teamId }, userId: args.userId, articleId: args.input.articleId, rawText: args.input.rawText, tone: args.input.tone, quotaMode: "simplified", dependencies: args.dependencies }); return { articleId: args.input.articleId, ...value.brief, tone: args.input.tone, rawText: args.input.rawText, factCandidates: value.factCandidates, usage: value.usage }; }
    case "draft-generation": { const { articleId, ...body } = args.input; const value = await generateArticleFromBrief({ teamId: args.teamId, userId: args.userId, articleId, body: body as any, dependencies: args.dependencies }); const plain = buildGeneratedPlain(value); return { ...value, articleId, plain, qualityChecks: evaluatePressDraftQuality(plain) }; }
    case "draft-review": { const value = await reviewUseCase({ team: { id: args.teamId }, userId: args.userId, articleId: args.input.articleId, title: args.input.title, plain: args.input.plain, userInstruction: args.input.userInstruction ?? "", quotaMode: "simplified", dependencies: args.dependencies }); return value; }
    case "selected-rewrite": { const value = await rePolishUseCase({ articleId: args.input.articleId, teamId: args.teamId, userId: args.userId, selectedNoteIds: args.input.selectedNoteIds, userInstruction: args.input.userInstruction, quotaMode: "simplified", dependencies: args.dependencies }) as RecordValue; return { ...value, title: value.revisedTitle ?? value.title ?? "", plain: value.revisedPlain ?? value.plain ?? "" }; }
    default: throw new Error("PRESS_AI_PROCESS_NODE_INVALID");
  }
}
