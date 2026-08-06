import {
  Agent,
  AgentsError,
  Runner,
  RunState,
  tool,
  withTrace,
  type RunToolApprovalItem,
} from "@openai/agents";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { buildPressAgentInstructions } from "@/domain/press-agent/instructions";
import {
  verifyAgentAnswerClaimSpans,
  verifyDraftClaimSpans,
} from "@/domain/press-agent/claimSpanVerification";
import { sanitizePostgresJson } from "@/domain/press-agent/postgresJson";
import { buildExtractiveVerificationFallback } from "@/domain/press-agent/extractiveFallback";
import type { PressKnowledgeRetrievalConfiguration } from "@/domain/knowledge/retrievalRuntime";
import type { PressAgentRagDebuggerDocumentSnapshot, PressAgentRagDebuggerPromptPresetId } from "@/domain/evaluation/pressAgentRagDebugger";
import { extractExplicitKnowledgeIdentifiers } from "@/domain/knowledge/retrievalPipeline";
import {
  decryptPressAgentCheckpoint,
  encryptPressAgentCheckpoint,
} from "@/domain/press-agent/checkpointCrypto";
import {
  assertPressAgentArticleVersion,
  assertAppliedDraftMatchesVerified,
  assertFinalSourceIds,
  buildAgentStepIdempotencyKey,
  buildAgentMutationIdempotencyKey,
  hashVerifiedAgentDraft,
  readPressAgentArticleVersion,
  restorePressAgentCheckpoint,
  transitionPressAgentRun,
  type PressAgentToolName,
  type PressAgentRunStatus,
} from "@/domain/press-agent/runPolicy";
import { assertAgentCompletion } from "@/domain/press-agent/completionVerification";
import { assertAdversarialInput } from "@/domain/press-agent/adversarialPolicy";
import {
  assertRuntimeBudget,
  composeAbortSignal,
  DEFAULT_PRESS_AGENT_RUNTIME_POLICY,
  pressAgentRuntimePolicySchema,
} from "@/domain/press-agent/runtimePolicy";
import { assertToolPolicy, PRESS_AGENT_TOOL_POLICIES } from "@/domain/press-agent/toolPolicy";
import { classifyAgentFailure } from "@/domain/evaluation/failureTaxonomy";
import {
  estimateAgentCostMicros,
  extractCachedInputTokens,
  normalizeAgentError,
} from "@/domain/press-agent/usage";
import { prisma } from "@/lib/prisma";
import {
  assertPressArticleEditAccess,
  saveArticleDraft,
} from "@/lib/services/press/pressService";
import { searchKnowledgeAndPersistAgentCitations } from "@/lib/services/knowledge/agentKnowledgeCitationService";
import { persistFinalAgentCitations } from "@/lib/services/knowledge/agentKnowledgeEvidenceService";
import {
  beginOpsConsoleOperation,
  completeOpsConsoleOperation,
  reportOpsConsoleGuardrails,
  PRESS_AGENT_WORKFLOW_ID,
  readOpsConsoleOperationEnvironment,
  type OpsConsoleOperationResult,
} from "@/lib/services/operations/opsConsoleOperationClient";
import {
  buildPressAgentCompletionObservation,
  deriveGuardrailVerdicts,
  type PressAgentGuardrailObservation,
} from "@/domain/evaluation/pressAgentGuardrailSignals";
import { derivePressAgentRagFeedback } from "@/domain/evaluation/pressAgentRagFeedbackCriteria";
import {
  recordLangSmithRagObservation,
  reportLangSmithRootFeedback,
  traceLangSmithOperation,
  traceLangSmithRagStage,
} from "@/lib/services/operations/langSmithOperationTracer";
import {
  PRESS_AGENT_V1_VERSION,
  restorePressAgentV1Checkpoint,
} from "./pressAgentV1Runtime";
import {
  hasPressAgentWorkflowObserver,
  persistPressAgentCancellationWorkflow,
  persistPressAgentWorkflowEvent as persistDurablePressAgentWorkflowEvent,
  type PressAgentWorkflowStreamObserver,
  withPressAgentWorkflowObserver,
} from "./pressAgentWorkflowEventService";

async function persistPressAgentWorkflowEvent(args: Parameters<typeof persistDurablePressAgentWorkflowEvent>[0]) {
  if (!hasPressAgentWorkflowObserver()) return null;
  return persistDurablePressAgentWorkflowEvent(args);
}

export const PRESS_AGENT_VERSION = "press-agent-v2";
export const PRESS_AGENT_MODEL =
  process.env.PT_PRESS_AGENT_MODEL ?? "gpt-4.1-mini";
const OPERATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRESS_AGENT_TOKEN_RATES = {
  inputUsdPerMillion: Number(
    process.env.PT_PRESS_AGENT_INPUT_USD_PER_MILLION ?? 0.4,
  ),
  cachedInputUsdPerMillion: Number(
    process.env.PT_PRESS_AGENT_CACHED_INPUT_USD_PER_MILLION ?? 0.1,
  ),
  outputUsdPerMillion: Number(
    process.env.PT_PRESS_AGENT_OUTPUT_USD_PER_MILLION ?? 1.6,
  ),
};

type PressAgentContext = {
  runId: string;
  teamId: string;
  userId: string;
  articleId: string | null;
  articleUpdatedAt: string | null;
  retrievalConfigurationId: PressKnowledgeRetrievalConfiguration["id"];
  selectedDocumentIds: string[] | undefined;
};

function requirePressAgentContext(runContext: unknown): PressAgentContext {
  const context = (runContext as { context?: Partial<PressAgentContext> } | undefined)
    ?.context;
  if (
    !context ||
    typeof context.runId !== "string" ||
    typeof context.teamId !== "string" ||
    typeof context.userId !== "string"
  ) {
    throw new Error("PRESS_AGENT_CONTEXT_MISSING");
  }
  return {
    runId: context.runId,
    teamId: context.teamId,
    userId: context.userId,
    articleId: typeof context.articleId === "string" ? context.articleId : null,
    articleUpdatedAt:
      typeof context.articleUpdatedAt === "string"
        ? context.articleUpdatedAt
        : null,
    retrievalConfigurationId:
      context.retrievalConfigurationId ?? "baseline-v1",
    selectedDocumentIds: Array.isArray(context.selectedDocumentIds)
      ? context.selectedDocumentIds.filter((id): id is string => typeof id === "string")
      : undefined,
  };
}

const AgentOutputSchema = z.object({
  summary: z.string(),
  answer: z.string(),
  sourceIds: z.array(z.string()),
  cannotAnswer: z.boolean(),
  claims: z.array(
    z.object({
      id: z.string().min(1),
      text: z.string().min(1),
      evidence: z.array(
        z.object({ sourceId: z.string().min(1), quote: z.string().min(1) }),
      ).min(1),
    }),
  ),
});

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return sanitizePostgresJson(value) as Prisma.InputJsonValue;
}

export function readPressAgentOperationId(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const operationId = (input as Record<string, unknown>).operationId;
  return typeof operationId === "string" && OPERATION_ID_PATTERN.test(operationId)
    ? operationId
    : null;
}

async function recordOperationTelemetryFailure(args: {
  teamId: string;
  runId: string;
  phase: "BEGIN" | "COMPLETE" | "GUARDRAILS";
  result: OpsConsoleOperationResult;
}) {
  if (args.result.status !== "failed") return;
  try {
    await prisma.agentRuntimeAuditEvent.create({
      data: {
        teamId: args.teamId,
        runId: args.runId,
        eventType: "OBSERVABILITY_DELIVERY_FAILED",
        details: { phase: args.phase, errorCode: args.result.code },
      },
    });
  } catch {
    // Observability audit failures must not replace the Agent result.
  }
}

async function completePressAgentOperation(args: {
  teamId: string;
  runId: string;
  operationId: string | null;
  completedAt?: Date;
  guardrails?: PressAgentGuardrailObservation;
}) {
  if (!args.operationId) return;

  // Guardrail verdicts are reported before completion so the operation is never marked
  // finished with its attribution missing. Telemetry never changes the Agent result.
  if (args.guardrails) {
    try {
      const verdicts = deriveGuardrailVerdicts(args.guardrails);
      await reportLangSmithRootFeedback(derivePressAgentRagFeedback(verdicts));
      const guardrailResult = await reportOpsConsoleGuardrails({
        operationId: args.operationId,
        verdicts,
      });
      await recordOperationTelemetryFailure({
        teamId: args.teamId,
        runId: args.runId,
        phase: "GUARDRAILS",
        result: guardrailResult,
      });
    } catch {
      // A telemetry transport failure must not block completion.
    }
  }

  let result: OpsConsoleOperationResult;
  try {
    result = await completeOpsConsoleOperation({
      operationId: args.operationId,
      completedAt: args.completedAt,
    });
  } catch {
    return;
  }
  await recordOperationTelemetryFailure({
    teamId: args.teamId,
    runId: args.runId,
    phase: "COMPLETE",
    result,
  });
}

