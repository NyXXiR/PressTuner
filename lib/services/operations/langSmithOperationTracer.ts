import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID as nodeRandomUUID } from "node:crypto";

import { Client } from "langsmith";
import { convertToDottedOrderFormat } from "langsmith/run_trees";

import {
  PRESS_AGENT_RAG_FEEDBACK_CRITERIA_V1,
  type PressAgentRagFeedback,
} from "@/domain/evaluation/pressAgentRagFeedbackCriteria";

type TraceEnvironment = Record<string, string | undefined>;
type Phase = "initial" | "continuation";

export type LangSmithRagStageId =
  | "retrieval-execution"
  | "evidence-decision"
  | "response-behavior"
  | "verification"
  | "fallback";

type EvidenceReasonCode =
  | "NO_SELECTED_EVIDENCE"
  | "BELOW_MINIMUM_SCORE"
  | "EVIDENCE_TOO_SHORT"
  | "NUMERIC_SPAN_MISSING"
  | "DOCUMENT_DIVERSITY_MISSING"
  | "SOURCE_COUNT_MISSING";

export type LangSmithRagStageObservation = {
  "retrieval-execution": Readonly<{ selectedSourceCount: number; eligibleSourceCount: number; terminalStatus: "COMPLETED" }>;
  "evidence-decision": Readonly<{ action: "ANSWER" | "ABSTAIN" | "COMPARE_SOURCES"; code: "EVIDENCE_SUFFICIENT" | "INSUFFICIENT_EVIDENCE" | "SOURCE_CONFLICT"; reasonCodes: readonly EvidenceReasonCode[]; conflictCount: number; decisionInputHash: string }>;
  "response-behavior": Readonly<{ status: "ANSWER" | "ABSTENTION"; finalCitationCount: number; claimCount: number }>;
  verification: Readonly<{ status: "PASS" | "FAIL"; supportedClaimCount: number; totalClaimCount: number }>;
  fallback: Readonly<{ mode: "EXTRACTIVE" | "ABSTENTION"; postFallbackVerificationStatus: "PASS" | "FAIL" }>;
};

type SafeMetadata = {
  operation_id: string;
  workflow_id: string;
  workflow_version: string;
  phase: Phase;
  stage_id?: LangSmithRagStageId;
  environment?: string;
};

type LangSmithRunCreate = {
  id: string;
  trace_id: string;
  parent_run_id?: string;
  start_time: number;
  dotted_order: string;
  name: string;
  run_type: "chain" | "retriever";
  project_name: string;
  inputs: { phase: Phase } | { stage: LangSmithRagStageId };
  extra: { metadata: SafeMetadata };
};

type LangSmithRunUpdate = {
  end_time: number;
  outputs: { status: "completed" | "failed"; observation?: LangSmithRagStageObservation[LangSmithRagStageId] };
  error?: string;
};

type LangSmithFeedbackCreate = {
  runId: string;
  sessionId: string;
  key: string;
  score: number;
  feedbackSourceType: "app";
  extendTraceRetention: false;
};

export type LangSmithTraceClient = {
  createRun(run: LangSmithRunCreate): Promise<void>;
  updateRun(id: string, run: LangSmithRunUpdate): Promise<void>;
  createFeedback(feedback: LangSmithFeedbackCreate): Promise<unknown>;
};

type ClientConfiguration = {
  apiKey: string;
  apiUrl: string;
  workspaceId?: string;
  projectName: string;
  projectId?: string;
  timeoutMs: number;
};

type TracerDependencies = {
  environment?: TraceEnvironment;
  randomUUID?: () => string;
  now?: () => number;
  createDottedOrder?: (epoch: number, runId: string) => string;
  createClient?: (configuration: ClientConfiguration) => LangSmithTraceClient;
};

