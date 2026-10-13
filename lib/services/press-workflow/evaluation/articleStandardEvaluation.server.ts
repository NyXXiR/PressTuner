import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../prisma";
import { serviceError } from "../../serviceError";
import { buildCanonicalArticlePlain } from "../../../../domain/article/articleCanonicalContent";
import { hash } from "../../../../domain/press-workflow/evaluation/contracts";
import { standardDraftText, standardInputSchema } from "../../../../domain/press-workflow/evaluation/standard";
import type { ArticleQualityState, QualitySnapshot } from "../../../../domain/press-workflow/evaluation/article-evaluation";
import { executeArticleEvaluation, readArticleEvaluationHistory, type ArticleEvaluationPorts } from "./articleEvaluation";
import { makeQualityRepository } from "./qualityRepository";
import { qualityRuntime, measureQualityMetric } from "./qualityRuntime.server";

export async function loadSnapshot(articleId: string, userId: string): Promise<QualitySnapshot> {
  const { article, facts } = await prisma.$transaction(async tx => {
    const article = await tx.article.findUnique({ where: { id: articleId }, select: {
    id: true, teamId: true, userId: true, type: true, status: true, title: true, bodyJson: true, rawInput: true,
    pressExtra: { select: { lead: true, fact: true } },
    groundingState: { select: { groundingRevision: true } }, team: { select: { knowledgeCorpusVersion: true } },
    } });
    if (!article) throw serviceError(404, "ARTICLE_NOT_FOUND", "원고를 찾을 수 없습니다.");
    if (article.teamId) {
      const member = await tx.teamMember.findUnique({ where: { teamId_userId: { teamId: article.teamId, userId } }, select: { teamId: true } });
      if (!member) throw serviceError(403, "ARTICLE_FORBIDDEN", "원고에 접근할 권한이 없습니다.");
    } else if (article.userId !== userId) throw serviceError(403, "ARTICLE_FORBIDDEN", "원고에 접근할 권한이 없습니다.");
    const facts = article.teamId ? await tx.articleFact.findMany({ where: { articleId, teamId: article.teamId, active: true }, orderBy: { id: "asc" }, select: { id: true, content: true, origin: true,
      documentId: true, chunkId: true, candidateId: true, sourceKey: true, pageStart: true, pageEnd: true, excerpt: true } }) : [];
    return { article, facts };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  const body = article.bodyJson && typeof article.bodyJson === "object" && !Array.isArray(article.bodyJson) ? article.bodyJson : {};
  const paragraphs = Array.isArray(body.paragraphs) ? body.paragraphs.flatMap(p => typeof p === "string" ? [p] : p && typeof p === "object" && !Array.isArray(p) && typeof p.text === "string" ? [p.text] : []) : [];
  const plain = buildCanonicalArticlePlain({ lead: typeof body.lead === "string" && body.lead ? body.lead : article.pressExtra?.lead,
    fact: typeof body.fact === "string" && body.fact ? body.fact : article.pressExtra?.fact,
    paragraphs, closing: typeof body.closing === "string" ? body.closing : "", rawInput: article.rawInput });
  const output = standardDraftText(article.title, plain);
  const input = { request: "채택된 사실을 근거로 작성한 보도자료 초안의 사실 일치도를 평가합니다.", output, contexts: facts.map(f => f.content) };
  const validation = standardInputSchema.safeParse(input);
  // Reserve enough bytes for the bridge field names and maximum model name.
  const payloadTooLarge = Buffer.byteLength(JSON.stringify(input), "utf8") + 256 > 131072;
  const reason = article.type !== "PRESS_RELEASE" ? "보도자료 초안에서 사용할 수 있습니다." : article.status === "BRIEF" || !plain.trim() ? "초안을 먼저 작성해 주세요."
    : !facts.length ? "평가할 사실 근거가 없습니다. 원고에 사용할 사실을 먼저 채택해 주세요."
    : !validation.success ? "현재 평가 범위는 초안 20,000자, 사실 20개·각 3,000자 이내입니다."
    : payloadTooLarge ? "원고와 사실의 전체 분량이 평가 입력 한도(128 KiB)를 넘었습니다." : null;
  const fingerprint = hash({ articleId, teamId: article.teamId, userId: article.userId, output, facts,
    groundingRevision: article.groundingState?.groundingRevision ?? 0, corpusVersion: article.team?.knowledgeCorpusVersion ?? 0 });
  return { articleId, teamId: article.teamId, ownerId: article.userId, input, fingerprint, reason, facts,
    groundingRevision: article.groundingState?.groundingRevision ?? 0, corpusVersion: article.team?.knowledgeCorpusVersion ?? 0, generationVersion: "UNKNOWN" };
}

function ports(): ArticleEvaluationPorts {
  return { load: loadSnapshot, runtime: qualityRuntime, measure: measureQualityMetric, repository: makeQualityRepository(prisma) };
}
export async function readArticleStandardEvaluation(articleId: string, userId: string): Promise<ArticleQualityState> {
  const { snapshot, history } = await readArticleEvaluationHistory(articleId, userId, ports());
  const [standard, geval] = await Promise.all([qualityRuntime("STANDARD"), qualityRuntime("GEVAL")]);
  return { contextCount: snapshot.facts.length, fingerprint: snapshot.fingerprint, inputReason: snapshot.reason, runtimes: { STANDARD: standard, GEVAL: geval }, history };
}
export async function runArticleStandardEvaluation(articleId: string, userId: string, request: unknown) {
  return executeArticleEvaluation(articleId, userId, request, ports());
}