/** Reads the fallback mode the runtime stored when a verification failure forced a retreat. */
function readVerificationFallbackMode(
  output: Record<string, unknown> | undefined,
): "EXTRACTIVE" | "ABSTENTION" | null {
  const fallback = output?.verificationFallback;
  if (!fallback || typeof fallback !== "object") return null;
  const mode = (fallback as { mode?: unknown }).mode;
  return mode === "EXTRACTIVE" || mode === "ABSTENTION" ? mode : null;
}

function summarize(value: unknown) {
  const serialized = JSON.stringify(value);
  if (serialized.length <= 4_000) return value;
  return { truncated: true, preview: serialized.slice(0, 4_000) };
}

async function nextStepSequence(runId: string) {
  const latest = await prisma.agentStep.findFirst({
    where: { runId },
    orderBy: { sequence: "desc" },
    select: { sequence: true },
  });
  return (latest?.sequence ?? 0) + 1;
}

async function executeToolStep<T>(args: {
  context: PressAgentContext;
  toolName: PressAgentToolName;
  input: unknown;
  execute: () => Promise<T>;
}) {
  const run = await prisma.agentRun.findUniqueOrThrow({
    where: { id: args.context.runId },
    select: {
      retryCount: true,
      teamId: true,
      inputTokens: true,
      outputTokens: true,
      estimatedCostMicros: true,
      deadlineAt: true,
      runtimePolicySnapshot: true,
    },
  });
  const policy = assertToolPolicy({
    toolName: args.toolName,
    approved: args.toolName === "apply_press_release",
    teamId: run.teamId,
    contextTeamId: args.context.teamId,
  });
  const runtimePolicy = run.runtimePolicySnapshot
    ? pressAgentRuntimePolicySchema.parse(run.runtimePolicySnapshot)
    : DEFAULT_PRESS_AGENT_RUNTIME_POLICY;
  assertRuntimeBudget({
    policy: runtimePolicy,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    estimatedCostMicros: run.estimatedCostMicros,
    now: new Date(),
    deadlineAt:
      run.deadlineAt ?? new Date(Date.now() + runtimePolicy.totalDeadlineMs),
  });
  const sequence = await nextStepSequence(args.context.runId);
  const startedAt = new Date();
  const idempotencyKey =
    policy.effect === "WRITE"
      ? buildAgentMutationIdempotencyKey({
          runId: args.context.runId,
          toolName: args.toolName,
          mutationIdentity: args.input,
        })
      : buildAgentStepIdempotencyKey({
          runId: args.context.runId,
          sequence,
          toolName: args.toolName,
        });
  if (policy.effect === "WRITE") {
    const existing = await prisma.agentStep.findUnique({
      where: { idempotencyKey },
      select: { status: true, outputSummary: true },
    });
    if (existing?.status === "COMPLETED") return existing.outputSummary as T;
  }
  const step = await prisma.agentStep.create({
    data: {
      runId: args.context.runId,
      sequence,
      kind: "TOOL",
      toolName: args.toolName,
      status: "RUNNING",
      idempotencyKey,
      inputSummary: jsonValue(summarize(args.input)),
      retryCount: run.retryCount,
      startedAt,
    },
  });
  await prisma.agentRuntimeAuditEvent.create({
    data: {
      teamId: args.context.teamId,
      runId: args.context.runId,
      eventType: "TOOL_STARTED",
      details: { stepId: step.id, toolName: args.toolName, effect: policy.effect },
    },
  });
  if (args.toolName === "search_knowledge" || args.toolName === "compare_sources") {
    await persistPressAgentWorkflowEvent({
      teamId: args.context.teamId,
      runId: args.context.runId,
      event: { type: "stage.state", dedupeKey: "stage:retrieval:running", stage: { id: "retrieval-execution", state: "running", findingCode: null } },
    });
  }
  try {
    const output = await args.execute();
    await prisma.agentStep.update({
      where: { id: step.id },
      data: {
        status: "COMPLETED",
        outputSummary: jsonValue(summarize(output)),
        latencyMs: Date.now() - startedAt.getTime(),
        completedAt: new Date(),
      },
    });
    await prisma.agentRuntimeAuditEvent.create({
      data: {
        teamId: args.context.teamId,
        runId: args.context.runId,
        eventType: "TOOL_COMPLETED",
        details: { stepId: step.id, toolName: args.toolName },
      },
    });
    return output;
  } catch (error) {
    const normalized = normalizeAgentError(error);
    await prisma.agentStep.update({
      where: { id: step.id },
      data: {
        status: "FAILED",
        errorCode: normalized.code,
        errorMessage: normalized.message,
        latencyMs: Date.now() - startedAt.getTime(),
        completedAt: new Date(),
      },
    });
    await prisma.agentRuntimeAuditEvent.create({
      data: {
        teamId: args.context.teamId,
        runId: args.context.runId,
        eventType: "TOOL_FAILED",
        failureCategory: classifyAgentFailure(error),
        details: { stepId: step.id, toolName: args.toolName, errorCode: normalized.code },
      },
    });
    if (args.toolName === "search_knowledge" || args.toolName === "compare_sources") {
      await persistPressAgentWorkflowEvent({
        teamId: args.context.teamId,
        runId: args.context.runId,
        event: { type: "stage.state", dedupeKey: `stage:retrieval:failed:${step.id}`, stage: { id: "retrieval-execution", state: "warning", findingCode: "retrieval-tool-failed", metrics: { failedTools: 1 } } },
      });
    }
    throw error;
  }
}

export function normalizeAgentDocumentIds(
  documentIds: readonly string[] | undefined,
): string[] | undefined {
  const persistedIds = documentIds
    ?.map((id) => id.trim())
    .filter((id) => /^c[a-z0-9]{20,}$/i.test(id));
  return persistedIds && persistedIds.length > 0
    ? [...new Set(persistedIds)]
    : undefined;
}

export function resolveAgentSearchTopK(args: Readonly<{
  query: string;
  requestedTopK: number;
  configurationId: PressKnowledgeRetrievalConfiguration["id"];
}>): number {
  if (args.configurationId !== "candidate-v3") return args.requestedTopK;
  const identifiers = extractExplicitKnowledgeIdentifiers(args.query);
  return identifiers.length > 0
    ? Math.min(args.requestedTopK, identifiers.length)
    : args.requestedTopK;
}