type ActiveRun = {
  client: LangSmithTraceClient;
  configuration: ClientConfiguration;
  rootId: string;
  traceId: string;
  runId: string;
  dottedOrder: string;
  operationId: string;
  workflowId: string;
  workflowVersion: string;
  phase: Phase;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_ENDPOINT = "https://api.smith.langchain.com";
const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_TIMEOUT_MS = 10_000;
const feedbackKeys = new Set<string>(PRESS_AGENT_RAG_FEEDBACK_CRITERIA_V1.map(({ criterionId }) => criterionId));

function readConfiguration(environment: TraceEnvironment): ClientConfiguration | null {
  const apiKey = environment.LANGSMITH_API_KEY?.trim();
  const projectName = environment.LANGSMITH_PROJECT?.trim();
  if (!apiKey || !projectName || projectName.length > 200) return null;
  let endpoint: URL;
  try {
    endpoint = new URL(environment.LANGSMITH_ENDPOINT?.trim() || DEFAULT_ENDPOINT);
  } catch {
    return null;
  }
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) return null;
  const requestedTimeout = Number(environment.LANGSMITH_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const projectId = environment.LANGSMITH_PROJECT_ID?.trim();
  return {
    apiKey,
    apiUrl: endpoint.toString().replace(/\/$/, ""),
    workspaceId: environment.LANGSMITH_WORKSPACE_ID?.trim() || undefined,
    projectName,
    projectId: projectId && UUID_PATTERN.test(projectId) ? projectId : undefined,
    timeoutMs: Number.isFinite(requestedTimeout) ? Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.floor(requestedTimeout))) : DEFAULT_TIMEOUT_MS,
  };
}

function defaultCreateClient(configuration: ClientConfiguration): LangSmithTraceClient {
  const client = new Client({
    apiKey: configuration.apiKey,
    apiUrl: configuration.apiUrl,
    workspaceId: configuration.workspaceId,
    timeout_ms: configuration.timeoutMs,
    autoBatchTracing: false,
    hideInputs: false,
    hideOutputs: false,
    omitTracedRuntimeInfo: true,
  });
  return {
    createRun: (run) => client.createRun(run),
    updateRun: (id, run) => client.updateRun(id, run),
    createFeedback: (feedback) => client.createFeedback(feedback),
  };
}

function safeErrorClass(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  return /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(error.name) ? error.name : "Error";
}

function stageRunType(stageId: LangSmithRagStageId): "retriever" | "chain" {
  return stageId === "retrieval-execution" ? "retriever" : "chain";
}

function nonnegativeCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function sanitizeStageObservation<S extends LangSmithRagStageId>(
  stageId: S,
  observation: LangSmithRagStageObservation[S],
): LangSmithRagStageObservation[S] {
  switch (stageId) {
    case "retrieval-execution": {
      const value = observation as LangSmithRagStageObservation["retrieval-execution"];
      return { selectedSourceCount: nonnegativeCount(value.selectedSourceCount), eligibleSourceCount: nonnegativeCount(value.eligibleSourceCount), terminalStatus: "COMPLETED" } as unknown as LangSmithRagStageObservation[S];
    }
    case "evidence-decision": {
      const value = observation as LangSmithRagStageObservation["evidence-decision"];
      const actions = new Set(["ANSWER", "ABSTAIN", "COMPARE_SOURCES"]);
      const codes = new Set(["EVIDENCE_SUFFICIENT", "INSUFFICIENT_EVIDENCE", "SOURCE_CONFLICT"]);
      const reasons = new Set<EvidenceReasonCode>(["NO_SELECTED_EVIDENCE", "BELOW_MINIMUM_SCORE", "EVIDENCE_TOO_SHORT", "NUMERIC_SPAN_MISSING", "DOCUMENT_DIVERSITY_MISSING", "SOURCE_COUNT_MISSING"]);
      return {
        action: actions.has(value.action) ? value.action : "ABSTAIN",
        code: codes.has(value.code) ? value.code : "INSUFFICIENT_EVIDENCE",
        reasonCodes: value.reasonCodes.filter((reason) => reasons.has(reason)),
        conflictCount: nonnegativeCount(value.conflictCount),
        decisionInputHash: /^[a-f0-9]{64}$/.test(value.decisionInputHash) ? value.decisionInputHash : "",
      } as unknown as LangSmithRagStageObservation[S];
    }
    case "response-behavior": {
      const value = observation as LangSmithRagStageObservation["response-behavior"];
      return { status: value.status === "ANSWER" ? "ANSWER" : "ABSTENTION", finalCitationCount: nonnegativeCount(value.finalCitationCount), claimCount: nonnegativeCount(value.claimCount) } as unknown as LangSmithRagStageObservation[S];
    }
    case "verification": {
      const value = observation as LangSmithRagStageObservation["verification"];
      return { status: value.status === "PASS" ? "PASS" : "FAIL", supportedClaimCount: nonnegativeCount(value.supportedClaimCount), totalClaimCount: nonnegativeCount(value.totalClaimCount) } as unknown as LangSmithRagStageObservation[S];
    }
    case "fallback": {
      const value = observation as LangSmithRagStageObservation["fallback"];
      return { mode: value.mode === "EXTRACTIVE" ? "EXTRACTIVE" : "ABSTENTION", postFallbackVerificationStatus: value.postFallbackVerificationStatus === "PASS" ? "PASS" : "FAIL" } as unknown as LangSmithRagStageObservation[S];
    }
  }
}

