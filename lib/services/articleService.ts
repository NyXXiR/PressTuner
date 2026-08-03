// lib/services/articleService.ts

import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { Prisma } from "@prisma/client";
import {
  ArticleStatus,
  ArticleUsageType,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { trackOpsEvent } from "@/lib/ops";
import { generateArticleWithLLM } from "../llm/articleGenerator";
import type { ArticleResult } from "../types/article";
import type { ArticleType } from "@prisma/client";
import {
  applyPendingRewriteToHarness,
  buildPressRepolishPromptBundle,
  buildPressReviewGroundingContext,
  createInitialPressEditHarness,
  mergePendingRewriteIntoHarness,
  mergeReviewIntoHarness,
  readPressEditHarness,
  type PressBriefSnapshot,
  type PressEditHarness,
  type PressHarnessReviewNote,
} from "./press/pressEditHarness";

// ✅ Import Style Signal Service
import {
  consumeSimplifiedPressQuota,
  type SimplifiedPressQuotaState,
} from "./simplifiedPressQuotaService";
import { consumeAiQuota } from "@/domain/quota/aiQuota";
import {
  buildArticleUsageSummary,
  consumeArticleUsageOrThrow,
  getOrCreateArticleUsageStat as getArticleUsageStat,
  requirePressSubscription as loadPressSubscription,
  resolveArticleLimits,
  resolvePressRewriteLimit,
  type ArticleUsageSummary,
} from "./article/articleUsageDomain";
import { normalizeBriefFromEvidence } from "./article/briefNormalizationService";
import {
  discoverArticleEvidenceCandidates,
  groundingDiscoveryHash,
  syncBriefUserFacts,
} from "./article/articleGroundingService";
import { searchKnowledge } from "./knowledge/knowledgeRetrievalService";
import { loadKnowledgeContexts } from "./knowledge/knowledgeContextService";
import { hashArticleContent } from "@/domain/article/articleContentHash";
import { filterActionableReviewNotes } from "@/domain/article/reviewNotePolicy";
import { finalizeVerifiedArticle } from "./article/articleFinalizationService";
export type {
  ArticleUsageSummary,
  UsagePayload,
} from "./article/articleUsageDomain";

// ✅ [Updated] Use datetime.ts utilities
import { formatISO, kstTodayUtcRange } from "@/lib/utils/datetime";

import { ServiceError } from "../errors";

// -------------------------
// Constants
// -------------------------
const MAX_REPOLISH_LIMIT = 5;

// -------------------------
// OpenAI Config
// -------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const BRIEF_MODEL = process.env.PT_BRIEF_MODEL ?? "gpt-4.1-mini";
const POLISH_MODEL = process.env.PT_POLISH_MODEL ?? "gpt-4.1-mini";

// -------------------------
// Helper Functions
// -------------------------

function throwErr(
  code: string,
  status: number,
  message?: string,
  data?: unknown,
): never {
  throw new ServiceError(code, status, message, data);
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
  } catch {
    return {} as Prisma.InputJsonValue;
  }
}

async function assertArticleTeamOrThrow(
  tx: Prisma.TransactionClient,
  articleId: string,
  teamId: string,
) {
  const found = await tx.article.findFirst({
    where: { id: articleId, teamId },
    select: {
      id: true,
      type: true,
      title: true,
      bodyJson: true,
      rawInput: true,
      refinementQna: true,
      status: true,
      isShared: true,
      shareToken: true,
      updatedAt: true,
    },
  });

  if (!found) throwErr("ARTICLE_NOT_FOUND", 404, "문서를 찾을 수 없습니다.");

  return found;
}

function safeTone(tone: unknown): "formal" | "neutral" | "friendly" {
  if (tone === "friendly" || tone === "neutral" || tone === "formal")
    return tone;
  return "formal";
}

function buildPlainFromDraftParts(input: {
  lead?: string | null;
  paragraphs?: Array<{ text?: string | null } | string> | null;
  closing?: string | null;
  rawInput?: string | null;
}) {
  const lead = typeof input.lead === "string" ? input.lead.trim() : "";
  const paragraphText = Array.isArray(input.paragraphs)
    ? input.paragraphs
        .map((paragraph) =>
          typeof paragraph === "string"
            ? paragraph.trim()
            : typeof paragraph?.text === "string"
              ? paragraph.text.trim()
              : "",
        )
        .filter(Boolean)
        .join("\n\n")
    : "";
  const closing =
    typeof input.closing === "string" ? input.closing.trim() : "";
  const plain = [lead, paragraphText, closing].filter(Boolean).join("\n\n");
  if (plain.trim()) return plain;
  return typeof input.rawInput === "string" ? input.rawInput.trim() : "";
}

function readDraftParagraphsAndClosing(bodyJson: unknown): {
  paragraphs: Array<{ text?: string | null } | string>;
  closing: string;
} {
  if (!bodyJson || typeof bodyJson !== "object") {
    return { paragraphs: [], closing: "" };
  }

  const body = bodyJson as Record<string, unknown>;
  return {
    paragraphs: Array.isArray(body.paragraphs)
      ? (body.paragraphs as Array<{ text?: string | null } | string>)
      : [],
    closing: typeof body.closing === "string" ? body.closing : "",
  };
}

function buildPlainFromArticleBody(input: {
  bodyJson?: unknown;
  rawInput?: string | null;
  lead?: string | null;
}) {
  const { paragraphs, closing } = readDraftParagraphsAndClosing(input.bodyJson);
  return buildPlainFromDraftParts({
    lead: input.lead ?? null,
    paragraphs,
    closing,
    rawInput: input.rawInput ?? null,
  });
}