const searchKnowledgeTool = tool({
  name: "search_knowledge",
  description:
    "Search internal team documents. Use before making factual claims and return source IDs for citations.",
  parameters: z.object({
    query: z.string().min(1),
    topK: z.number().int().min(1).max(12).default(8),
    documentIds: z.array(z.string()).max(50).optional(),
    roles: z.array(z.enum(["FACT", "CAREER", "STYLE_POLICY", "STYLE_EXAMPLE"])).min(1).max(4).optional(),
  }),
  timeoutMs: PRESS_AGENT_TOOL_POLICIES.search_knowledge.timeoutMs,
  timeoutBehavior: "error_as_result",
  timeoutErrorFunction: () =>
    JSON.stringify({ results: [], fallback: "RETURN_EMPTY", timedOut: true }),
  execute: async (input, runContext) => {
    const context = requirePressAgentContext(runContext);
    return executeToolStep({
      context,
      toolName: "search_knowledge",
      input,
      execute: async () => {
        const result = await traceLangSmithRagStage({
          stageId: "retrieval-execution",
          execute: () => searchKnowledgeAndPersistAgentCitations({
            teamId: context.teamId,
            runId: context.runId,
            query: input.query,
            topK: resolveAgentSearchTopK({
              query: input.query,
              requestedTopK: input.topK,
              configurationId: context.retrievalConfigurationId,
            }),
            documentIds: context.selectedDocumentIds ?? normalizeAgentDocumentIds(input.documentIds),
            roles: input.roles,
            configurationId: context.retrievalConfigurationId,
          }),
          observe: (retrieval) => ({
            selectedSourceCount: retrieval.citations.length,
            eligibleSourceCount: retrieval.evidenceDecision.eligibleSourceIds.length,
            terminalStatus: "COMPLETED",
          }),
        });
        await recordLangSmithRagObservation("evidence-decision", {
          action: result.evidenceDecision.action,
          code: result.evidenceDecision.code,
          reasonCodes: result.evidenceDecision.reasonCodes,
          conflictCount: result.evidenceDecision.conflicts.length,
          decisionInputHash: result.evidenceDecision.decisionInputHash,
        });
        const selectedSources = result.citations.length;
        const eligibleSources = result.evidenceDecision.eligibleSourceIds.length;
        const conflicts = result.evidenceDecision.conflicts.length;
        const findingCode = selectedSources === 0 ? "retrieval-empty" as const : conflicts > 0 ? "evidence-conflict" as const : null;
        await persistPressAgentWorkflowEvent({
          teamId: context.teamId,
          runId: context.runId,
          event: { type: "stage.state", dedupeKey: "stage:retrieval:complete", stage: { id: "retrieval-execution", state: selectedSources === 0 ? "warning" : "succeeded", findingCode, metrics: { selectedSources, eligibleSources } } },
        });
        await persistPressAgentWorkflowEvent({ teamId: context.teamId, runId: context.runId, event: { type: "edge.state", dedupeKey: "edge:request-retrieval:taken", edge: { id: "request-retrieval", source: "request-intake", target: "retrieval-execution", state: "taken", findingCode: null } } });
        await persistPressAgentWorkflowEvent({ teamId: context.teamId, runId: context.runId, event: { type: "edge.state", dedupeKey: "edge:retrieval-evidence:moving", edge: { id: "retrieval-evidence", source: "retrieval-execution", target: "evidence-decision", state: "moving", findingCode } } });
        await persistPressAgentWorkflowEvent({ teamId: context.teamId, runId: context.runId, event: { type: "stage.state", dedupeKey: "stage:evidence:running", stage: { id: "evidence-decision", state: "running", findingCode: null } } });
        await persistPressAgentWorkflowEvent({
          teamId: context.teamId,
          runId: context.runId,
          event: { type: "edge.state", dedupeKey: "edge:retrieval-evidence:taken", edge: { id: "retrieval-evidence", source: "retrieval-execution", target: "evidence-decision", state: findingCode ? "taken-with-violation" : "taken", findingCode } },
        });
        await persistPressAgentWorkflowEvent({
          teamId: context.teamId,
          runId: context.runId,
          event: { type: "stage.state", dedupeKey: "stage:evidence:complete", stage: { id: "evidence-decision", state: conflicts > 0 ? "warning" : "succeeded", findingCode: conflicts > 0 ? "evidence-conflict" : selectedSources === 0 ? "insufficient-evidence" : null, metrics: { selectedSources, eligibleSources, conflicts } } },
        });
        await persistPressAgentWorkflowEvent({
          teamId: context.teamId,
          runId: context.runId,
          event: { type: "edge.state", dedupeKey: "edge:evidence-response:moving", edge: { id: "evidence-response", source: "evidence-decision", target: "response-behavior", state: "moving", findingCode } },
        });
        await persistPressAgentWorkflowEvent({
          teamId: context.teamId,
          runId: context.runId,
          event: { type: "stage.state", dedupeKey: "stage:response:running", stage: { id: "response-behavior", state: "running", findingCode: null } },
        });
        await persistPressAgentWorkflowEvent({ teamId: context.teamId, runId: context.runId, event: { type: "edge.state", dedupeKey: "edge:evidence-response:taken", edge: { id: "evidence-response", source: "evidence-decision", target: "response-behavior", state: findingCode ? "taken-with-violation" : "taken", findingCode } } });
        return result;
      },
    });
  },
});

const compareSourcesTool = tool({
  name: "compare_sources",
  description:
    "Load selected sources side by side so dates, numbers, names, agreements, and conflicts can be compared.",
  parameters: z.object({
    sourceIds: z.array(z.string()).min(2).max(12),
    question: z.string().min(1),
  }),
  timeoutMs: PRESS_AGENT_TOOL_POLICIES.compare_sources.timeoutMs,
  timeoutBehavior: "raise_exception",
  execute: async (input, runContext) => {
    const context = requirePressAgentContext(runContext);
    return executeToolStep({
      context,
      toolName: "compare_sources",
      input,
      execute: async () => {
        const citations = await prisma.agentRetrievedSource.findMany({
          where: {
            runId: context.runId,
            sourceId: { in: input.sourceIds },
          },
          include: { chunk: { select: { content: true } } },
          orderBy: { sourceId: "asc" },
        });
        return {
          question: input.question,
          sources: citations.map((citation) => ({
            sourceId: citation.sourceId,
            documentName: citation.documentName,
            pages: [citation.pageStart, citation.pageEnd],
            content: citation.chunk.content,
          })),
          missingSourceIds: input.sourceIds.filter(
            (sourceId) =>
              !citations.some((citation) => citation.sourceId === sourceId),
          ),
        };
      },
    });
  },
});

const draftPressReleaseTool = tool({
  name: "draft_press_release",
  description:
    "Persist a proposed press-release draft built only from cited evidence. This does not modify the article.",
  parameters: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    sourceIds: z.array(z.string()).min(1),
  }),
  timeoutMs: PRESS_AGENT_TOOL_POLICIES.draft_press_release.timeoutMs,
  timeoutBehavior: "raise_exception",
  execute: async (input, runContext) => {
    const context = requirePressAgentContext(runContext);
    return executeToolStep({
      context,
      toolName: "draft_press_release",
      input,
      execute: async () => {
        const sources = await prisma.agentRetrievedSource.findMany({
          where: {
            runId: context.runId,
            sourceId: { in: input.sourceIds },
          },
          select: { sourceId: true, chunkId: true },
        });
        assertFinalSourceIds(
          input.sourceIds,
          sources.map(({ sourceId }) => sourceId),
        );
        if (context.articleId) {
          const acceptedCount = await prisma.articleFact.count({
            where: {
              articleId: context.articleId,
              teamId: context.teamId,
              active: true,
              chunkId: { in: sources.map(({ chunkId }) => chunkId) },
            },
          });
          if (acceptedCount !== sources.length) {
            throw new Error("PRESS_AGENT_ARTICLE_SOURCE_NOT_ACCEPTED");
          }
        }
        const draft = {
          title: input.title,
          body: input.body,
          sourceIds: input.sourceIds,
        };
        await prisma.agentRun.update({
          where: { id: context.runId },
          data: { output: jsonValue({ draft, verifiedDraftHash: null }) },
        });
        return draft;
      },
    });
  },
});

const verifyClaimsTool = tool({
  name: "verify_claims",
  description:
    "Verify every atomic draft sentence against exact character spans in retrieved sources. Report unsupported claims instead of guessing.",
  parameters: z.object({
    claims: z
      .array(
        z.object({
          id: z.string().min(1),
          text: z.string().min(1),
          evidence: z
            .array(
              z.object({
                sourceId: z.string().min(1),
                quote: z.string().min(1),
              }),
            )
            .min(1),
        }),
      )
      .min(1)
      .max(50),
  }),
  timeoutMs: PRESS_AGENT_TOOL_POLICIES.verify_claims.timeoutMs,
  timeoutBehavior: "raise_exception",
  execute: async (input, runContext) => {
    const context = requirePressAgentContext(runContext);
    return executeToolStep({
      context,
      toolName: "verify_claims",
      input,
      execute: async () => {
        const run = await prisma.agentRun.findUniqueOrThrow({
          where: { id: context.runId },
          select: { output: true },
        });
        const output = (run.output ?? {}) as any;
        const parsedDraft = z
          .object({
            title: z.string().min(1),
            body: z.string().min(1),
            sourceIds: z.array(z.string()).min(1),
          })
          .safeParse(output.draft);
        if (!parsedDraft.success) throw new Error("PRESS_AGENT_DRAFT_MISSING");

        const sourceIds = [
          ...new Set(
            input.claims.flatMap((claim) =>
              claim.evidence.map((evidence) => evidence.sourceId),
            ),
          ),
        ];
        const retrievedSources = await prisma.agentRetrievedSource.findMany({
          where: {
            runId: context.runId,
            sourceId: { in: sourceIds },
          },
          include: { chunk: { select: { content: true } } },
          orderBy: { sourceId: "asc" },
        });
        const result = verifyDraftClaimSpans({
          draft: parsedDraft.data,
          claims: input.claims,
          sources: retrievedSources.map((source) => ({
            sourceId: source.sourceId,
            documentId: source.documentId,
            content: source.chunk.content,
            pageStart: source.pageStart,
            pageEnd: source.pageEnd,
          })),
        });
        await prisma.agentRun.update({
          where: { id: context.runId },
          data: {
            output: jsonValue({
              ...output,
              claimVerification: result,
              verifiedDraftHash:
                result.status === "PASS"
                  ? hashVerifiedAgentDraft(parsedDraft.data)
                  : null,
            }),
          },
        });
        return {
          ...result,
          allGrounded: result.status === "PASS",
        };
      },
    });
  },
});

