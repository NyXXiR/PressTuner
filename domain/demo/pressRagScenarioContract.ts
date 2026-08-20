import { z } from "zod";

import {
  pressCreationProcess,
  type PressAiProcessDefinition,
} from "@/domain/press-ai-debugger/processRegistry";
import { CheckpointAttemptSchema } from "@/lib/pressAiProcessDebuggerClient";

export const PUBLIC_PRESS_RAG_LIMITS = Object.freeze({
  starts: 3,
  windowSeconds: 600,
  capabilityTtlSeconds: 900,
  commandBudget: 15,
  bodyBytes: 64 * 1024,
  capabilityBytes: 48 * 1024,
});

export const PUBLIC_PRESS_RAG_COOKIE = "pt_public_press_rag_demo";
export const FIXED_EVIDENCE_GUARDRAIL_ID = "fixed-evidence-claim-support-v1";

const evidenceText = [
  "MonoLab은 팀 협업 서비스 Bridge를 2026-09-18에 출시한다.",
  "Bridge 베타 설문은 참여자 120명을 대상으로 진행됐고 만족도는 92%였다.",
  "Bridge는 실시간 공동 편집과 승인 워크플로 기능을 제공한다.",
  "Bridge는 2026년 매출 200억원을 기록했다.",
].join("\n");

export const PUBLIC_PRESS_RAG_EVIDENCE = Object.freeze({
  id: "DOC-MONOLAB-BRIDGE-001",
  sourceVersion: 1,
  chunkId: "CHUNK-MONOLAB-BRIDGE-REVENUE-001",
  pageStart: 1,
  pageEnd: 1,
  assetUrl: "/samples/press-ai-debugger/evidence-fact-consistency.pdf#page=1",
  title: "MonoLab Bridge 출시 팩트시트",
  text: evidenceText,
  facts: Object.freeze([
    Object.freeze({
      id: "FACT-BRIDGE-LAUNCH",
      excerpt: "MonoLab은 팀 협업 서비스 Bridge를 2026-09-18에 출시한다.",
    }),
    Object.freeze({
      id: "FACT-BRIDGE-BETA",
      excerpt: "Bridge 베타 설문은 참여자 120명을 대상으로 진행됐고 만족도는 92%였다.",
    }),
    Object.freeze({
      id: "FACT-BRIDGE-FEATURES",
      excerpt: "Bridge는 실시간 공동 편집과 승인 워크플로 기능을 제공한다.",
    }),
    Object.freeze({
      id: "FACT-BRIDGE-REVENUE-2026",
      excerpt: "Bridge는 2026년 매출 200억원을 기록했다.",
    }),
  ]),
});

export const PUBLIC_PRESS_RAG_GUIDED_MEMO =
  "MonoLab은 팀 협업 서비스 Bridge를 2026-09-18에 출시합니다. Bridge 베타 설문은 참여자 120명 대상이며 만족도는 92%입니다. 실시간 공동 편집과 승인 워크플로를 제공합니다. Bridge는 2026년 매출 360억원을 기록했습니다.";

const canonicalNodes = pressCreationProcess.nodes.map((node) => ({ ...node }));
const canonicalEdges = pressCreationProcess.edges.map((edge) =>
  edge.id === "brief-draft"
    ? {
        ...edge,
        mandatoryGuardrailIds: Object.freeze([
          ...edge.mandatoryGuardrailIds,
          FIXED_EVIDENCE_GUARDRAIL_ID,
        ]),
      }
    : { ...edge },
);

export const publicPressRagScenarioProcess = Object.freeze({
  ...pressCreationProcess,
  version: "2.1.0-public-rag-demo",
  label: "공개 RAG 보도자료 시나리오",
  nodes: Object.freeze(canonicalNodes),
  edges: Object.freeze([
    ...canonicalEdges.slice(0, 3),
    Object.freeze({
      id: "review-repeat",
      sequence: 3,
      source: "draft-review",
      target: "draft-review",
      payload: Object.freeze(["articleId", "title", "plain", "reviewInstruction"]),
      mandatoryGuardrailIds: Object.freeze([]),
    }),
    Object.freeze({ ...canonicalEdges[3], sequence: 4 }),
  ]),
} satisfies PressAiProcessDefinition);

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const memoText = boundedText(6000).refine(
  (value) => value.split(/(?<=[.!?。])\s+/u).filter(Boolean).length <= 12,
  "memo must contain at most 12 atomic claims",
);
export const PressRagToneSchema = z.enum(["formal", "neutral", "friendly"]);