function readBriefFromBodyJson(bodyJson: unknown): PressBriefSnapshot | null {
  if (!bodyJson || typeof bodyJson !== "object") return null;
  const brief = (bodyJson as Record<string, unknown>).brief;
  if (!brief || typeof brief !== "object") return null;
  const raw = brief as Record<string, unknown>;
  return {
    serviceName:
      typeof raw.serviceName === "string" ? raw.serviceName : "",
    announceType:
      typeof raw.announceType === "string" ? raw.announceType : "",
    oneLiner: typeof raw.oneLiner === "string" ? raw.oneLiner : "",
    points: Array.isArray(raw.points)
      ? raw.points.filter((point): point is string => typeof point === "string")
      : [],
    quoteWho: typeof raw.quoteWho === "string" ? raw.quoteWho : "",
    quoteMessage:
      typeof raw.quoteMessage === "string" ? raw.quoteMessage : "",
    eventAt: typeof raw.eventAt === "string" ? raw.eventAt : "",
    publishAt: typeof raw.publishAt === "string" ? raw.publishAt : "",
    tone: typeof raw.tone === "string" ? raw.tone : "",
  };
}

function buildFallbackHarnessFromArticleSnapshot(article: {
  title: string;
  bodyJson?: unknown;
  rawInput?: string | null;
  refinementQna?: unknown;
  updatedAt?: Date | null;
  pressExtra?: { lead?: string | null; fact?: string | null } | null;
}): PressEditHarness {
  const brief = readBriefFromBodyJson(article.bodyJson);
  const plain = buildPlainFromArticleBody({
    bodyJson: article.bodyJson,
    rawInput: article.rawInput ?? null,
    lead: article.pressExtra?.lead ?? null,
  });
  return createInitialPressEditHarness({
    title: article.title || "제목 미정",
    plain,
    lead: article.pressExtra?.lead ?? null,
    fact: article.pressExtra?.fact ?? null,
    rawInput: article.rawInput ?? null,
    brief,
    styleGuideId: null,
    generatedAt: formatISO(article.updatedAt ?? new Date()),
  });
}

function getOrCreatePressHarness(article: {
  title: string;
  bodyJson?: unknown;
  rawInput?: string | null;
  refinementQna?: unknown;
  updatedAt?: Date | null;
  pressExtra?: { lead?: string | null; fact?: string | null } | null;
}): PressEditHarness {
  return (
    readPressEditHarness(article.refinementQna) ??
    buildFallbackHarnessFromArticleSnapshot(article)
  );
}

function logAiPayload(stage: string, data: any) {
  console.log(`\n🔍 [AI Payload Log: ${stage}] ==============================`);
  if (typeof data === "string") {
    console.log(data);
  } else {
    console.dir(data, { depth: null, colors: true });
  }
  console.log(`==========================================================\n`);
}

// -------------------------
// Types
// -------------------------

type GenerateArticleInput = {
  teamId: string;
  userId: string;
  type?: ArticleType;

  serviceName?: string;
  announceType: string;
  oneLiner?: string;
  points: string[];
  quoteMessage?: string;
  quoteWho?: string;
  tone: "formal" | "neutral" | "friendly";

  rawText?: string;
  eventAt?: string;
  publishAt?: string;

};

export type ArticleResultWithId = ArticleResult & { articleId: string };

export type Paragraph = { id: string; text: string };

export type ArticleBody = {
  title: string;
  lead: string;
  paragraphs: Paragraph[];
  closing: string;
  version: number;
};

type PolishNoteType = "HINT" | "TERM" | "TONE" | "RISK";

type PolishNoteOut = {
  id: string;
  quote: string;
  note: string;
  type: PolishNoteType;
  sourceFactIds?: string[];
};

type SpanOut = {
  id: string;
  start: number;
  end: number;
  note: string;
  type: PolishNoteType;
};

type ReviewResult = {
  title: string;
  plain: string;
  notes: PolishNoteOut[];
  spans: SpanOut[];
  generatedAt: string;
  mode: "REVIEW" | "REWRITTEN";
  polishSessionId: string;
  rePolishCount: number;
  maxRePolishLimit: number | null;
  revisedTitle?: string;
  revisedPlain?: string;
};

export type NormalizedBrief = {
  serviceName: string;
  announceType: string;
  oneLiner?: string;
  points: string[];
  quoteMessage: string;
  eventAt: string;
  publishAt: string;
  quoteWho: string;
};

// -------------------------
// Usage / Billing Logic
// -------------------------

// -------------------------
// Usecases: Initialization & Usage View
// -------------------------

export async function getUsageSummaryUseCase(
  teamId: string,
  articleId?: string,
): Promise<ArticleUsageSummary> {
  const team = await loadPressSubscription(teamId);

  const limits = resolveArticleLimits(team);

  let stat = {
    briefUsed: 0,
    polishUsed: 0,
    lastBriefAt: null as Date | null,
    lastPolishAt: null as Date | null,
  };

  if (articleId) {
    const dbStat = await getArticleUsageStat(articleId);

    stat = {
      briefUsed: dbStat.briefUsed ?? 0,
      polishUsed: dbStat.polishUsed ?? 0,
      lastBriefAt: dbStat.lastBriefAt ?? null,
      lastPolishAt: dbStat.lastPolishAt ?? null,
    };
  }

  return buildArticleUsageSummary({ subscription: team, limits, stat });
}

export async function initArticleDraftUseCase(input: {
  teamId: string;
  userId: string;
  type?: ArticleType;
}): Promise<{ id: string }> {
  const { teamId, userId, type = "PRESS_RELEASE" } = input;

  const created = await prisma.$transaction(async (tx) => {
    const a = await tx.article.create({
      data: {
        teamId,
        userId,
        status: ArticleStatus.DRAFT,
        type,
        title: "제목 미정",
        bodyJson: { paragraphs: [], closing: "" },
        rawInput: null,
        styleGuideId: null,
      },
      select: { id: true, type: true },
    });
    return a;
  });

  return { id: created.id };
}

// -------------------------
// Usecases: Generation (Modified)
// -------------------------

