import OpenAI from "openai";
import type { Prisma } from "@prisma/client";

import {
  aggregateVerificationResult,
  classifyVerificationFinding,
  type VerificationFindingKind,
  type VerificationRiskCategory,
} from "@/domain/article/verificationPolicy";
import { hashArticleContent } from "@/domain/article/articleContentHash";
import { classifyPressVerification, requirePressTransition } from "@/domain/press/pressProcess";
import { prisma } from "@/lib/prisma";
import { loadKnowledgeContexts } from "@/lib/services/knowledge/knowledgeContextService";
import { withLockedPressProcess } from "@/lib/services/press/adapters/pressProcessPrismaAdapter";

export const ARTICLE_VERIFIER_VERSION = "article-verifier-v1";
const VERIFIER_MODEL = process.env.PT_ARTICLE_VERIFIER_MODEL ?? "gpt-4.1-mini";

type SnapshotClient = Pick<
  Prisma.TransactionClient,
  "article"
>;

export async function loadArticleVerificationSnapshot(
  client: SnapshotClient,
  args: { articleId: string; teamId?: string | null },
) {
  const article = await client.article.findFirst({
    where: {
      id: args.articleId,
      ...(args.teamId ? { teamId: args.teamId } : {}),
    },
    select: {
      id: true,
      teamId: true,
      title: true,
      bodyJson: true,
      updatedAt: true,
      pressExtra: { select: { lead: true, fact: true } },
      groundingState: { select: { groundingRevision: true } },
      team: { select: { knowledgeCorpusVersion: true } },
    },
  });
  if (!article) throw new Error("ARTICLE_NOT_FOUND");
  const body =
    article.bodyJson && typeof article.bodyJson === "object"
      ? (article.bodyJson as Record<string, unknown>)
      : {};
  const canonicalBody = {
    lead: article.pressExtra?.lead ?? "",
    fact: article.pressExtra?.fact ?? "",
    paragraphs: Array.isArray(body.paragraphs) ? body.paragraphs : [],
    closing: typeof body.closing === "string" ? body.closing : "",
  };
  return {
    article,
    canonicalBody,
    draftHash: hashArticleContent({
      title: article.title,
      bodyJson: canonicalBody,
    }),
    groundingRevision: article.groundingState?.groundingRevision ?? 0,
    corpusVersion: article.team?.knowledgeCorpusVersion ?? 0,
  };
}

type RawFinding = {
  type?: unknown;
  riskCategory?: unknown;
  factOrigin?: unknown;
  claim?: unknown;
  explanation?: unknown;
  evidenceFactIds?: unknown;
  verifierResult?: unknown;
};

const FINDING_TYPES = new Set([
  "CONTRADICTION",
  "UNSUPPORTED",
  "OMISSION",
  "STYLE_POLICY",
]);
const RISK_CATEGORIES = new Set([
  "NUMBER",
  "PERIOD",
  "DATE",
  "PERSON",
  "TITLE",
  "DIRECT_QUOTE",
  "OTHER",
]);

export function validateVerifierFindings(
  value: unknown,
  acceptedFactIds: ReadonlySet<string>,
) {
  if (!Array.isArray(value)) throw new Error("ARTICLE_VERIFIER_OUTPUT_INVALID");
  return value.map((rawValue) => {
    const raw = rawValue as RawFinding;
    if (
      !FINDING_TYPES.has(String(raw?.type)) ||
      !RISK_CATEGORIES.has(String(raw?.riskCategory)) ||
      typeof raw?.claim !== "string" ||
      typeof raw?.explanation !== "string"
    ) {
      throw new Error("ARTICLE_VERIFIER_OUTPUT_INVALID");
    }
    const evidenceFactIds = Array.isArray(raw.evidenceFactIds)
      ? raw.evidenceFactIds.filter(
          (id: unknown): id is string => typeof id === "string",
        )
      : [];
    if (evidenceFactIds.some((id) => !acceptedFactIds.has(id))) {
      throw new Error("ARTICLE_VERIFIER_EVIDENCE_INVALID");
    }
    const factOrigin =
      raw.factOrigin === "RAG" || raw.factOrigin === "USER"
        ? raw.factOrigin
        : null;
    const result = classifyVerificationFinding({
      kind: raw.type as VerificationFindingKind,
      riskCategory: raw.riskCategory as VerificationRiskCategory,
      factOrigin,
      hasRagEvidence: factOrigin === "RAG" && evidenceFactIds.length > 0,
      verifierResult: raw.verifierResult === "PASS" ? "PASS" : "WARN",
    });
    return {
      type: raw.type as VerificationFindingKind,
      riskCategory: raw.riskCategory as VerificationRiskCategory,
      result,
      claim: raw.claim,
      explanation: raw.explanation,
      evidenceFactIds,
    };
  });
}

export function buildArticleVerifierResponseFormat(
  acceptedFactIds: readonly string[],
) {
  const evidenceIdItems =
    acceptedFactIds.length > 0
      ? { type: "string" as const, enum: [...acceptedFactIds] }
      : { type: "string" as const };
  return {
    type: "json_schema" as const,
    json_schema: {
      name: "article_verification",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          findings: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "CONTRADICTION",
                    "UNSUPPORTED",
                    "OMISSION",
                    "STYLE_POLICY",
                  ],
                },
                riskCategory: {
                  type: "string",
                  enum: [
                    "NUMBER",
                    "PERIOD",
                    "DATE",
                    "PERSON",
                    "TITLE",
                    "DIRECT_QUOTE",
                    "OTHER",
                  ],
                },
                factOrigin: {
                  type: ["string", "null"],
                  enum: ["RAG", "USER", null],
                },
                claim: { type: "string" },
                explanation: { type: "string" },
                evidenceFactIds: {
                  type: "array",
                  items: evidenceIdItems,
                  ...(acceptedFactIds.length === 0 ? { maxItems: 0 } : {}),
                },
                verifierResult: {
                  type: "string",
                  enum: ["PASS", "WARN"],
                },
              },
              required: [
                "type",
                "riskCategory",
                "factOrigin",
                "claim",
                "explanation",
                "evidenceFactIds",
                "verifierResult",
              ],
            },
          },
        },
        required: ["findings"],
      },
    },
  };
}