const applyPressReleaseTool = tool({
  name: "apply_press_release",
  description:
    "Apply a verified draft to the current PressTuner article. Always requires explicit human approval.",
  parameters: z.object({
    articleId: z.string().min(1),
    title: z.string().min(1),
    body: z.string().min(1),
    sourceIds: z.array(z.string()).min(1),
  }),
  needsApproval: true,
  timeoutMs: PRESS_AGENT_TOOL_POLICIES.apply_press_release.timeoutMs,
  timeoutBehavior: "raise_exception",
  execute: async (input, runContext) => {
    const context = requirePressAgentContext(runContext);
    return executeToolStep({
      context,
      toolName: "apply_press_release",
      input,
      execute: async () => {
        if (
          context.articleId !== input.articleId ||
          !(await prisma.article.findFirst({
            where: {
              id: input.articleId,
              teamId: context.teamId,
            },
            select: { id: true },
          }))
        ) {
          throw new Error("PRESS_AGENT_ARTICLE_SCOPE_MISMATCH");
        }
        if (!context.articleUpdatedAt) {
          throw new Error("PRESS_AGENT_ARTICLE_VERSION_CONFLICT");
        }
        const run = await prisma.agentRun.findUniqueOrThrow({
          where: { id: context.runId },
          select: { output: true },
        });
        const verifiedDraftHash =
          run.output &&
          typeof run.output === "object" &&
          !Array.isArray(run.output) &&
          typeof (run.output as any).verifiedDraftHash === "string"
            ? (run.output as any).verifiedDraftHash
            : null;
        assertAppliedDraftMatchesVerified(verifiedDraftHash, input);
        await saveArticleDraft({
          teamId: context.teamId,
          userId: context.userId,
          articleId: input.articleId,
          expectedUpdatedAt: new Date(context.articleUpdatedAt),
          title: input.title,
          paragraphs: [],
          plain: input.body,
        });
        await persistFinalAgentCitations({
          teamId: context.teamId,
          runId: context.runId,
          sourceIds: input.sourceIds,
          articleId: input.articleId,
        });
        return {
          applied: true,
          articleId: input.articleId,
          sourceIds: input.sourceIds,
        };
      },
    });
  },
});

export const pressAgent = new Agent<PressAgentContext, typeof AgentOutputSchema>({
  name: "PressTuner Grounded Press Agent",
  model: PRESS_AGENT_MODEL,
  instructions: buildPressAgentInstructions(),
  tools: [
    searchKnowledgeTool,
    compareSourcesTool,
    draftPressReleaseTool,
    verifyClaimsTool,
    applyPressReleaseTool,
  ],
  outputType: AgentOutputSchema,
});

const pressAgentRunner = new Runner({
  workflowName: "PressTuner Grounded Press Agent",
  traceIncludeSensitiveData: false,
  toolExecution: { maxFunctionToolConcurrency: 1 },
});

const CHECKPOINT_VERSION = 1;
const activeRunAbortControllers = new Map<string, AbortController>();

function checkpoint(args: {
  runId: string;
  teamId: string;
  sdkState: string;
}) {
  const key = process.env.PRESS_AGENT_CHECKPOINT_KEY?.trim() ?? "";
  const payload = JSON.stringify({
    runId: args.runId,
    teamId: args.teamId,
    agentVersion: PRESS_AGENT_VERSION,
    sdkState: args.sdkState,
  });
  return encryptPressAgentCheckpoint(payload, key, {
    runId: args.runId,
    teamId: args.teamId,
    version: CHECKPOINT_VERSION,
  });
}

type PressAgentRunResult = {
  state: RunState<PressAgentContext, typeof pressAgent>;
  interruptions: RunToolApprovalItem[];
  finalOutput?: z.infer<typeof AgentOutputSchema>;
};

function usageSnapshot(state: RunState<PressAgentContext, typeof pressAgent>) {
  const cachedInputTokens = extractCachedInputTokens(
    state.usage.inputTokensDetails,
  );
  return {
    inputTokens: state.usage.inputTokens,
    outputTokens: state.usage.outputTokens,
    cachedInputTokens,
    estimatedCostMicros: estimateAgentCostMicros({
      inputTokens: state.usage.inputTokens,
      outputTokens: state.usage.outputTokens,
      cachedInputTokens,
      rates: PRESS_AGENT_TOKEN_RATES,
    }),
  };
}

async function recordModelStep(args: {
  runId: string;
  state?: RunState<PressAgentContext, typeof pressAgent>;
  startedAtMs: number;
  status: "COMPLETED" | "FAILED";
  error?: unknown;
}) {
  const run = await prisma.agentRun.findUniqueOrThrow({
    where: { id: args.runId },
    select: {
      retryCount: true,
      inputTokens: true,
      outputTokens: true,
      cachedInputTokens: true,
      estimatedCostMicros: true,
    },
  });
  const sequence = await nextStepSequence(args.runId);
  const cumulativeUsage = args.state
    ? usageSnapshot(args.state)
    : {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        estimatedCostMicros: 0,
      };
  const usage = {
    inputTokens: Math.max(0, cumulativeUsage.inputTokens - run.inputTokens),
    outputTokens: Math.max(0, cumulativeUsage.outputTokens - run.outputTokens),
    cachedInputTokens: Math.max(
      0,
      cumulativeUsage.cachedInputTokens - run.cachedInputTokens,
    ),
    estimatedCostMicros: Math.max(
      0,
      cumulativeUsage.estimatedCostMicros - run.estimatedCostMicros,
    ),
  };
  const normalized = args.error ? normalizeAgentError(args.error) : null;
  await prisma.agentStep.create({
    data: {
      runId: args.runId,
      sequence,
      kind: "MODEL",
      status: args.status,
      idempotencyKey: buildAgentStepIdempotencyKey({
        runId: args.runId,
        sequence,
        toolName: "model",
      }),
      model: PRESS_AGENT_MODEL,
      ...usage,
      retryCount: run.retryCount,
      errorCode: normalized?.code,
      errorMessage: normalized?.message,
      latencyMs: Date.now() - args.startedAtMs,
      startedAt: new Date(args.startedAtMs),
      completedAt: new Date(),
    },
  });
}