export const PressRagStartRequestSchema = z
  .object({ memo: memoText, tone: PressRagToneSchema })
  .strict();

const ExecuteNodeCommandSchema = z
  .object({
    type: z.literal("execute_node"),
    capability: boundedText(PUBLIC_PRESS_RAG_LIMITS.capabilityBytes),
    expectedRevision: z.number().int().nonnegative(),
    correctedMemo: memoText.optional(),
    reviewInstruction: z.string().trim().max(1000).optional(),
    selectedNoteIds: z.array(boundedText(120)).min(1).max(8).optional(),
    rewriteInstruction: z.string().trim().max(1000).optional(),
  })
  .strict();
const AdvanceEdgeCommandSchema = z
  .object({
    type: z.literal("advance_edge"),
    capability: boundedText(PUBLIC_PRESS_RAG_LIMITS.capabilityBytes),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
const RetryCommandSchema = z
  .object({
    type: z.literal("retry_from_block"),
    capability: boundedText(PUBLIC_PRESS_RAG_LIMITS.capabilityBytes),
    expectedRevision: z.number().int().nonnegative(),
    correctedMemo: memoText,
  })
  .strict();

export const PressRagCommandRequestSchema = z.discriminatedUnion("type", [
  ExecuteNodeCommandSchema,
  AdvanceEdgeCommandSchema,
  RetryCommandSchema,
]);

export const PressRagCitationSchema = z
  .object({
    sourceDocumentId: boundedText(120),
    factId: boundedText(120),
    evidenceExcerpt: boundedText(1000),
  })
  .strict();
export const PressRagNormalizedClaimSchema = z
  .object({ claim: boundedText(1000), citation: PressRagCitationSchema.nullable() })
  .strict();
export const PressRagNormalizationOutputSchema = z
  .object({
    serviceName: boundedText(200),
    announceType: boundedText(200),
    oneLiner: boundedText(1000),
    points: z.array(boundedText(1000)).min(1).max(12),
    tone: PressRagToneSchema,
    rawText: boundedText(6000),
    claims: z.array(PressRagNormalizedClaimSchema).min(1).max(16),
  })
  .strict();
export const PressRagDraftOutputSchema = z
  .object({ title: boundedText(300), plain: boundedText(8000), lead: z.string().max(2000).optional() })
  .strict();
export const PressRagReviewOutputSchema = z
  .object({
    notes: z
      .array(z.object({ id: boundedText(120), message: boundedText(1000) }).strict())
      .min(1)
      .max(8),
  })
  .strict();
export const PressRagRewriteOutputSchema = z
  .object({ title: boundedText(300), plain: boundedText(8000) })
  .strict();

export type PressRagStartRequest = z.infer<typeof PressRagStartRequestSchema>;
export type PressRagCommandRequest = z.infer<typeof PressRagCommandRequestSchema>;
export type PressRagNormalizationOutput = z.infer<typeof PressRagNormalizationOutputSchema>;

export type PublicPressRagAttempt = {
  id: string;
  processId: "press-creation";
  processVersion: string;
  registryHash: string;
  executorVersion: string;
  status: "ACTIVE" | "INSPECTING" | "COMPLETED" | "BLOCKED" | "FAILED";
  revision: number;
  articleId: string;
  activeNodeId: string | null;
  startNodeId: string;
  createdAt: string;
  completedAt: string | null;
  parentAttemptId: string | null;
  inputSnapshot: {
    articleId: string;
    rawText: string;
    tone: z.infer<typeof PressRagToneSchema>;
    reviewInstruction: string;
    rewriteInstruction: string;
  };
  checkpoints: Array<{
    id: string;
    nodeId: string;
    sequence: number;
    mode: "EXECUTED" | "RESTORED";
    input: unknown;
    output: unknown;
    quotaUnits: number;
  }>;
  transitions: Array<{
    id: string;
    edgeId: string;
    sequence: number;
    sourceNodeId: string;
    sourceCheckpointId?: string;
    targetNodeId: string;
    targetPayload: unknown;
    verdict: "PASS" | "WARN" | "BLOCK";
    warnAcknowledgedAt: string | null;
    humanGateAcknowledgedAt: string | null;
    advancedAt: string | null;
    observations: Array<{
      id: string;
      guardrailId: string;
      origin: "MANDATORY" | "CASE_EXPECTATION";
      expected: string;
      observed: string;
      reason: string;
      evidence: unknown;
      verdict: "PASS" | "WARN" | "BLOCK";
      displayOrder: number;
    }>;
  }>;
};

export type PublicPressRagScenario = {
  runId: string;
  attempt: PublicPressRagAttempt;
  attempts: PublicPressRagAttempt[];
  capability: string;
  evidence: typeof PUBLIC_PRESS_RAG_EVIDENCE;
  quota: { remainingStarts: number; retryAfterSeconds: number };
  limits: typeof PUBLIC_PRESS_RAG_LIMITS;
  commandsRemaining: number;
};

const PublicEvidenceSchema = z.object({
  id: z.literal(PUBLIC_PRESS_RAG_EVIDENCE.id),
  sourceVersion: z.literal(PUBLIC_PRESS_RAG_EVIDENCE.sourceVersion),
  chunkId: z.literal(PUBLIC_PRESS_RAG_EVIDENCE.chunkId),
  pageStart: z.literal(PUBLIC_PRESS_RAG_EVIDENCE.pageStart),
  pageEnd: z.literal(PUBLIC_PRESS_RAG_EVIDENCE.pageEnd),
  assetUrl: z.literal(PUBLIC_PRESS_RAG_EVIDENCE.assetUrl),
  title: z.string(),
  text: z.string(),
  facts: z.array(z.object({ id: z.string(), excerpt: z.string() }).strict()),
}).strict();
export const PublicPressRagScenarioSchema = z.object({
  runId: z.string().min(1),
  attempt: CheckpointAttemptSchema,
  attempts: z.array(CheckpointAttemptSchema).min(1).max(8),
  capability: z.string().min(1).max(PUBLIC_PRESS_RAG_LIMITS.capabilityBytes),
  evidence: PublicEvidenceSchema,
  quota: z.object({
    remainingStarts: z.number().int().min(0).max(PUBLIC_PRESS_RAG_LIMITS.starts),
    retryAfterSeconds: z.number().int().nonnegative(),
  }).strict(),
  limits: z.object({
    starts: z.literal(PUBLIC_PRESS_RAG_LIMITS.starts),
    windowSeconds: z.literal(PUBLIC_PRESS_RAG_LIMITS.windowSeconds),
    capabilityTtlSeconds: z.literal(PUBLIC_PRESS_RAG_LIMITS.capabilityTtlSeconds),
    commandBudget: z.literal(PUBLIC_PRESS_RAG_LIMITS.commandBudget),
    bodyBytes: z.literal(PUBLIC_PRESS_RAG_LIMITS.bodyBytes),
    capabilityBytes: z.literal(PUBLIC_PRESS_RAG_LIMITS.capabilityBytes),
  }).strict(),
  commandsRemaining: z.number().int().min(0).max(PUBLIC_PRESS_RAG_LIMITS.commandBudget),
}).strict();

const semanticTokenPattern = /\d{4}-\d{2}-\d{2}|\d+(?:\.\d+)?%?|1위|최초|유일|최대|최고|점유율/gu;

export function verifyNormalizedClaims(output: PressRagNormalizationOutput) {
  const unsupported: Array<{ claim: string; reason: string }> = [];
  const checkedFactIds = new Set<string>();
  const facts = new Map<string, (typeof PUBLIC_PRESS_RAG_EVIDENCE.facts)[number]>(
    PUBLIC_PRESS_RAG_EVIDENCE.facts.map((fact) => [fact.id, fact]),
  );

  for (const item of output.claims) {
    const citation = item.citation;
    if (!citation) {
      unsupported.push({ claim: item.claim, reason: "고정 근거 문서에 연결된 인용이 없습니다." });
      continue;
    }
    const fact = facts.get(citation.factId);
    if (
      citation.sourceDocumentId !== PUBLIC_PRESS_RAG_EVIDENCE.id ||
      !fact ||
      citation.evidenceExcerpt !== fact.excerpt ||
      !PUBLIC_PRESS_RAG_EVIDENCE.text.includes(citation.evidenceExcerpt)
    ) {
      unsupported.push({ claim: item.claim, reason: "문서·팩트 ID 또는 정확한 근거 발췌가 일치하지 않습니다." });
      continue;
    }
    checkedFactIds.add(fact.id);
    if (fact.id === "FACT-BRIDGE-REVENUE-2026" && /2026\s*년\s*매출/u.test(item.claim)) {
      // This controlled value is intentionally delegated to the shared draft guardrail.
      continue;
    }
    const tokens = item.claim.match(semanticTokenPattern) ?? [];
    const missing = tokens.filter((token) => !fact.excerpt.includes(token));
    if (missing.length) {
      unsupported.push({ claim: item.claim, reason: `근거에 없는 수치·순위 표현: ${missing.join(", ")}` });
    }
  }

  return {
    verdict: unsupported.length ? ("BLOCK" as const) : ("PASS" as const),
    guardrailId: FIXED_EVIDENCE_GUARDRAIL_ID,
    expected: "모든 정규화 주장은 표시된 문서의 유효한 fact ID와 정확한 발췌로 뒷받침되어야 합니다.",
    observed: unsupported.length
      ? `미지원 주장 ${unsupported.length}개: ${unsupported.map((item) => item.claim).join(" | ")}`
      : `모든 주장 ${output.claims.length}개가 고정 근거로 확인되었습니다.`,
    reason: unsupported.length
      ? "표시된 고정 문서에서 확인할 수 없는 주장이 있어 초안 전이를 차단했습니다."
      : "모든 주장이 표시된 고정 문서와 일치합니다.",
    evidence: {
      sourceDocument: PUBLIC_PRESS_RAG_EVIDENCE,
      unsupportedClaims: unsupported,
      checkedFactIds: [...checkedFactIds],
    },
  };
}

export function mountControlledRevenueCitation(
  output: PressRagNormalizationOutput,
): PressRagNormalizationOutput {
  const fact = PUBLIC_PRESS_RAG_EVIDENCE.facts.find((item) => item.id === "FACT-BRIDGE-REVENUE-2026")!;
  return {
    ...output,
    claims: output.claims.map((item) => /2026\s*년\s*매출/u.test(item.claim)
      ? { ...item, citation: { sourceDocumentId: PUBLIC_PRESS_RAG_EVIDENCE.id, factId: fact.id, evidenceExcerpt: fact.excerpt } }
      : item),
  };
}

export function ensureMemoClaimsEnumerated(
  memo: string,
  output: PressRagNormalizationOutput,
): PressRagNormalizationOutput {
  const memoClaims = memo
    .split(/(?<=[.!?。])\s+/u)
    .map((claim) => claim.trim())
    .filter(Boolean);
  const remaining = output.claims.map((item, index) => ({ item, index }));
  const wordSet = (value: string) => new Set(
    value
      .toLocaleLowerCase("ko-KR")
      .replace(/[^\p{L}\p{N}%_-]+/gu, " ")
      .split(/\s+/u)
      .filter((word) => word.length > 1),
  );
  const similarity = (left: string, right: string) => {
    const leftSemantic = left.match(semanticTokenPattern) ?? [];
    const rightSemantic = new Set(right.match(semanticTokenPattern) ?? []);
    if (leftSemantic.length && leftSemantic.every((token) => rightSemantic.has(token))) {
      return 1;
    }
    const leftWords = wordSet(left);
    const rightWords = wordSet(right);
    if (!leftWords.size || !rightWords.size) return 0;
    const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
    return intersection / Math.min(leftWords.size, rightWords.size);
  };
  const enumerated = memoClaims.map((claim) => {
    const exactIndex = remaining.findIndex(({ item }) => item.claim.trim() === claim);
    let matchIndex = exactIndex;
    if (matchIndex < 0) {
      let bestScore = 0;
      remaining.forEach(({ item }, index) => {
        const score = similarity(claim, item.claim);
        if (score > bestScore) {
          bestScore = score;
          matchIndex = index;
        }
      });
      if (bestScore < 0.25) matchIndex = -1;
    }
    if (matchIndex < 0) return { claim, citation: null };
    const [{ item }] = remaining.splice(matchIndex, 1);
    return { claim, citation: item.citation };
  });
  return {
    ...output,
    rawText: memo,
    claims: [
      ...enumerated,
      ...remaining.map(({ item }) => item),
    ],
  };
}