async function defaultComplete(
  system: string,
  user: string,
  acceptedFactIds: readonly string[] = [],
) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await client.chat.completions.create({
    model: VERIFIER_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: buildArticleVerifierResponseFormat(acceptedFactIds),
    temperature: 0,
  });
  return completion.choices[0]?.message.content ?? "{}";
}

export async function verifyArticle(args: {
  articleId: string;
  teamId?: string | null;
  complete?: (
    system: string,
    user: string,
    acceptedFactIds?: readonly string[],
  ) => Promise<string>;
}) {
  const snapshot = await loadArticleVerificationSnapshot(prisma, args);
  const facts = await prisma.articleFact.findMany({
    where: {
      articleId: args.articleId,
      ...(args.teamId ? { teamId: args.teamId } : {}),
      active: true,
    },
    select: {
      id: true,
      origin: true,
      content: true,
      excerpt: true,
    },
  });
  const contexts = args.teamId
    ? await loadKnowledgeContexts({
        teamId: args.teamId,
        query: [snapshot.article.title, JSON.stringify(snapshot.canonicalBody)].join(
          "\n",
        ),
        topK: 8,
      })
    : { facts: "", stylePolicy: "", styleExamples: "" };
  const system = `
저장된 한국어 보도자료 원고를 정확히 검증하고 JSON {"findings":[...]}만 반환하라.
finding 필드: type CONTRADICTION|UNSUPPORTED|OMISSION|STYLE_POLICY, riskCategory NUMBER|PERIOD|DATE|PERSON|TITLE|DIRECT_QUOTE|OTHER, factOrigin RAG|USER|null, claim, explanation, evidenceFactIds, verifierResult PASS|WARN.
claim과 explanation은 고유명사·수치를 제외하고 반드시 자연스러운 한국어로 작성한다.
acceptedFacts만 사실 근거로 사용한다. STYLE_EXAMPLE은 사실 근거가 아니다.
acceptedFacts의 중요한 수치, 날짜, 인물, 인용, 측정 기준, 집계 방식, 조건 또는 제한사항이 원고에서 빠졌으면 OMISSION으로 보고한다.
근거보다 강한 표현(예: "서울 기반"을 "서울 본사"로 변경)은 UNSUPPORTED로 보고한다.
BLOCK 심각도는 선택하지 말고 결정적 정책이 적용하도록 한다.
  `.trim();
  const user = JSON.stringify({
    draft: {
      title: snapshot.article.title,
      ...snapshot.canonicalBody,
    },
    acceptedFacts: facts,
    stylePolicy: contexts.stylePolicy,
    styleExamples: contexts.styleExamples,
  });
  let parsed: { findings?: unknown };
  try {
    parsed = JSON.parse(
      await (args.complete ?? defaultComplete)(
        system,
        user,
        facts.map(({ id }) => id),
      ),
    ) as { findings?: unknown };
  } catch {
    throw new Error("ARTICLE_VERIFIER_OUTPUT_INVALID");
  }
  const findings = validateVerifierFindings(
    parsed.findings ?? [],
    new Set(facts.map(({ id }) => id)),
  );
  const result = aggregateVerificationResult(
    findings.map((finding) => finding.result),
  );
  return withLockedPressProcess(args, async ({ tx, snapshot: processSnapshot }) => {
    requirePressTransition(processSnapshot.state, {
      type: "RECORD_VERIFICATION",
      result,
      fingerprint: {
        draftHash: snapshot.draftHash,
        groundingRevision: snapshot.groundingRevision,
        corpusVersion: snapshot.corpusVersion,
      },
    });
    return tx.articleVerification.create({
    data: {
      articleId: args.articleId,
      teamId: snapshot.article.teamId,
      draftHash: snapshot.draftHash,
      groundingRevision: snapshot.groundingRevision,
      corpusVersion: snapshot.corpusVersion,
      verifierVersion: ARTICLE_VERIFIER_VERSION,
      modelVersion: VERIFIER_MODEL,
      result,
      findings: {
        create: findings.map((finding) => ({
          type: finding.type,
          riskCategory: finding.riskCategory,
          result: finding.result,
          claim: finding.claim,
          explanation: finding.explanation,
          evidenceFactIds: finding.evidenceFactIds,
        })),
      },
    },
    include: { findings: true },
    });
  });
}

export async function getLatestArticleVerification(args: {
  articleId: string;
  teamId?: string | null;
}) {
  const [snapshot, verification] = await Promise.all([
    loadArticleVerificationSnapshot(prisma, args),
    prisma.articleVerification.findFirst({
      where: {
        articleId: args.articleId,
        ...(args.teamId ? { teamId: args.teamId } : {}),
      },
      include: { findings: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    verification,
    freshness: verification
      ? classifyPressVerification(
          {
            kind: "CURRENT",
            result: verification.result,
            fingerprint: verification,
          },
          {
        draftHash: snapshot.draftHash,
        groundingRevision: snapshot.groundingRevision,
        corpusVersion: snapshot.corpusVersion,
          },
        ).kind
      : "STALE",
  } as const;
}