async function persistRunResult(
  runRecord: { id: string; teamId: string; startedById: string },
  result: PressAgentRunResult,
  startedAtMs: number,
  operationId: string | null,
) {
  const nextStatus = transitionPressAgentRun(
    { status: "RUNNING", retryCount: 0 },
    { type: result.interruptions.length ? "APPROVAL_REQUIRED" : "COMPLETE" },
  ).status;
  let finalClaimVerification: ReturnType<typeof verifyAgentAnswerClaimSpans> | undefined;
  let finalOutput = result.finalOutput;
  let previousOutput: Record<string, unknown> = {};
  // Kept outside the block below so the guardrail report can still read them at completion.
  let verifiableSourceCount = 0;
  // The fallback path reassigns finalClaimVerification, so the primary result is captured
  // separately: a fallback that verifies clean must not erase the failure that caused it.
  let primaryClaimVerificationStatus: "PASS" | "FAIL" | null = null;
  if (finalOutput) {
    await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:response:complete", stage: { id: "response-behavior", state: "succeeded", findingCode: null, metrics: { claims: finalOutput.claims.length, citations: finalOutput.sourceIds.length } } } });
    await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "edge.state", dedupeKey: "edge:response-verification:moving", edge: { id: "response-verification", source: "response-behavior", target: "verification", state: "moving", findingCode: null } } });
    await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:verification:running", stage: { id: "verification", state: "running", findingCode: null } } });
    await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "edge.state", dedupeKey: "edge:response-verification:taken", edge: { id: "response-verification", source: "response-behavior", target: "verification", state: "taken", findingCode: null } } });
    const [retrievedSources, existingRun] = await Promise.all([
      prisma.agentRetrievedSource.findMany({
        where: { runId: runRecord.id },
        include: { chunk: { select: { content: true } } },
        orderBy: { sourceId: "asc" },
      }),
      prisma.agentRun.findUniqueOrThrow({
        where: { id: runRecord.id },
        select: { output: true, input: true },
      }),
    ]);
    const verifiableSources = retrievedSources.map((source) => ({
      sourceId: source.sourceId,
      documentId: source.documentId,
      content: source.chunk.content,
      pageStart: source.pageStart,
      pageEnd: source.pageEnd,
    }));
    verifiableSourceCount = verifiableSources.length;
    const runInput = existingRun.input && typeof existingRun.input === "object" && !Array.isArray(existingRun.input)
      ? (existingRun.input as Record<string, unknown>)
      : {};
    const extractive = typeof runInput.prompt === "string"
      ? buildExtractiveVerificationFallback({ prompt: runInput.prompt, sources: verifiableSources })
      : null;
    previousOutput =
      existingRun.output && typeof existingRun.output === "object" && !Array.isArray(existingRun.output)
        ? (existingRun.output as Record<string, unknown>)
        : {};
    if (runInput.launchSurface === "RAG_DEBUGGER_V1") {
      previousOutput = { ...previousOutput, preVerificationOutput: finalOutput };
    }
    if (finalOutput.cannotAnswer && extractive) {
      previousOutput = {
        ...previousOutput,
        abstentionRecovery: {
          reason: "REQUESTED_DOCUMENT_EVIDENCE_PRESENT",
          unverifiedFinalOutput: finalOutput,
        },
      };
      finalOutput = extractive;
    } else if (finalOutput.cannotAnswer && (finalOutput.claims.length > 0 || finalOutput.sourceIds.length > 0)) {
      previousOutput = {
        ...previousOutput,
        abstentionNormalization: {
          removedClaimCount: finalOutput.claims.length,
          removedSourceIds: finalOutput.sourceIds,
        },
      };
      finalOutput = { ...finalOutput, claims: [], sourceIds: [] };
    }
    finalClaimVerification = verifyAgentAnswerClaimSpans({
      answer: finalOutput.answer,
      cannotAnswer: finalOutput.cannotAnswer,
      claims: finalOutput.claims,
      sources: verifiableSources,
    });
    primaryClaimVerificationStatus = finalClaimVerification.status === "PASS" ? "PASS" : "FAIL";
    await recordLangSmithRagObservation("verification", {
      status: finalClaimVerification.status,
      supportedClaimCount: finalClaimVerification.claims.filter(
        (claim) => claim.status === "SUPPORTED",
      ).length,
      totalClaimCount: finalClaimVerification.claims.length,
    });
    if (finalClaimVerification.status !== "PASS") {
      const failedOutput = finalOutput;
      const failedVerification = finalClaimVerification;
      const fallbackOutput = extractive ?? {
        summary: "생성 결과가 근거 검증을 통과하지 못해 답변을 유보했습니다.",
        answer: "검색된 근거만으로 검증 가능한 답변을 만들 수 없습니다.",
        sourceIds: [],
        cannotAnswer: true,
        claims: [],
      };
      finalOutput = fallbackOutput;
      finalClaimVerification = verifyAgentAnswerClaimSpans({
        answer: fallbackOutput.answer,
        cannotAnswer: fallbackOutput.cannotAnswer,
        claims: fallbackOutput.claims,
        sources: verifiableSources,
      });
      if (finalClaimVerification.status !== "PASS") {
        throw new Error("PRESS_AGENT_EXTRACTIVE_FALLBACK_VERIFICATION_FAILED");
      }
      await recordLangSmithRagObservation("fallback", {
        mode: extractive ? "EXTRACTIVE" : "ABSTENTION",
        postFallbackVerificationStatus: finalClaimVerification.status,
      });
      previousOutput = {
        ...previousOutput,
        verificationFallback: {
          reason: "PRESS_AGENT_FINAL_CLAIM_VERIFICATION_FAILED",
          mode: extractive ? "EXTRACTIVE" : "ABSTENTION",
          unverifiedFinalOutput: failedOutput,
          failedClaimVerification: failedVerification,
        },
      };
      await prisma.agentRuntimeAuditEvent.create({
        data: {
          teamId: runRecord.teamId,
          runId: runRecord.id,
          eventType: "CLAIM_VERIFICATION_FALLBACK",
          failureCategory: "UNGROUNDED_CLAIM",
          details: { reason: "PRESS_AGENT_FINAL_CLAIM_VERIFICATION_FAILED" },
        },
      });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:verification:complete", stage: { id: "verification", state: "warning", findingCode: "claim-verification-failed", metrics: { claims: failedVerification.claims.length, supportedClaims: failedVerification.claims.filter((claim) => claim.status === "SUPPORTED").length } } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "edge.state", dedupeKey: "edge:verification-fallback:moving", edge: { id: "verification-fallback", source: "verification", target: "fallback", state: "moving", findingCode: "claim-verification-failed" } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:fallback:running", stage: { id: "fallback", state: "running", findingCode: "claim-verification-failed" } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "edge.state", dedupeKey: "edge:verification-fallback:taken", edge: { id: "verification-fallback", source: "verification", target: "fallback", state: "taken-with-violation", findingCode: "claim-verification-failed" } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:fallback:complete", stage: { id: "fallback", state: "warning", findingCode: extractive ? "fallback-extractive" : "fallback-abstention" } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "edge.state", dedupeKey: "edge:fallback-terminal:taken", edge: { id: "fallback-terminal", source: "fallback", target: "terminal-evaluation", state: "taken-with-violation", findingCode: "claim-verification-failed" } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:terminal:running", stage: { id: "terminal-evaluation", state: "running", findingCode: null } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "edge.state", dedupeKey: "edge:verification-terminal:not-taken", edge: { id: "verification-terminal", source: "verification", target: "terminal-evaluation", state: "not-taken", findingCode: null } } });
    } else {
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:verification:complete", stage: { id: "verification", state: "succeeded", findingCode: null, metrics: { claims: finalClaimVerification.claims.length, supportedClaims: finalClaimVerification.claims.length } } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "edge.state", dedupeKey: "edge:verification-terminal:taken", edge: { id: "verification-terminal", source: "verification", target: "terminal-evaluation", state: "taken", findingCode: null } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:terminal:running", stage: { id: "terminal-evaluation", state: "running", findingCode: null } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "edge.state", dedupeKey: "edge:verification-fallback:not-taken", edge: { id: "verification-fallback", source: "verification", target: "fallback", state: "not-taken", findingCode: null } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:fallback:skipped", stage: { id: "fallback", state: "skipped", findingCode: "fallback-not-needed" } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "edge.state", dedupeKey: "edge:fallback-terminal:not-taken", edge: { id: "fallback-terminal", source: "fallback", target: "terminal-evaluation", state: "not-taken", findingCode: null } } });
    }
    if (!finalOutput) throw new Error("PRESS_AGENT_FINAL_OUTPUT_MISSING");
    await recordLangSmithRagObservation("response-behavior", {
      status: finalOutput.cannotAnswer ? "ABSTENTION" : "ANSWER",
      finalCitationCount: finalOutput.sourceIds.length,
      claimCount: finalOutput.claims.length,
    });
    await persistFinalAgentCitations({
      teamId: runRecord.teamId,
      runId: runRecord.id,
      sourceIds: finalOutput.sourceIds,
    });
  }
  const usage = usageSnapshot(result.state);
  await recordModelStep({
    runId: runRecord.id,
    state: result.state,
    startedAtMs,
    status: "COMPLETED",
  });
  const interruptions = result.interruptions;
  const sdkState = checkpoint({
    runId: runRecord.id,
    teamId: runRecord.teamId,
    sdkState: result.state.toString(),
  });
  if (interruptions.length > 0) {
    for (const [index, interruption] of interruptions.entries()) {
      const sequence = await nextStepSequence(runRecord.id);
      const toolName = interruption.name ?? "unknown";
      const step = await prisma.agentStep.create({
        data: {
          runId: runRecord.id,
          sequence,
          kind: "TOOL",
          toolName,
          status: "WAITING_APPROVAL",
          idempotencyKey: buildAgentStepIdempotencyKey({
            runId: runRecord.id,
            sequence,
            toolName: toolName as PressAgentToolName,
          }),
          inputSummary: jsonValue({
            arguments: interruption.arguments,
          }),
          startedAt: new Date(),
        },
      });
      await prisma.agentApproval.create({
        data: {
          runId: runRecord.id,
          stepId: step.id,
          requestedById: runRecord.startedById,
          toolName,
          toolInput: jsonValue({
            arguments: interruption.arguments,
            interruptionIndex: index,
          }),
        },
      });
    }
  }
  if (interruptions.length === 0) {
    const [pendingApprovalCount, unfinishedWriteCount] = await Promise.all([
      prisma.agentApproval.count({
        where: { runId: runRecord.id, status: "PENDING" },
      }),
      prisma.agentStep.count({
        where: {
          runId: runRecord.id,
          toolName: "apply_press_release",
          status: { in: ["PENDING", "RUNNING", "WAITING_APPROVAL"] },
        },
      }),
    ]);
    assertAgentCompletion({
      outputSchemaValid: result.finalOutput !== undefined,
      selectedSourcesEligible: true,
      pendingApprovalCount,
      unfinishedWriteCount,
      persistedStatus: "COMPLETED",
      reportedStatus: "COMPLETED",
    });
  }
  const finalized = await prisma.agentRun.updateMany({
    where: {
      id: runRecord.id,
      status: { notIn: ["CANCEL_REQUESTED", "CANCELED"] },
    },
    data: {
      status: nextStatus,
      sdkState: interruptions.length ? sdkState : null,
      output: finalOutput
        ? jsonValue({
            ...previousOutput,
            ...finalOutput,
            claimVerification: finalClaimVerification,
          })
        : undefined,
      ...usage,
      latencyMs: Date.now() - startedAtMs,
      completedAt: interruptions.length ? null : new Date(),
      completionVerifiedAt: interruptions.length ? null : new Date(),
      terminalReason: interruptions.length ? null : "COMPLETION_VERIFIED",
    },
  });
  if (finalized.count === 1) {
    await prisma.agentRuntimeAuditEvent.create({
      data: {
        teamId: runRecord.teamId,
        runId: runRecord.id,
        eventType: interruptions.length
          ? "APPROVAL_REQUIRED"
          : "RUN_COMPLETED_VERIFIED",
        details: { interruptionCount: interruptions.length },
      },
    });
    if (interruptions.length === 0) {
      const failedToolCount = await prisma.agentStep.count({
        where: { runId: runRecord.id, kind: "TOOL", status: "FAILED" },
      });
      const guardrailObservation = buildPressAgentCompletionObservation({
        verifiableSourceCount,
        finalCitationCount: finalOutput?.sourceIds.length ?? 0,
        failedToolCount,
        primaryClaimVerificationStatus,
        fallbackMode: readVerificationFallbackMode(previousOutput),
        postFallbackVerificationStatus: finalClaimVerification
          ? finalClaimVerification.status === "PASS" ? "PASS" : "FAIL"
          : null,
        cannotAnswer: finalOutput?.cannotAnswer ?? null,
      });
      await completePressAgentOperation({
        teamId: runRecord.teamId,
        runId: runRecord.id,
        operationId,
        guardrails: guardrailObservation,
      });
      const verdicts = deriveGuardrailVerdicts(guardrailObservation);
      const warning = verdicts.some((verdict) => verdict.verdict === "violation");
      if (failedToolCount > 0 && readVerificationFallbackMode(previousOutput) === null) {
        await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "edge.state", dedupeKey: "edge:verification-terminal:recovered-tool-failure", edge: { id: "verification-terminal", source: "verification", target: "terminal-evaluation", state: "taken-with-violation", findingCode: "retrieval-tool-failed" } } });
      }
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:terminal:complete", stage: { id: "terminal-evaluation", state: warning ? "warning" : "succeeded", findingCode: warning ? "guardrail-warning" : null, metrics: { failedTools: failedToolCount, citations: finalOutput?.sourceIds.length ?? 0 } } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "run.finished", dedupeKey: "run:terminal", run: { status: warning ? "warning" : "succeeded", findingCode: warning ? "guardrail-warning" : null } } });
    } else {
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:terminal:approval", stage: { id: "terminal-evaluation", state: "blocked", findingCode: "approval-required" } } });
      await persistPressAgentWorkflowEvent({ teamId: runRecord.teamId, runId: runRecord.id, event: { type: "run.finished", dedupeKey: "run:terminal", run: { status: "blocked", findingCode: "approval-required" } } });
    }
  }
}