export async function generateArticle(
  input: GenerateArticleInput,
): Promise<ArticleResultWithId> {
  const {
    teamId,
    userId,
    type = "PRESS_RELEASE",
    serviceName,
    announceType,
    oneLiner,
    points,
    quoteMessage,
    quoteWho,
    tone,
    rawText,
    eventAt,
    publishAt,
  } = input;
  const llmResult = await generateArticleWithLLM({
    serviceName,
    announceType,
    oneLiner,
    points,
    quoteMessage,
    quoteWho,
    tone,
    rawText,
    eventAt,
    publishAt,
  });

  const generatedAt = formatISO(new Date());
  const generatedPlain = buildPlainFromDraftParts({
    lead: llmResult.lead ?? null,
    paragraphs: Array.isArray(llmResult.paragraphs)
      ? llmResult.paragraphs
      : [],
    closing: llmResult.closing ?? "",
    rawInput: rawText ?? null,
  });
  const initialHarness = createInitialPressEditHarness({
    title: llmResult.title || "제목 미정",
    plain: generatedPlain,
    lead: llmResult.lead ?? null,
    fact: llmResult.fact ?? null,
    rawInput: rawText ?? null,
    brief: {
      serviceName: serviceName ?? "",
      announceType,
      oneLiner: oneLiner ?? "",
      points: Array.isArray(points) ? points : [],
      quoteWho: quoteWho ?? "",
      quoteMessage: quoteMessage ?? "",
      eventAt: eventAt ?? "",
      publishAt: publishAt ?? "",
      tone,
    },
    styleGuideId: null,
    generatedAt,
  });

  const articleId = await prisma.$transaction(async (tx) => {
    const created = await tx.article.create({
      data: {
        teamId,
        userId,
        status: ArticleStatus.DRAFT,
        type,
        title: llmResult.title || "제목 미정",
        bodyJson: {
          paragraphs: Array.isArray(llmResult.paragraphs)
            ? llmResult.paragraphs
            : [],
          closing: llmResult.closing ?? "",
          brief: {
            serviceName: serviceName ?? "",
            announceType,
            oneLiner: oneLiner ?? "",
            points: Array.isArray(points) ? points : [],
            quoteWho: quoteWho ?? "",
            quoteMessage: quoteMessage ?? "",
            eventAt: eventAt ?? "",
            publishAt: publishAt ?? "",
            tone,
          },
        },
        rawInput: rawText ?? null,
        refinementQna: toPrismaJson(initialHarness),
        styleGuideId: null,
      },
      select: { id: true },
    });

    if (type === "PRESS_RELEASE") {
      await tx.pressExtra.create({
        data: {
          articleId: created.id,
          lead: llmResult.lead ?? null,
          fact: llmResult.fact ?? null,
        },
      });
    }

    return created.id;
  });

  void trackOpsEvent({
    event: "article_generated",
    userId,
    properties: {
      teamId,
      articleId,
      articleType: type,
      announceType,
      hasQuote: !!quoteMessage,
    },
  });

  return {
    ...llmResult,
    articleId,
  };
}

export async function generateArticleIntoExisting(
  articleId: string,
  input: GenerateArticleInput,
): Promise<ArticleResultWithId> {
  const { teamId, userId, type = "PRESS_RELEASE", rawText } = input;

  const team = await loadPressSubscription(teamId);

  await syncBriefUserFacts({
    teamId,
    articleId,
    brief: {
      serviceName: input.serviceName,
      announceType: input.announceType,
      oneLiner: input.oneLiner,
      points: input.points,
      quoteWho: input.quoteWho,
      quoteMessage: input.quoteMessage,
      eventAt: input.eventAt,
      publishAt: input.publishAt,
    },
  });

  const limits = resolveArticleLimits(team);
  const { startUtc, endUtc } = kstTodayUtcRange();

  const dailyCount = await prisma.articleUsageEvent.count({
    where: {
      teamId: team.id,
      type: ArticleUsageType.GENERATE,
      createdAt: { gte: startUtc, lt: endUtc },
    },
  });

  if (!limits.unlimited && dailyCount >= limits.quotaLimit) {
    throwErr(
      "DAILY_GENERATE_LIMIT_EXCEEDED",
      403,
      "오늘 생성 가능한 초안 개수를 모두 소진했습니다.",
    );
  }

  const acceptedFacts = await prisma.articleFact.findMany({
    where: { articleId, teamId, active: true },
    select: { id: true, content: true, excerpt: true },
    orderBy: { createdAt: "asc" },
  });
  const knowledgeContexts = await loadKnowledgeContexts({
    teamId,
    query: [
      input.serviceName,
      input.announceType,
      input.oneLiner,
      input.rawText,
    ]
      .filter(Boolean)
      .join("\n"),
    topK: 8,
  });

  const llmResult = await generateArticleWithLLM({
    serviceName: input.serviceName,
    announceType: input.announceType,
    oneLiner: input.oneLiner,
    points: input.points,
    quoteWho: input.quoteWho,
    quoteMessage: input.quoteMessage,
    tone: input.tone,
    rawText: input.rawText,
    eventAt: input.eventAt,
    publishAt: input.publishAt,
    acceptedFacts: acceptedFacts.map((fact) => ({
      id: fact.id,
      content: fact.content,
      evidence: fact.excerpt ?? undefined,
    })),
    stylePolicy: knowledgeContexts.stylePolicy,
    styleExamples: knowledgeContexts.styleExamples,
  });
  const acceptedFactIds = new Set(acceptedFacts.map(({ id }) => id));
  const usedFactIds = llmResult.usedFactIds ?? [];
  if (usedFactIds.some((id) => !acceptedFactIds.has(id))) {
    throwErr(
      "ARTICLE_GENERATION_UNKNOWN_FACT",
      422,
      "Generation returned an unaccepted fact ID",
    );
  }
  const draftBody = {
    lead: llmResult.lead ?? "",
    fact: llmResult.fact ?? "",
    paragraphs: Array.isArray(llmResult.paragraphs)
      ? llmResult.paragraphs
      : [],
    closing: llmResult.closing ?? "",
  };
  const draftHash = hashArticleContent({
    title: llmResult.title || "제목 미정",
    bodyJson: draftBody,
  });

  const generatedAt = formatISO(new Date());
  const generatedPlain = buildPlainFromDraftParts({
    lead: llmResult.lead ?? null,
    paragraphs: Array.isArray(llmResult.paragraphs)
      ? llmResult.paragraphs
      : [],
    closing: llmResult.closing ?? "",
    rawInput: rawText ?? null,
  });
  const initialHarness = createInitialPressEditHarness({
    title: llmResult.title || "제목 미정",
    plain: generatedPlain,
    lead: llmResult.lead ?? null,
    fact: llmResult.fact ?? null,
    rawInput: rawText ?? null,
    brief: {
      serviceName: input.serviceName ?? "",
      announceType: input.announceType,
      oneLiner: input.oneLiner ?? "",
      points: Array.isArray(input.points) ? input.points : [],
      quoteWho: input.quoteWho ?? "",
      quoteMessage: input.quoteMessage ?? "",
      eventAt: input.eventAt ?? "",
      publishAt: input.publishAt ?? "",
      tone: input.tone,
    },
    styleGuideId: null,
    acceptedFactIds: usedFactIds,
    stylePolicy: knowledgeContexts.stylePolicy,
    styleExamples: knowledgeContexts.styleExamples,
    generatedAt,
  });

  await prisma.$transaction(async (tx) => {
    await assertArticleTeamOrThrow(tx, articleId, teamId);

    await consumeArticleUsageOrThrow(tx, {
      subscription: team,
      articleId,
      userId,
      type: ArticleUsageType.GENERATE,
      meta: { source: "initial_generation" },
    });

    await tx.article.update({
      where: { id: articleId },
      data: {
        userId,
        type,
        status: ArticleStatus.DRAFT,
        title: llmResult.title || "제목 미정",
        bodyJson: {
          paragraphs: Array.isArray(llmResult.paragraphs)
            ? llmResult.paragraphs
            : [],
          closing: llmResult.closing ?? "",
          brief: {
            serviceName: input.serviceName ?? "",
            announceType: input.announceType,
            oneLiner: input.oneLiner ?? "",
            points: Array.isArray(input.points) ? input.points : [],
            quoteWho: input.quoteWho ?? "",
            quoteMessage: input.quoteMessage ?? "",
            eventAt: input.eventAt ?? "",
            publishAt: input.publishAt ?? "",
            tone: input.tone,
          },
        },
        rawInput: rawText ?? null,
        refinementQna: toPrismaJson(initialHarness),
        styleGuideId: null,
      },
    });

    if (type === "PRESS_RELEASE") {
      await tx.pressExtra.upsert({
        where: { articleId },
        create: {
          articleId,
          lead: llmResult.lead ?? null,
          fact: llmResult.fact ?? null,
        },
        update: {
          lead: llmResult.lead ?? null,
          fact: llmResult.fact ?? null,
        },
      });
    }
    if (usedFactIds.length > 0) {
      await tx.articleDraftEvidence.createMany({
        data: usedFactIds.map((factId) => ({
          articleId,
          factId,
          draftHash,
        })),
        skipDuplicates: true,
      });
    }
  });

  return {
    ...llmResult,
    articleId,
  };
}

