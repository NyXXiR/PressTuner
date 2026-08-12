import OpenAI from "openai";
import type { Prisma } from "@prisma/client";

import {
  aggregateVerificationResult,
  classifyVerificationFinding,
  type VerificationFindingKind,
  type VerificationRiskCategory,
} from "@/domain/article/verificationPolicy";
import { hashArticleContent } from "@/domain/article/articleContentHash";
import {
  EVIDENCE_FACT_CONSISTENCY_SOURCE_PREFIX,
  evidenceFactText,
  type EvidenceFactConsistencyEvaluation,
  type NormalizedEvidenceAssertion,
} from "@/domain/article/evidenceFactConsistency";
import { classifyPressVerification, requirePressTransition } from "@/domain/press/pressProcess";
import { prisma } from "@/lib/prisma";
import { loadKnowledgeContexts } from "@/lib/services/knowledge/knowledgeContextService";
import { withLockedPressProcess } from "@/lib/services/press/adapters/pressProcessPrismaAdapter";
import { evaluateTeamEvidenceFactConsistency } from "./evidenceFactConsistencyService";
import { emitArticleVerificationObservability } from "./articleVerificationObservability";

export const ARTICLE_VERIFIER_VERSION = "article-verifier-v2-evidence-fact-consistency";
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

export function selectAutomaticEvidenceAssertions(
  evaluation: EvidenceFactConsistencyEvaluation,
): NormalizedEvidenceAssertion[] {
  const selectedIds = new Set([
    ...evaluation.matchedAssertions.map((item) => item.assertionId),
    ...evaluation.findings.flatMap((item) => item.evidenceAssertionIds),
  ]);
  return evaluation.assertions
    .filter((item) => selectedIds.has(item.assertionId) && item.lineage)
    .sort((a, b) => a.assertionId.localeCompare(b.assertionId));
}