export async function startPressAgentRun(args: {
  teamId: string;
  userId: string;
  articleId?: string | null;
  prompt: string;
  retrievalConfigurationId?: PressKnowledgeRetrievalConfiguration["id"];
  launchSurface?: "RAG_DEBUGGER_V1";
  promptPresetId?: PressAgentRagDebuggerPromptPresetId | null;
  selectedDocumentIds?: string[];
  selectedDocuments?: PressAgentRagDebuggerDocumentSnapshot[];
  workflowObserver?: PressAgentWorkflowStreamObserver;
}): Promise<Awaited<ReturnType<typeof getPressAgentRun>>> {
  if (args.workflowObserver) {
    return withPressAgentWorkflowObserver(args.workflowObserver, () => startPressAgentRun({ ...args, workflowObserver: undefined }));
  }
  assertAdversarialInput(args.prompt);
  let articleUpdatedAt: string | null = null;
  if (args.articleId) {
    const article = await prisma.article.findFirst({
      where: { id: args.articleId, teamId: args.teamId },
      select: { updatedAt: true },
    });
    if (!article) throw new Error("PRESS_AGENT_ARTICLE_SCOPE_MISMATCH");
    articleUpdatedAt = article.updatedAt.toISOString();
  }
  const runRecord = await prisma.agentRun.create({
    data: {
      teamId: args.teamId,
      startedById: args.userId,
      articleId: args.articleId ?? null,
      status: transitionPressAgentRun(
        { status: "PENDING", retryCount: 0 },
        { type: "START" },
      ).status,
      agentVersion: PRESS_AGENT_VERSION,
      model: PRESS_AGENT_MODEL,
      input: {
        ...(args.launchSurface ? {
          launchSurface: args.launchSurface,
          prompt: args.prompt,
          promptPresetId: args.promptPresetId ?? null,
          retrievalConfigurationId: args.retrievalConfigurationId ?? "baseline-v1",
          selectedDocumentIds: args.selectedDocumentIds ?? [],
          selectedDocuments: args.selectedDocuments ?? [],
          articleUpdatedAt,
        } : {
          prompt: args.prompt,
          articleUpdatedAt,
          retrievalConfigurationId: args.retrievalConfigurationId ?? "baseline-v1",
        }),
      },
      startedAt: new Date(),
      runtimePolicySnapshot: jsonValue(DEFAULT_PRESS_AGENT_RUNTIME_POLICY),
      deadlineAt: new Date(
        Date.now() + DEFAULT_PRESS_AGENT_RUNTIME_POLICY.totalDeadlineMs,
      ),
    },
  });
  const operation = await beginOpsConsoleOperation({
    teamId: args.teamId,
    userId: args.userId,
    workflowVersion: PRESS_AGENT_VERSION,
  });
  const operationId =
    operation.status === "registered" ? operation.operationId : null;
  if (operationId) {
    try {
      const privateInput =
        runRecord.input && typeof runRecord.input === "object" && !Array.isArray(runRecord.input)
          ? (runRecord.input as Record<string, unknown>)
          : {};
      await prisma.agentRun.update({
        where: { id: runRecord.id },
        data: {
          input: jsonValue({
            ...privateInput,
            operationId: operation.operationId,
          }),
        },
      });
    } catch {
      // Operation persistence is observability-only and cannot fail the run.
    }
  }
  await recordOperationTelemetryFailure({
    teamId: args.teamId,
    runId: runRecord.id,
    phase: "BEGIN",
    result: operation,
  });
  await prisma.agentRuntimeAuditEvent.create({
    data: {
      teamId: args.teamId,
      runId: runRecord.id,
      eventType: "RUN_STARTED",
      details: { agentVersion: PRESS_AGENT_VERSION, model: PRESS_AGENT_MODEL },
    },
  });
  if (args.launchSurface) {
    await persistPressAgentWorkflowEvent({ teamId: args.teamId, runId: runRecord.id, event: { type: "run.started", dedupeKey: "run:started", run: { status: "running" } } });
    await persistPressAgentWorkflowEvent({ teamId: args.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:intake:complete", stage: { id: "request-intake", state: "succeeded", findingCode: null } } });
    await persistPressAgentWorkflowEvent({ teamId: args.teamId, runId: runRecord.id, event: { type: "edge.state", dedupeKey: "edge:request-retrieval:moving", edge: { id: "request-retrieval", source: "request-intake", target: "retrieval-execution", state: "moving", findingCode: null } } });
  }
  const startedAtMs = Date.now();
  const userAbortController = new AbortController();
  activeRunAbortControllers.set(runRecord.id, userAbortController);
  const composedAbort = composeAbortSignal({
    userSignal: userAbortController.signal,
    deadlineAt: runRecord.deadlineAt!,
  });
  try {
    await traceLangSmithOperation({
      operationId,
      workflowId: PRESS_AGENT_WORKFLOW_ID,
      workflowVersion: PRESS_AGENT_VERSION,
      environment:
        operation.environment ??
        readOpsConsoleOperationEnvironment() ??
        "unconfigured",
      phase: "initial",
      execute: async () => {
        const result = await withTrace(
          "PressTuner Grounded Press Agent",
          async (trace) => {
            await prisma.agentRun.update({
              where: { id: runRecord.id },
              data: { traceId: trace.traceId },
            });
            return pressAgentRunner.run(pressAgent, args.prompt, {
              context: {
                runId: runRecord.id,
                teamId: args.teamId,
                userId: args.userId,
                articleId: args.articleId ?? null,
                articleUpdatedAt,
                retrievalConfigurationId:
                  args.retrievalConfigurationId ?? "baseline-v1",
                selectedDocumentIds: args.selectedDocumentIds,
              },
              maxTurns: DEFAULT_PRESS_AGENT_RUNTIME_POLICY.maxTurns,
              signal: composedAbort.signal,
            });
          },
          {
            groupId: runRecord.id,
            metadata: {
              runId: runRecord.id,
              ...(operationId
                ? {
                    operation_id: operation.operationId,
                    workflow_id: PRESS_AGENT_WORKFLOW_ID,
                    workflow_version: PRESS_AGENT_VERSION,
                    environment:
                      operation.environment ??
                      readOpsConsoleOperationEnvironment() ??
                      "unconfigured",
                  }
                : {}),
            },
          },
        );
        await persistRunResult(runRecord, result, startedAtMs, operationId);
        return result;
      },
    });
    return getPressAgentRun({
      runId: runRecord.id,
      teamId: args.teamId,
      userId: args.userId,
    });
  } catch (error) {
    const normalized = normalizeAgentError(error);
    const failedState = error instanceof AgentsError ? error.state : undefined;
    const usage = failedState ? usageSnapshot(failedState) : undefined;
    await recordModelStep({
      runId: runRecord.id,
      state: failedState,
      startedAtMs,
      status: "FAILED",
      error,
    });
    await prisma.agentRun.updateMany({
      where: {
        id: runRecord.id,
        status: { notIn: ["CANCEL_REQUESTED", "CANCELED"] },
      },
      data: {
        status: transitionPressAgentRun(
          { status: "RUNNING", retryCount: runRecord.retryCount },
          { type: "FAIL" },
        ).status,
        sdkState: failedState
          ? checkpoint({
              runId: runRecord.id,
              teamId: runRecord.teamId,
              sdkState: failedState.toString(),
            })
          : undefined,
        errorCode: normalized.code,
        errorMessage: normalized.message,
        failureCategory: classifyAgentFailure(error),
        ...usage,
        latencyMs: Date.now() - startedAtMs,
      },
    });
    await prisma.agentRuntimeAuditEvent.create({
      data: {
        teamId: runRecord.teamId,
        runId: runRecord.id,
        eventType: "RUN_FAILED",
        failureCategory: classifyAgentFailure(error),
        details: { errorCode: normalized.code },
      },
    });
    if (args.launchSurface) {
      await persistPressAgentWorkflowEvent({ teamId: args.teamId, runId: runRecord.id, event: { type: "stage.state", dedupeKey: "stage:terminal:failed", stage: { id: "terminal-evaluation", state: "failed", findingCode: "runtime-failed" } } });
      await persistPressAgentWorkflowEvent({ teamId: args.teamId, runId: runRecord.id, event: { type: "run.finished", dedupeKey: "run:terminal", run: { status: "failed", findingCode: "runtime-failed" } } });
    }
    await completePressAgentOperation({
      teamId: runRecord.teamId,
      runId: runRecord.id,
      operationId,
    });
    return getPressAgentRun({
      runId: runRecord.id,
      teamId: args.teamId,
      userId: args.userId,
    });
  } finally {
    composedAbort.dispose();
    activeRunAbortControllers.delete(runRecord.id);
  }
}

async function loadSdkState(args: { runId: string; teamId: string }) {
  const runRecord = await prisma.agentRun.findFirst({
    where: { id: args.runId, teamId: args.teamId },
  });
  if (!runRecord) throw new Error("PRESS_AGENT_RUN_NOT_FOUND");
  if (!runRecord.sdkState) throw new Error("PRESS_AGENT_CHECKPOINT_MISSING");
  try {
    const checkpointPayload = decryptPressAgentCheckpoint(
      runRecord.sdkState,
      process.env.PRESS_AGENT_CHECKPOINT_KEY?.trim() ?? "",
      {
        runId: runRecord.id,
        teamId: runRecord.teamId,
        version: CHECKPOINT_VERSION,
      },
    );
    const restored =
      runRecord.agentVersion === PRESS_AGENT_V1_VERSION
        ? restorePressAgentV1Checkpoint(checkpointPayload, {
            runId: runRecord.id,
            teamId: runRecord.teamId,
          })
        : restorePressAgentCheckpoint(checkpointPayload, {
            runId: runRecord.id,
            teamId: runRecord.teamId,
            agentVersion: PRESS_AGENT_VERSION,
          });
    const state = await RunState.fromString<PressAgentContext, typeof pressAgent>(
      pressAgent,
      restored.sdkState,
    );
    return { runRecord, state };
  } catch {
    throw new Error("PRESS_AGENT_CHECKPOINT_INVALID");
  }
}

async function continuePressAgentRun(
  runRecord: Awaited<ReturnType<typeof loadSdkState>>["runRecord"],
  state: RunState<PressAgentContext, typeof pressAgent>,
  actorUserId = runRecord.startedById,
) {
  const startedAtMs = Date.now();
  if (runRecord.status === "CANCELED" || runRecord.status === "CANCEL_REQUESTED") {
    throw new Error("PRESS_AGENT_RUN_CANCELED");
  }
  const deadlineAt =
    runRecord.deadlineAt ??
    new Date(Date.now() + DEFAULT_PRESS_AGENT_RUNTIME_POLICY.totalDeadlineMs);
  const runtimePolicy = runRecord.runtimePolicySnapshot
    ? pressAgentRuntimePolicySchema.parse(runRecord.runtimePolicySnapshot)
    : DEFAULT_PRESS_AGENT_RUNTIME_POLICY;
  assertRuntimeBudget({
    policy: runtimePolicy,
    inputTokens: runRecord.inputTokens,
    outputTokens: runRecord.outputTokens,
    estimatedCostMicros: runRecord.estimatedCostMicros,
    now: new Date(),
    deadlineAt,
  });
  const userAbortController = new AbortController();
  activeRunAbortControllers.set(runRecord.id, userAbortController);
  const composedAbort = composeAbortSignal({
    userSignal: userAbortController.signal,
    deadlineAt,
  });
  try {
    const articleUpdatedAt = readPressAgentArticleVersion(runRecord.input);
    if (runRecord.articleId && !articleUpdatedAt) {
      throw new Error("PRESS_AGENT_ARTICLE_VERSION_CONFLICT");
    }
    const operationId = readPressAgentOperationId(runRecord.input);
    await traceLangSmithOperation({
      operationId,
      workflowId: PRESS_AGENT_WORKFLOW_ID,
      workflowVersion: PRESS_AGENT_VERSION,
      environment: readOpsConsoleOperationEnvironment() ?? "unconfigured",
      phase: "continuation",
      execute: async () => {
        const result = await withTrace(
          "PressTuner Grounded Press Agent",
          async (trace) => {
            await prisma.agentRun.update({
              where: { id: runRecord.id },
              data: { traceId: trace.traceId },
            });
            return pressAgentRunner.run(pressAgent, state, {
              context: {
                runId: runRecord.id,
                teamId: runRecord.teamId,
                userId: actorUserId,
                articleId: runRecord.articleId,
                articleUpdatedAt,
                retrievalConfigurationId:
                  runRecord.input && typeof runRecord.input === "object" && !Array.isArray(runRecord.input) &&
                  typeof (runRecord.input as Record<string, unknown>).retrievalConfigurationId === "string"
                    ? ((runRecord.input as Record<string, unknown>).retrievalConfigurationId as PressKnowledgeRetrievalConfiguration["id"])
                    : "baseline-v1",
                selectedDocumentIds:
                  runRecord.input && typeof runRecord.input === "object" && !Array.isArray(runRecord.input) &&
                  Array.isArray((runRecord.input as Record<string, unknown>).selectedDocumentIds)
                    ? ((runRecord.input as Record<string, unknown>).selectedDocumentIds as unknown[]).filter((id): id is string => typeof id === "string")
                    : undefined,
              },
              maxTurns: runtimePolicy.maxTurns,
              signal: composedAbort.signal,
            });
          },
          {
            groupId: runRecord.id,
            metadata: {
              runId: runRecord.id,
              ...(operationId
                ? {
                    operation_id: operationId,
                    workflow_id: PRESS_AGENT_WORKFLOW_ID,
                    workflow_version: PRESS_AGENT_VERSION,
                    environment:
                      readOpsConsoleOperationEnvironment() ?? "unconfigured",
                  }
                : {}),
            },
          },
        );
        await persistRunResult(runRecord, result, startedAtMs, operationId);
        return result;
      },
    });
    return getPressAgentRun({
      runId: runRecord.id,
      teamId: runRecord.teamId,
      userId: actorUserId,
    });
  } catch (error) {
    const normalized = normalizeAgentError(error);
    const failedState = error instanceof AgentsError ? error.state : undefined;
    const usage = failedState ? usageSnapshot(failedState) : undefined;
    await recordModelStep({
      runId: runRecord.id,
      state: failedState,
      startedAtMs,
      status: "FAILED",
      error,
    });
    await prisma.agentRun.updateMany({
      where: {
        id: runRecord.id,
        status: { notIn: ["CANCEL_REQUESTED", "CANCELED"] },
      },
      data: {
        status: transitionPressAgentRun(
          { status: "RUNNING", retryCount: runRecord.retryCount },
          { type: "FAIL" },
        ).status,
        sdkState: failedState
          ? checkpoint({
              runId: runRecord.id,
              teamId: runRecord.teamId,
              sdkState: failedState.toString(),
            })
          : runRecord.sdkState,
        errorCode: normalized.code,
        errorMessage: normalized.message,
        failureCategory: classifyAgentFailure(error),
        ...usage,
        latencyMs: Date.now() - startedAtMs,
      },
    });
    await prisma.agentRuntimeAuditEvent.create({
      data: {
        teamId: runRecord.teamId,
        runId: runRecord.id,
        eventType: "RUN_CONTINUATION_FAILED",
        failureCategory: classifyAgentFailure(error),
        details: { errorCode: normalized.code },
      },
    });
    await completePressAgentOperation({
      teamId: runRecord.teamId,
      runId: runRecord.id,
      operationId: readPressAgentOperationId(runRecord.input),
    });
    return getPressAgentRun({
      runId: runRecord.id,
      teamId: runRecord.teamId,
      userId: actorUserId,
    });
  } finally {
    composedAbort.dispose();
    activeRunAbortControllers.delete(runRecord.id);
  }
}

export async function cancelPressAgentRun(args: {
  runId: string;
  teamId: string;
  userId: string;
  canManageTeam?: boolean;
}) {
  const now = new Date();
  let operationId: string | null = null;
  let isRagDebuggerRun = false;
  await prisma.$transaction(async (tx) => {
    const current = await tx.agentRun.findFirst({
      where: {
        id: args.runId,
        teamId: args.teamId,
        ...(!args.canManageTeam ? { startedById: args.userId } : {}),
        status: { in: ["PENDING", "RUNNING", "WAITING_APPROVAL"] },
      },
      select: { status: true, retryCount: true, input: true },
    });
    if (!current) throw new Error("PRESS_AGENT_RUN_NOT_CANCELABLE");
    operationId = readPressAgentOperationId(current.input);
    isRagDebuggerRun = Boolean(current.input && typeof current.input === "object" && !Array.isArray(current.input) && (current.input as Record<string, unknown>).launchSurface === "RAG_DEBUGGER_V1");
    const cancelRequestedStatus = transitionPressAgentRun(
      {
        status: current.status as PressAgentRunStatus,
        retryCount: current.retryCount,
      },
      { type: "CANCEL_REQUEST" },
    ).status;
    const canceledStatus = transitionPressAgentRun(
      { status: cancelRequestedStatus, retryCount: current.retryCount },
      { type: "CANCEL" },
    ).status;
    const requested = await tx.agentRun.updateMany({
      where: {
        id: args.runId,
        teamId: args.teamId,
        status: current.status,
      },
      data: { status: cancelRequestedStatus, cancelRequestedAt: now },
    });
    if (requested.count !== 1) throw new Error("PRESS_AGENT_RUN_NOT_CANCELABLE");
    await tx.agentRun.updateMany({
      where: { id: args.runId, teamId: args.teamId, status: "CANCEL_REQUESTED" },
      data: {
        status: canceledStatus,
        canceledAt: now,
        completedAt: now,
        terminalReason: "USER_CANCELED",
        failureCategory: "CANCELED",
      },
    });
    await tx.agentRuntimeAuditEvent.create({
      data: {
        teamId: args.teamId,
        runId: args.runId,
        eventType: "RUN_CANCELED",
        failureCategory: "CANCELED",
        details: { actorUserId: args.userId },
      },
    });
  });
  if (isRagDebuggerRun) {
    await persistPressAgentCancellationWorkflow({ teamId: args.teamId, runId: args.runId });
  }
  activeRunAbortControllers.get(args.runId)?.abort();
  await completePressAgentOperation({
    teamId: args.teamId,
    runId: args.runId,
    operationId,
    completedAt: now,
  });
  return getPressAgentRun(args);
}

export async function decidePressAgentApproval(args: {
  runId: string;
  approvalId: string;
  teamId: string;
  userId: string;
  decision: "APPROVED" | "REJECTED";
  note?: string;
}) {
  const approval = await prisma.agentApproval.findFirst({
    where: {
      id: args.approvalId,
      runId: args.runId,
      status: "PENDING",
      run: { teamId: args.teamId, status: "WAITING_APPROVAL" },
    },
  });
  if (!approval) throw new Error("PRESS_AGENT_APPROVAL_NOT_FOUND");

  const { runRecord, state } = await loadSdkState(args);
  const interruptionIndex = Number(
    (approval.toolInput as { interruptionIndex?: number }).interruptionIndex ??
      -1,
  );
  const interruption = state.getInterruptions()[interruptionIndex];
  if (!interruption || interruption.name !== approval.toolName) {
    throw new Error("PRESS_AGENT_APPROVAL_CHECKPOINT_MISMATCH");
  }
  if (args.decision === "APPROVED" && runRecord.articleId) {
    const article = await assertPressArticleEditAccess({
      articleId: runRecord.articleId,
      teamId: args.teamId,
      userId: args.userId,
    });
    assertPressAgentArticleVersion(
      readPressAgentArticleVersion(runRecord.input),
      article.updatedAt,
    );
  }

  if (args.decision === "APPROVED") {
    state.approve(interruption);
  } else {
    state.reject(interruption, {
      message: args.note || "사용자가 이 작업을 승인하지 않았습니다.",
    });
  }

  const resumedStatus = transitionPressAgentRun(
    { status: "WAITING_APPROVAL", retryCount: runRecord.retryCount },
    { type: args.decision === "APPROVED" ? "APPROVED" : "REJECTED" },
  ).status;

  await prisma.$transaction(async (tx) => {
    const claimedApproval = await tx.agentApproval.updateMany({
      where: {
        id: approval.id,
        runId: args.runId,
        status: "PENDING",
      },
      data: {
        status: args.decision,
        decidedById: args.userId,
        decisionNote: args.note,
        decidedAt: new Date(),
      },
    });
    if (claimedApproval.count !== 1) {
      throw new Error("PRESS_AGENT_APPROVAL_CONFLICT");
    }
    const claimedRun = await tx.agentRun.updateMany({
      where: {
        id: runRecord.id,
        teamId: args.teamId,
        status: "WAITING_APPROVAL",
      },
      data: { status: resumedStatus },
    });
    if (claimedRun.count !== 1) {
      throw new Error("PRESS_AGENT_APPROVAL_CONFLICT");
    }
    await tx.agentStep.updateMany({
      where: { id: approval.stepId ?? "", status: "WAITING_APPROVAL" },
      data: {
        status: args.decision === "APPROVED" ? "COMPLETED" : "SKIPPED",
        completedAt: new Date(),
      },
    });
  });

  return continuePressAgentRun(
    {
      ...runRecord,
      status: resumedStatus,
    },
    state,
    args.userId,
  );
}

export async function retryPressAgentRun(args: {
  runId: string;
  teamId: string;
  userId: string;
}) {
  const { runRecord, state } = await loadSdkState(args);
  if (runRecord.status !== "FAILED") {
    throw new Error("PRESS_AGENT_RUN_NOT_RETRYABLE");
  }
  const retriedState = transitionPressAgentRun(
    { status: "FAILED", retryCount: runRecord.retryCount },
    { type: "RETRY" },
  );
  const claimed = await prisma.agentRun.updateMany({
    where: { id: runRecord.id, teamId: args.teamId, status: "FAILED" },
    data: {
      status: retriedState.status,
      retryCount: { increment: 1 },
      errorCode: null,
      errorMessage: null,
    },
  });
  if (claimed.count !== 1) {
    throw new Error("PRESS_AGENT_RUN_RETRY_CONFLICT");
  }
  return continuePressAgentRun(
    {
      ...runRecord,
      status: retriedState.status,
      retryCount: retriedState.retryCount,
    },
    state,
    args.userId,
  );
}

export async function getPressAgentRun(args: {
  runId: string;
  teamId: string;
  userId?: string;
}) {
  const runRecord = await prisma.agentRun.findFirst({
    where: { id: args.runId, teamId: args.teamId },
    include: {
      steps: { orderBy: { sequence: "asc" } },
      approvals: { orderBy: { requestedAt: "asc" } },
      citations: { orderBy: { sourceId: "asc" } },
      feedbacks: args.userId
        ? { where: { userId: args.userId }, take: 1 }
        : false,
    },
  });
  if (!runRecord) throw new Error("PRESS_AGENT_RUN_NOT_FOUND");
  const {
    sdkState,
    input: _input,
    feedbacks,
    ...safeRunRecord
  } = runRecord;
  void _input;
  let canRetry = false;
  if (runRecord.status === "FAILED" && sdkState) {
    try {
      const payload = decryptPressAgentCheckpoint(
        sdkState,
        process.env.PRESS_AGENT_CHECKPOINT_KEY?.trim() ?? "",
        {
          runId: runRecord.id,
          teamId: runRecord.teamId,
          version: CHECKPOINT_VERSION,
        },
      );
      restorePressAgentCheckpoint(payload, {
        runId: runRecord.id,
        teamId: runRecord.teamId,
        agentVersion: PRESS_AGENT_VERSION,
      });
      canRetry = true;
    } catch {
      canRetry = false;
    }
  }
  return {
    ...safeRunRecord,
    operationId: readPressAgentOperationId(runRecord.input),
    canRetry,
    feedback: Array.isArray(feedbacks) ? (feedbacks[0] ?? null) : null,
  };
}