export function createLangSmithOperationTracer(dependencies: TracerDependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  const randomUUID = dependencies.randomUUID ?? nodeRandomUUID;
  const now = dependencies.now ?? Date.now;
  const createDottedOrder = dependencies.createDottedOrder ?? ((epoch: number, runId: string) => convertToDottedOrderFormat(epoch, runId).dottedOrder);
  const createClient = dependencies.createClient ?? defaultCreateClient;
  const activeRuns = new AsyncLocalStorage<ActiveRun>();
  let configured: { configuration: ClientConfiguration; client: LangSmithTraceClient } | null | undefined;

  function readConfiguredClient() {
    if (configured !== undefined) return configured;
    const configuration = readConfiguration(environment);
    if (!configuration) return (configured = null);
    try {
      return (configured = { configuration, client: createClient(configuration) });
    } catch {
      return (configured = null);
    }
  }

  async function traceRagStage<T, S extends LangSmithRagStageId>(args: {
    stageId: S;
    execute: () => Promise<T>;
    observe: (result: T) => LangSmithRagStageObservation[S];
  }): Promise<T> {
    const parent = activeRuns.getStore();
    if (!parent) return args.execute();
    const runId = randomUUID();
    const startedAt = now();
    const dottedOrder = `${parent.dottedOrder}.${createDottedOrder(startedAt, runId)}`;
    let created = false;
    try {
      await parent.client.createRun({
        id: runId,
        trace_id: parent.traceId,
        parent_run_id: parent.runId,
        start_time: startedAt,
        dotted_order: dottedOrder,
        name: `Press Agent ${args.stageId}`,
        run_type: stageRunType(args.stageId),
        project_name: parent.configuration.projectName,
        inputs: { stage: args.stageId },
        extra: { metadata: { operation_id: parent.operationId, workflow_id: parent.workflowId, workflow_version: parent.workflowVersion, phase: parent.phase, stage_id: args.stageId } },
      });
      created = true;
    } catch {
      // Stage telemetry is fail-open.
    }
    const child = { ...parent, runId, dottedOrder };
    try {
      const result = await activeRuns.run(created ? child : parent, args.execute);
      if (created) {
        try {
          await parent.client.updateRun(runId, { end_time: now(), outputs: { status: "completed", observation: sanitizeStageObservation(args.stageId, args.observe(result)) } });
        } catch {
          // Stage telemetry is fail-open.
        }
      }
      return result;
    } catch (error) {
      if (created) {
        try {
          await parent.client.updateRun(runId, { end_time: now(), outputs: { status: "failed" }, error: safeErrorClass(error) });
        } catch {
          // Preserve the original runtime failure.
        }
      }
      throw error;
    }
  }

  async function recordRagObservation<S extends LangSmithRagStageId>(stageId: S, observation: LangSmithRagStageObservation[S]): Promise<void> {
    await traceRagStage({ stageId, execute: async () => undefined, observe: () => observation });
  }

  async function reportRootFeedback(feedback: readonly PressAgentRagFeedback[]): Promise<void> {
    const active = activeRuns.getStore();
    if (!active?.configuration.projectId || active.runId !== active.rootId) return;
    const safeFeedback = feedback.filter((item) => feedbackKeys.has(item.key) && (item.score === 0 || item.score === 1) && item.direction === "higher_is_better" && item.unit === "score");
    await Promise.allSettled(safeFeedback.map(async (item) => {
      await active.client.createFeedback({
        runId: active.rootId,
        sessionId: active.configuration.projectId!,
        key: item.key,
        score: item.score,
        feedbackSourceType: "app",
        extendTraceRetention: false,
      });
    }));
  }

  function hex32ToUuid(value: string): string {
    const lower = value.toLowerCase();
    return `${lower.slice(0, 8)}-${lower.slice(8, 12)}-${lower.slice(12, 16)}-${lower.slice(16, 20)}-${lower.slice(20, 32)}`;
  }

  async function trace<T>(args: { operationId: string | null; traceId?: string | null; workflowId: string; workflowVersion: string; environment: string; phase: Phase; execute: () => Promise<T> }): Promise<T> {
    if (!args.operationId || !UUID_PATTERN.test(args.operationId)) return args.execute();
    const active = readConfiguredClient();
    if (!active) return args.execute();
    const runId = randomUUID();
    const traceId = args.traceId && /^[0-9a-f]{32}$/i.test(args.traceId) ? hex32ToUuid(args.traceId) : runId;
    const startedAt = now();
    const dottedOrder = createDottedOrder(startedAt, runId);
    try {
      await active.client.createRun({
        id: runId,
        trace_id: traceId,
        start_time: startedAt,
        dotted_order: dottedOrder,
        name: "PressTuner Press Agent operation",
        run_type: "chain",
        project_name: active.configuration.projectName,
        inputs: { phase: args.phase },
        extra: { metadata: { operation_id: args.operationId, workflow_id: args.workflowId, workflow_version: args.workflowVersion, environment: args.environment, phase: args.phase } },
      });
    } catch {
      return args.execute();
    }
    const root: ActiveRun = { client: active.client, configuration: active.configuration, rootId: runId, traceId, runId, dottedOrder, operationId: args.operationId, workflowId: args.workflowId, workflowVersion: args.workflowVersion, phase: args.phase };
    try {
      const result = await activeRuns.run(root, args.execute);
      try {
        await active.client.updateRun(runId, { end_time: now(), outputs: { status: "completed" } });
      } catch {
        // The Agent result remains authoritative when telemetry fails.
      }
      return result;
    } catch (error) {
      try {
        await active.client.updateRun(runId, { end_time: now(), outputs: { status: "failed" }, error: safeErrorClass(error) });
      } catch {
        // Preserve the original Agent failure.
      }
      throw error;
    }
  }

  return { trace, traceRagStage, recordRagObservation, reportRootFeedback };
}

const defaultTracer = createLangSmithOperationTracer();

export const traceLangSmithOperation = defaultTracer.trace;
export const traceLangSmithRagStage = defaultTracer.traceRagStage;
export const recordLangSmithRagObservation = defaultTracer.recordRagObservation;
export const reportLangSmithRootFeedback = defaultTracer.reportRootFeedback;