export async function normalizeBriefUseCase(input: {
  team: { id: string };
  userId: string;
  articleId: string;
  rawText: string;
  tone?: unknown;
  quotaMode?: "simplified";
}): Promise<{
  brief: NormalizedBrief;
  factCandidates: Awaited<
    ReturnType<typeof discoverArticleEvidenceCandidates>
  >;
  usage: ArticleUsageSummary | SimplifiedPressQuotaState;
}> {
  const { team, userId, articleId, rawText } = input;
  const pressSubscription = await loadPressSubscription(team.id);

  if (!rawText || typeof rawText !== "string" || rawText.trim().length === 0) {
    throwErr(
      "BAD_REQUEST",
      400,
      "rawText(대략적인 메모)를 먼저 입력해 주세요.",
    );
  }

  const usageAfter = await prisma.$transaction(async (tx) => {
    await assertArticleTeamOrThrow(tx, articleId, team.id);

    await tx.article.update({
      where: { id: articleId },
      data: {
        rawInput: rawText,
        status: ArticleStatus.BRIEF,
      },
    });

    if (input.quotaMode === "simplified") {
      await tx.articleUsageStat.upsert({
        where: { articleId },
        create: {
          articleId,
          teamId: team.id,
          lastBriefAt: new Date(),
        },
        update: {
          teamId: team.id,
          lastBriefAt: new Date(),
        },
      });

      return consumeSimplifiedPressQuota(tx, {
        teamId: team.id,
        articleId,
        userId,
        action: "brief_normalize",
        eventType: ArticleUsageType.BRIEF,
        meta: { source: "brief_normalize" },
      });
    }

    return consumeArticleUsageOrThrow(tx, {
      subscription: pressSubscription,
      articleId,
      userId,
      type: ArticleUsageType.BRIEF,
      meta: { source: "brief_normalize" },
    });
  });

  const toneSafe = safeTone(input.tone);
  let factCandidates: Awaited<
    ReturnType<typeof discoverArticleEvidenceCandidates>
  > = [];
  try {
    const [knowledge, corpus] = await Promise.all([
      searchKnowledge({
        teamId: team.id,
        query: rawText,
        topK: 6,
        roles: ["FACT"],
      }),
      prisma.team.findUniqueOrThrow({
        where: { id: team.id },
        select: { knowledgeCorpusVersion: true },
      }),
    ]);
    factCandidates = await discoverArticleEvidenceCandidates({
      teamId: team.id,
      articleId,
      query: rawText,
      contentHash: groundingDiscoveryHash(rawText),
      corpusVersion: corpus.knowledgeCorpusVersion,
      hits: knowledge.hits,
    });
  } catch (error) {
    console.warn("[Normalize Brief] knowledge retrieval unavailable", {
      teamId: team.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let brief: NormalizedBrief;
  try {
    brief = await normalizeBriefFromEvidence({
      rawText,
      tone: toneSafe,
      complete: async ({ system, user }) => {
        logAiPayload("Normalize Brief", { system, user });
        const completion = await openai.chat.completions.create({
          model: BRIEF_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) {
          throwErr("LLM_EMPTY_RESULT", 500, "분석 결과가 비어 있습니다.");
        }
        return content;
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "BRIEF_NORMALIZATION_JSON_INVALID"
    ) {
      throwErr("LLM_JSON_PARSE_FAILED", 500, "결과 파싱 실패");
    }
    throw error;
  }

  return { brief, factCandidates, usage: usageAfter };
}

export async function generateFromBriefUseCase(input: {
  teamId: string;
  userId: string;
  articleId: string;
  serviceName?: string;
  announceType: string;
  oneLiner?: string;
  points: string[];
  quoteMessage?: string;
  quoteWho?: string;
  tone: "formal" | "neutral" | "friendly";
  rawText?: string;
  eventAt?: string;
  publishAt?: string;
}): Promise<ArticleResultWithId> {
  const { teamId, userId, articleId } = input;

  const article = await prisma.article.findFirst({
    where: { id: articleId, teamId },
    select: { id: true },
  });
  if (!article) throwErr("ARTICLE_NOT_FOUND", 404, "문서를 찾을 수 없습니다.");

  return generateArticleIntoExisting(articleId, {
    teamId,
    userId,
    type: "PRESS_RELEASE",
    serviceName: input.serviceName,
    announceType: input.announceType,
    oneLiner: input.oneLiner,
    points: input.points,
    quoteWho: input.quoteWho,
    quoteMessage: input.quoteMessage,
    tone: input.tone,
    rawText: input.rawText,
    eventAt: input.eventAt,
    publishAt: input.publishAt,
  });
}

// -------------------------
// Usecases: Editing & Signals
// -------------------------

export async function saveDraftUseCase(input: {
  teamId: string;
  userId: string;
  articleId: string;
  expectedUpdatedAt?: Date;
  patch: {
    title?: string;
    bodyJson?: unknown;
    rawInput?: string | null;
    pressExtra?: { lead?: string | null; fact?: string | null };
    harnessAction?: {
      type: "apply_pending_rewrite";
      appliedAt?: string;
    };
  };
}) {
  const { teamId, articleId, patch } = input;

  const updated = await prisma.$transaction(async (tx) => {
    // 1. 기존 데이터 조회
    const oldArticle = await assertArticleTeamOrThrow(tx, articleId, teamId);
    let oldPressExtra = null;
    if (oldArticle.type === "PRESS_RELEASE") {
      oldPressExtra = await tx.pressExtra.findUnique({
        where: { articleId },
        select: { lead: true, fact: true },
      });
    }

    const nextRefinementQna =
      patch.harnessAction?.type === "apply_pending_rewrite"
        ? toPrismaJson(
            applyPendingRewriteToHarness(
              getOrCreatePressHarness({
                title: oldArticle.title,
                bodyJson: oldArticle.bodyJson,
                rawInput: oldArticle.rawInput,
                refinementQna: oldArticle.refinementQna,
                updatedAt: oldArticle.updatedAt,
                pressExtra: oldPressExtra,
              }),
              patch.harnessAction.appliedAt ?? formatISO(new Date()),
              {
                title:
                  typeof patch.title === "string"
                    ? patch.title
                    : oldArticle.title,
                plain: buildPlainFromArticleBody({
                  bodyJson:
                    patch.bodyJson !== undefined
                      ? patch.bodyJson
                      : oldArticle.bodyJson,
                  rawInput:
                    patch.rawInput !== undefined
                      ? patch.rawInput
                      : oldArticle.rawInput,
                  lead: patch.pressExtra?.lead ?? oldPressExtra?.lead ?? null,
                }),
              },
            ),
          )
        : undefined;

    // 2. 데이터 업데이트
    const article = await tx.article.update({
      where: {
        id: articleId,
        ...(input.expectedUpdatedAt
          ? { updatedAt: input.expectedUpdatedAt }
          : {}),
      },
      data: {
        ...(typeof patch.title === "string" ? { title: patch.title } : {}),
        ...(patch.bodyJson !== undefined
          ? { bodyJson: patch.bodyJson as any }
          : {}),
        ...(patch.rawInput !== undefined ? { rawInput: patch.rawInput } : {}),
        ...(nextRefinementQna !== undefined
          ? { refinementQna: nextRefinementQna }
          : {}),
      },
      select: {
        id: true,
        title: true,
        bodyJson: true,
        rawInput: true,
        refinementQna: true,
        status: true,
        type: true,
        createdAt: true,
        updatedAt: true,
        pressExtra: { select: { lead: true, fact: true } },
      },
    }).catch((error) => {
      if (
        input.expectedUpdatedAt &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throwErr(
          "PRESS_AGENT_ARTICLE_VERSION_CONFLICT",
          409,
          "PRESS_AGENT_ARTICLE_VERSION_CONFLICT",
        );
      }
      throw error;
    });

    if (patch.pressExtra && article.type === "PRESS_RELEASE") {
      await tx.pressExtra.upsert({
        where: { articleId },
        create: {
          articleId,
          lead: patch.pressExtra.lead ?? null,
          fact: patch.pressExtra.fact ?? null,
        },
        update: {
          ...(patch.pressExtra.lead !== undefined
            ? { lead: patch.pressExtra.lead }
            : {}),
          ...(patch.pressExtra.fact !== undefined
            ? { fact: patch.pressExtra.fact }
            : {}),
        },
      });
    }

    return article;
  });

  return updated;
}

export async function updateStatusUseCase(args: {
  teamId: string;
  articleId: string;
  status: ArticleStatus;
}): Promise<{ id: string; articleId: string; status: ArticleStatus }> {
  const { teamId, articleId, status } = args;
  if (status === ArticleStatus.FINAL) {
    const result = await finalizeVerifiedArticle({ articleId, teamId });
    return {
      id: result.article.id,
      articleId: result.article.id,
      status: result.article.status,
    };
  }
  return prisma.$transaction(async (tx) => {
    await assertArticleTeamOrThrow(tx, articleId, teamId);
    const updated = await tx.article.update({
      where: { id: articleId },
      data: { status },
      select: { id: true, status: true },
    });
    return { id: updated.id, articleId: updated.id, status: updated.status };
  });
}

// -------------------------
// Usecases: Polishing & AI Refinement
// -------------------------

export async function reviewUseCase(input: {
  team: { id: string };
  userId: string;
  articleId: string;
  title: string;
  plain: string;
  userInstruction?: string;
  quotaMode?: "simplified";
}): Promise<ReviewResult & { usage: any }> {
  const { team, userId, articleId, title, plain } = input;
  const pressSubscription = await loadPressSubscription(team.id);
  const rewriteLimit = resolvePressRewriteLimit(
    pressSubscription,
    MAX_REPOLISH_LIMIT,
  );
  const reviewRequirement =
    input.userInstruction?.trim() || "특별 요구사항 없음";
  const newSessionId = uuidv4();

  const article = await prisma.article.findFirst({
    where: { id: articleId, teamId: team.id },
    select: {
      title: true,
      bodyJson: true,
      rawInput: true,
      refinementQna: true,
      updatedAt: true,
      pressExtra: { select: { lead: true, fact: true } },
    },
  });
  if (!article) throwErr("ARTICLE_NOT_FOUND", 404, "문서를 찾을 수 없습니다.");

  const harness = getOrCreatePressHarness({
    title: article.title,
    bodyJson: article.bodyJson,
    rawInput: article.rawInput,
    refinementQna: article.refinementQna,
    updatedAt: article.updatedAt,
    pressExtra: article.pressExtra,
  });

  const [acceptedFacts, knowledgeContexts] = await Promise.all([
    prisma.articleFact.findMany({
      where: { articleId, teamId: team.id, active: true },
      select: { id: true, content: true, excerpt: true },
    }),
    loadKnowledgeContexts({
      teamId: team.id,
      query: [title, plain].join("\n"),
      topK: 8,
    }),
  ]);
  const acceptedFactIds = new Set(acceptedFacts.map(({ id }) => id));

  const usageAfter = await prisma.$transaction(async (tx) => {
    await assertArticleTeamOrThrow(tx, articleId, team.id);

    const usage =
      input.quotaMode === "simplified"
        ? await consumeSimplifiedPressQuota(tx, {
            teamId: team.id,
            articleId,
            userId,
            action: "review",
            eventType: ArticleUsageType.POLISH,
            meta: { source: "PRESS_REVIEW_START", sessionId: newSessionId },
          })
        : await consumeArticleUsageOrThrow(tx, {
            subscription: pressSubscription,
            articleId,
            userId,
            type: ArticleUsageType.POLISH,
            meta: { source: "PRESS_REVIEW_START", sessionId: newSessionId },
          });

    await tx.articleUsageStat.upsert({
      where: { articleId },
      create: {
        articleId,
        teamId: team.id,
        polishUsed: input.quotaMode === "simplified" ? 0 : 1,
        rePolishCount: 0,
        polishSessionId: newSessionId,
        lastPolishAt: new Date(),
      },
      update: {
        rePolishCount: 0,
        polishSessionId: newSessionId,
        lastPolishAt: new Date(),
      },
    });

    return usage;
  });

  const systemPrompt = `
너는 보도자료 편집 전문가다. Grounding Context와 현재 초안을 함께 보고 개선이 필요한 구간을 추출하라.

[스타일 가이드 / 원칙]
${knowledgeContexts.stylePolicy || "기본적인 보도자료 작성 원칙을 준수하라."}

[핵심 규칙]
- Locked Facts와 Normalized Brief에 있는 사실을 우선 기준으로 삼아라.
- User Review Requirement가 있으면 그 관점을 우선 반영하되, 확정 사실과 충돌해서는 안 된다.
- 사실 충돌, 과장, 누락 위험이 있으면 우선 지적하라.
- quote는 반드시 입력된 본문(plain)에 그대로 존재하는 텍스트만 사용하라.
- 원문과 수정 결과가 같은 제안, 표현만 되풀이하는 제안, 서로 중복된 제안은 만들지 마라.
- sourceFactIds가 떠오르면 연결하고, 없으면 빈 배열로 두어도 된다.
- 사실 수정(type=RISK)은 반드시 Accepted Facts의 sourceFactIds를 하나 이상 연결하라.
- STYLE_EXAMPLE은 표현 참고일 뿐 사실 근거로 사용할 수 없다.

[출력 형식]
- 반드시 JSON 포맷으로 응답하라.
- notes 배열을 포함해야 한다.
- 각 note는 { "quote": "원문 일부", "note": "수정 제안 및 이유", "type": "유형", "sourceFactIds"?: ["fact_id"] } 형태여야 한다.
- type은 "HINT"(조언), "TERM"(용어), "TONE"(어조), "RISK"(위험) 중 하나다.
- **중요**: "quote"는 반드시 입력된 본문(plain)에 존재하는 텍스트여야 한다. 본문에 없는 텍스트는 인용하지 말 것.
`.trim();

  const reviewGeneratedAt = formatISO(new Date());
  const completion = await openai.chat.completions.create({
    model: POLISH_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `
[Grounding Context]
${buildPressReviewGroundingContext(harness)}

[Accepted Facts]
${acceptedFacts
  .map((fact) => `- [${fact.id}] ${fact.content}\n  Evidence: ${fact.excerpt ?? "user-authored"}`)
  .join("\n") || "- 없음"}

[STYLE_EXAMPLE - non-evidence]
${knowledgeContexts.styleExamples || "- 없음"}

[Current Draft Title]
${title}

[User Review Requirement]
${reviewRequirement}

[Current Draft Plain]
${plain}
        `.trim(),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
  const rawNotes = filterActionableReviewNotes(
    plain,
    Array.isArray(parsed.notes) ? parsed.notes : [],
  );

  const finalNotes: PolishNoteOut[] = [];
  const finalSpans: SpanOut[] = [];

  let searchCursor = 0;

  for (let i = 0; i < rawNotes.length; i++) {
    const raw = rawNotes[i];
    if (!raw.quote || !raw.note) continue;

    let start = plain.indexOf(raw.quote, searchCursor);
    if (start === -1) {
      start = plain.indexOf(raw.quote);
    }

    if (start === -1) continue;

    const end = start + raw.quote.length;
    searchCursor = end;

    const uniqueId = `note_${newSessionId}_${i}`;
    const rawType = String(raw.type);
    const type = ["HINT", "TERM", "TONE", "RISK"].includes(rawType)
      ? (rawType as PolishNoteOut["type"])
      : "HINT";
    const sourceFactIds = Array.isArray(raw.sourceFactIds)
      ? raw.sourceFactIds.filter(
          (value: unknown): value is string =>
            typeof value === "string" && acceptedFactIds.has(value),
        )
      : [];
    if (type === "RISK" && sourceFactIds.length === 0) continue;

    finalNotes.push({
      id: uniqueId,
      quote: raw.quote,
      note: raw.note,
      type: type,
      sourceFactIds,
    });

    finalSpans.push({
      id: uniqueId,
      start,
      end,
      note: raw.note,
      type: type,
    });
  }

  const result: ReviewResult = {
    title,
    plain,
    notes: finalNotes,
    spans: finalSpans,
    generatedAt: reviewGeneratedAt,
    mode: "REVIEW",
    polishSessionId: newSessionId,
    rePolishCount: 0,
    maxRePolishLimit: rewriteLimit,
  };

  const reviewedHarness = mergeReviewIntoHarness(harness, {
    sessionId: newSessionId,
    title,
    plain,
    notes: finalNotes.map<PressHarnessReviewNote>((note) => ({
      id: note.id,
      quote: note.quote,
      note: note.note,
      type: note.type,
      sourceFactIds: note.sourceFactIds ?? [],
    })),
    generatedAt: reviewGeneratedAt,
  });

  await prisma.article.update({
    where: { id: articleId },
    data: {
      lastPolishResult: toPrismaJson(result),
      refinementQna: toPrismaJson(reviewedHarness),
    },
  });

  return { ...result, usage: usageAfter };
}

export async function rePolishUseCase(input: {
  articleId: string;
  teamId: string;
  userId: string;
  selectedNoteIds: string[];
  userInstruction: string;
  quotaMode?: "simplified";
}) {
  const { articleId, teamId, userId, selectedNoteIds, userInstruction } = input;
  const pressSubscription = await loadPressSubscription(teamId);
  const rewriteLimit = resolvePressRewriteLimit(
    pressSubscription,
    MAX_REPOLISH_LIMIT,
  );

  const article = await prisma.article.findFirst({
    where: { id: articleId, teamId },
    select: {
      id: true,
      title: true,
      bodyJson: true,
      rawInput: true,
      refinementQna: true,
      lastPolishResult: true,
      updatedAt: true,
      pressExtra: { select: { lead: true, fact: true } },
    },
  });
  if (!article) throwErr("ARTICLE_NOT_FOUND", 404, "문서를 찾을 수 없습니다.");

  const lastResult = (article?.lastPolishResult || {}) as any;
  const harness = getOrCreatePressHarness({
    title: article.title,
    bodyJson: article.bodyJson,
    rawInput: article.rawInput,
    refinementQna: article.refinementQna,
    updatedAt: article.updatedAt,
    pressExtra: article.pressExtra,
  });
  const currentSessionId =
    typeof lastResult.polishSessionId === "string"
      ? lastResult.polishSessionId
      : harness.review?.sessionId;

  if (!currentSessionId) {
    throwErr("BAD_REQUEST", 400, "활성화된 분석 세션이 없습니다.");
  }

  const [acceptedFacts, knowledgeContexts] = await Promise.all([
    prisma.articleFact.findMany({
      where: { articleId, teamId, active: true },
      select: { id: true, content: true, excerpt: true },
    }),
    loadKnowledgeContexts({
      teamId,
      query: [article.title, article.rawInput].filter(Boolean).join("\n"),
      topK: 8,
    }),
  ]);

  const updateRes = await prisma.$transaction(async (tx) => {
    const result = await tx.articleUsageStat.updateMany({
      where: {
        articleId,
        polishSessionId: currentSessionId,
        ...(rewriteLimit === null
          ? {}
          : { rePolishCount: { lt: rewriteLimit } }),
      },
      data: { rePolishCount: { increment: 1 } },
    });

    if (result.count === 0) {
      return result;
    }

    if (input.quotaMode === "simplified") {
      await consumeSimplifiedPressQuota(tx, {
        teamId,
        articleId,
        userId,
        action: "rewrite",
        eventType: ArticleUsageType.POLISH,
        meta: {
          source: "PRESS_REWRITE",
          sessionId: currentSessionId,
          selectedNoteIds,
        },
      });
    } else {
      await consumeAiQuota({
        client: tx,
        teamId,
        userId,
        targetId: articleId,
        action: "press_rewrite",
        meta: {
          source: "PRESS_REWRITE",
          sessionId: currentSessionId,
          selectedNoteIds,
        },
      });
    }

    return result;
  });

  if (updateRes.count === 0) {
    throwErr(
      "FORBIDDEN",
      403,
      `재작성 한도(${MAX_REPOLISH_LIMIT}회)를 초과했습니다.`,
    );
  }

  try {
    const baseTitle =
      (typeof lastResult.revisedTitle === "string" && lastResult.revisedTitle) ||
      (typeof lastResult.title === "string" && lastResult.title) ||
      harness.review?.baseTitle ||
      article.title;
    const basePlain =
      (typeof lastResult.revisedPlain === "string" && lastResult.revisedPlain) ||
      (typeof lastResult.plain === "string" && lastResult.plain) ||
      harness.review?.basePlain ||
      buildPlainFromArticleBody({
        bodyJson: article.bodyJson,
        rawInput: article.rawInput,
        lead: article.pressExtra?.lead ?? null,
      });

    const availableNotes =
      Array.isArray(lastResult.notes) && lastResult.notes.length > 0
        ? (lastResult.notes as PressHarnessReviewNote[])
        : (harness.review?.notes ?? []);
    const selectedNotes = availableNotes.filter((note) =>
      selectedNoteIds.includes(note.id),
    );
    const promptBundle = buildPressRepolishPromptBundle({
      harness,
      baseTitle,
      basePlain,
      selectedNotes,
      userInstruction,
      stylePrompt: knowledgeContexts.stylePolicy,
      acceptedFacts: acceptedFacts.map((fact) => ({
        id: fact.id,
        content: fact.content,
        evidence: fact.excerpt,
      })),
      styleExamples: knowledgeContexts.styleExamples,
    });

    const completion = await openai.chat.completions.create({
      model: POLISH_MODEL,
      messages: [
        { role: "system", content: promptBundle.systemPrompt },
        { role: "user", content: promptBundle.userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
    const newTitle = parsed.title || baseTitle;
    const newPlain = parsed.plain || basePlain;
    const rewrittenAt = formatISO(new Date());

    const txResult = await prisma.$transaction(async (tx) => {
      const newCount =
        (
          await tx.articleUsageStat.findUnique({
            where: { articleId },
            select: { rePolishCount: true },
          })
        )?.rePolishCount ?? 0;

      const remainingNotes = availableNotes.filter(
        (note) => !selectedNoteIds.includes(note.id),
      );
      const rewrittenResult: ReviewResult = {
        title:
          (typeof lastResult.title === "string" && lastResult.title) ||
          baseTitle,
        plain:
          (typeof lastResult.plain === "string" && lastResult.plain) ||
          basePlain,
        notes: remainingNotes,
        spans: [],
        generatedAt: rewrittenAt,
        mode: "REWRITTEN",
        polishSessionId: currentSessionId,
        rePolishCount: newCount,
        maxRePolishLimit: rewriteLimit === null
          ? null
          : typeof lastResult.maxRePolishLimit === "number"
            ? lastResult.maxRePolishLimit
            : MAX_REPOLISH_LIMIT,
        revisedTitle: newTitle,
        revisedPlain: newPlain,
      };
      const rewrittenHarness = mergePendingRewriteIntoHarness(harness, {
        basedOnSessionId: currentSessionId,
        userInstruction,
        selectedNoteIds: [...selectedNoteIds],
        title: newTitle,
        plain: newPlain,
        generatedAt: rewrittenAt,
      });

      await tx.article.update({
        where: { id: articleId },
        data: {
          lastPolishResult: toPrismaJson(rewrittenResult),
          refinementQna: toPrismaJson(rewrittenHarness),
        },
      });

      return {
        rewrittenResult,
      };
    });

    return txResult.rewrittenResult;
  } catch (error) {
    await prisma.articleUsageStat.update({
      where: { articleId },
      data: { rePolishCount: { decrement: 1 } },
    });
    throw error;
  }
}

// -------------------------
// Usecases: Workflow & Feedback
// -------------------------

export async function requestArticleApproval({
  articleId,
  requesterId,
  targetUserId,
  message,
}: {
  articleId: string;
  requesterId: string;
  targetUserId: string;
  message?: string;
}) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, title: true, teamId: true },
  });

  if (!article)
    throw new ServiceError(
      "ARTICLE_NOT_FOUND",
      404,
      "게시글을 찾을 수 없습니다.",
    );
  if (!article.teamId)
    throw new ServiceError(
      "INVALID_ARTICLE_STATE",
      400,
      "팀 소속 게시글이 아닙니다.",
    );

  await prisma.$transaction(async (tx) => {
    await tx.articleReviewAssignment.upsert({
      where: {
        articleId_reviewerId: {
          articleId: article.id,
          reviewerId: targetUserId,
        },
      },
      create: {
        articleId: article.id,
        teamId: article.teamId!,
        reviewerId: targetUserId,
        assignedById: requesterId,
        status: "PENDING",
        note: message,
      },
      update: {
        assignedById: requesterId,
        status: "PENDING",
        note: message,
        decidedAt: null,
      },
    });

    await tx.notification.create({
      data: {
        type: "LINK",
        userId: targetUserId,
        teamId: article.teamId,
        title: `[검토 요청] ${article.title}`,
        body: message ? `메시지: "${message}"` : `문서 검토가 요청되었습니다.`,
        href: `/press/${articleId}/edit`,
        bannerText: "새로운 검토 요청이 도착했습니다.",
        isActive: true,
      },
    });

    await tx.articleUsageEvent.create({
      data: {
        articleId: article.id,
        teamId: article.teamId,
        userId: requesterId,
        type: "POLISH",
        meta: {
          action: "REQUEST_APPROVAL",
          targetUserId,
          message,
        },
      },
    });
  });

  return true;
}

export async function submitArticleFeedbackUseCase(input: {
  teamId: string;
  userId: string;
  articleId: string;
  vote: "LIKE" | "DISLIKE";
  comment?: string;
}) {
  const { teamId, userId, articleId, vote, comment } = input;

  return prisma.$transaction(async (tx) => {
    return tx.feedback.create({
      data: { teamId, userId, articleId, vote, comment },
    });
  });
}

// -------------------------
// Share / Public Access Usecases
// -------------------------

/**
 * 게시글 공유 상태를 토글합니다.
 * 공유가 처음 켜질 때 shareToken이 없으면 생성합니다.
 */
export async function toggleArticleShareUseCase(input: {
  teamId: string;
  userId: string;
  articleId: string;
  enable: boolean;
}) {
  const { teamId, articleId, enable } = input;

  return prisma.$transaction(async (tx) => {
    const article = await assertArticleTeamOrThrow(tx, articleId, teamId);

    // 이미 토큰이 있으면 유지, 없으면 새로 생성
    let token = article.shareToken;
    if (enable && !token) {
      token = uuidv4().replace(/-/g, "").slice(0, 12); // URL용으로 짧게 잘라서 사용 (선택사항)
    }

    const updated = await tx.article.update({
      where: { id: articleId },
      data: {
        isShared: enable,
        shareToken: token,
      },
      select: { isShared: true, shareToken: true },
    });

    return updated;
  });
}

/**
 * 공유 토큰을 통해 게시글을 조회합니다. (로그인 불필요, Public)
 * isShared가 false이면 조회되지 않아야 합니다.
 */
export async function getSharedArticleByToken(token: string) {
  const article = await prisma.article.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      title: true,
      bodyJson: true,
      rawInput: true,
      isShared: true,
      type: true,
      createdAt: true,
      updatedAt: true,
      pressExtra: {
        select: { lead: true, fact: true },
      },
      // 작성자 정보 등은 필요 시 선택적으로 노출
    },
  });

  if (!article || !article.isShared) {
    throwErr(
      "ARTICLE_NOT_SHARED",
      404,
      "공유되지 않은 문서이거나 존재하지 않습니다.",
    );
  }

  return article;
}