export function buildAutomaticVerificationFindings(
  evaluation: EvidenceFactConsistencyEvaluation,
) {
  return evaluation.findings.map((finding) => ({
    type: "CONTRADICTION" as const,
    riskCategory: "NUMBER" as const,
    result: "BLOCK" as const,
    claim: finding.reasonCode,
    explanation: finding.reasonCode === "SOURCE_CONFLICT"
      ? "현재 팀 지식의 독립된 사실 근거가 서로 충돌합니다. 팀 지식에서 근거 권위를 정리해 주세요."
      : "현재 원고의 수치 주장이 팀 지식의 사실 근거와 일치하지 않습니다.",
    evidenceFactIds: [...finding.evidenceAssertionIds],
  }));
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
  relatedOperationId?: string;
  loadContexts?: typeof loadKnowledgeContexts;
}) {
  const snapshot = await loadArticleVerificationSnapshot(prisma, args);
  const automaticEvaluation = args.teamId
    ? await evaluateTeamEvidenceFactConsistency({
        teamId: args.teamId,
        draftText: evidenceFactText({
          title: snapshot.article.title,
          ...snapshot.canonicalBody,
        }),
      })
    : null;
  const automaticAssertions = automaticEvaluation
    ? selectAutomaticEvidenceAssertions(automaticEvaluation)
    : [];
  const facts = await prisma.articleFact.findMany({
    where: {
      articleId: args.articleId,
      ...(args.teamId ? { teamId: args.teamId } : {}),
      active: true,
      NOT: { sourceKey: { startsWith: EVIDENCE_FACT_CONSISTENCY_SOURCE_PREFIX } },
    },
    select: {
      id: true,
      origin: true,
      content: true,
      excerpt: true,
    },
  });
  const acceptedFacts = [
    ...facts,
    ...automaticAssertions.map((assertion) => ({
      id: assertion.assertionId,
      origin: "RAG" as const,
      content: assertion.lineage!.excerpt,
      excerpt: assertion.lineage!.excerpt,
    })),
  ];
  const contexts = args.teamId
    ? await (args.loadContexts ?? loadKnowledgeContexts)({
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
    acceptedFacts,
    stylePolicy: contexts.stylePolicy,
    styleExamples: contexts.styleExamples,
  });
  let parsed: { findings?: unknown };
  try {
    parsed = JSON.parse(
      await (args.complete ?? defaultComplete)(
        system,
        user,
        acceptedFacts.map(({ id }) => id),
      ),
    ) as { findings?: unknown };
  } catch {
    throw new Error("ARTICLE_VERIFIER_OUTPUT_INVALID");
  }
  const findings = validateVerifierFindings(
    parsed.findings ?? [],
    new Set(acceptedFacts.map(({ id }) => id)),
  );
  const mergedFindings = [
    ...(automaticEvaluation
      ? buildAutomaticVerificationFindings(automaticEvaluation)
      : []),
    ...findings,
  ];
  const result = aggregateVerificationResult(
    mergedFindings.map((finding) => finding.result),
  );
  const verification = await withLockedPressProcess(args, async ({ tx, snapshot: processSnapshot }) => {
    const current = await loadArticleVerificationSnapshot(tx, args);
    if (
      current.draftHash !== snapshot.draftHash ||
      current.groundingRevision !== snapshot.groundingRevision ||
      current.corpusVersion !== snapshot.corpusVersion
    ) {
      throw new Error("ARTICLE_VERIFICATION_SNAPSHOT_STALE");
    }
    requirePressTransition(processSnapshot.state, {
      type: "RECORD_VERIFICATION",
      result,
      fingerprint: {
        draftHash: snapshot.draftHash,
        groundingRevision: snapshot.groundingRevision,
        corpusVersion: snapshot.corpusVersion,
      },
    });
    const automaticFactIds = new Map<string, string>();
    if (args.teamId && automaticEvaluation) {
      const activeSourceKeys: string[] = [];
      for (const assertion of automaticAssertions) {
        const lineage = assertion.lineage!;
        const sourceKey = `${EVIDENCE_FACT_CONSISTENCY_SOURCE_PREFIX}${assertion.assertionId.slice(4)}`;
        activeSourceKeys.push(sourceKey);
        const fact = await tx.articleFact.upsert({
          where: {
            articleId_sourceKey: { articleId: args.articleId, sourceKey },
          },
          update: {
            active: true,
            content: lineage.excerpt,
            documentId: lineage.documentId,
            chunkId: lineage.chunkId,
            pageStart: lineage.pageStart,
            pageEnd: lineage.pageEnd,
            excerpt: lineage.excerpt,
          },
          create: {
            articleId: args.articleId,
            teamId: args.teamId,
            origin: "RAG",
            sourceKey,
            content: lineage.excerpt,
            active: true,
            documentId: lineage.documentId,
            chunkId: lineage.chunkId,
            pageStart: lineage.pageStart,
            pageEnd: lineage.pageEnd,
            excerpt: lineage.excerpt,
          },
          select: { id: true },
        });
        automaticFactIds.set(assertion.assertionId, fact.id);
      }
      await tx.articleFact.updateMany({
        where: {
          articleId: args.articleId,
          sourceKey: { startsWith: EVIDENCE_FACT_CONSISTENCY_SOURCE_PREFIX },
          ...(activeSourceKeys.length > 0
            ? { NOT: { sourceKey: { in: activeSourceKeys } } }
            : {}),
          active: true,
        },
        data: { active: false },
      });
      const matchedFactIds = automaticEvaluation.matchedAssertions.flatMap((item) => {
        const id = automaticFactIds.get(item.assertionId);
        return id ? [id] : [];
      });
      if (matchedFactIds.length > 0) {
        await tx.articleDraftEvidence.createMany({
          data: [...new Set(matchedFactIds)].map((factId) => ({
            articleId: args.articleId,
            factId,
            draftHash: snapshot.draftHash,
          })),
          skipDuplicates: true,
        });
      }
    }
    const persistedFindings = mergedFindings.map((finding) => ({
      ...finding,
      evidenceFactIds: finding.evidenceFactIds.map(
        (id) => automaticFactIds.get(id) ?? id,
      ),
    }));
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
        create: persistedFindings.map((finding) => ({
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
  if (args.teamId && automaticEvaluation) {
    await emitArticleVerificationObservability({
      teamId: args.teamId,
      verdict: automaticEvaluation.verdict,
      relatedOperationId: args.relatedOperationId,
    });
  }
  return verification;
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
