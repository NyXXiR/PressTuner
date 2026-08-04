import { randomUUID as nodeRandomUUID } from "node:crypto";

import { Client } from "langsmith";
import { convertToDottedOrderFormat } from "langsmith/run_trees";

type TraceEnvironment = Record<string, string | undefined>;

type LangSmithRunCreate = {
  id: string;
  trace_id: string;
  start_time: number;
  dotted_order: string;
  name: string;
  run_type: "chain";
  project_name: string;
  inputs: { phase: "initial" | "continuation" };
  extra: {
    metadata: {
      operation_id: string;
      workflow_id: string;
      workflow_version: string;
      environment: string;
      phase: "initial" | "continuation";
    };
  };
};

type LangSmithRunUpdate = {
  end_time: number;
  outputs: { status: "completed" | "failed" };
  error?: string;
};

export type LangSmithTraceClient = {
  createRun(run: LangSmithRunCreate): Promise<void>;
  updateRun(id: string, run: LangSmithRunUpdate): Promise<void>;
};

type ClientConfiguration = {
  apiKey: string;
  apiUrl: string;
  workspaceId?: string;
  projectName: string;
  timeoutMs: number;
};

type TracerDependencies = {
  environment?: TraceEnvironment;
  randomUUID?: () => string;
  now?: () => number;
  createDottedOrder?: (epoch: number, runId: string) => string;
  createClient?: (configuration: ClientConfiguration) => LangSmithTraceClient;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_ENDPOINT = "https://api.smith.langchain.com";
const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_TIMEOUT_MS = 10_000;

function readConfiguration(
  environment: TraceEnvironment,
): ClientConfiguration | null {
  const apiKey = environment.LANGSMITH_API_KEY?.trim();
  const projectName = environment.LANGSMITH_PROJECT?.trim();
  if (!apiKey || !projectName || projectName.length > 200) return null;

  let endpoint: URL;
  try {
    endpoint = new URL(
      environment.LANGSMITH_ENDPOINT?.trim() || DEFAULT_ENDPOINT,
    );
  } catch {
    return null;
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    return null;
  }

  const requestedTimeout = Number(
    environment.LANGSMITH_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
  );
  return {
    apiKey,
    apiUrl: endpoint.toString().replace(/\/$/, ""),
    workspaceId: environment.LANGSMITH_WORKSPACE_ID?.trim() || undefined,
    projectName,
    timeoutMs: Number.isFinite(requestedTimeout)
      ? Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.floor(requestedTimeout)))
      : DEFAULT_TIMEOUT_MS,
  };
}

function defaultCreateClient(
  configuration: ClientConfiguration,
): LangSmithTraceClient {
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
  };
}

function safeErrorClass(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  return /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(error.name)
    ? error.name
    : "Error";
}

export function createLangSmithOperationTracer(
  dependencies: TracerDependencies = {},
) {
  const environment = dependencies.environment ?? process.env;
  const randomUUID = dependencies.randomUUID ?? nodeRandomUUID;
  const now = dependencies.now ?? Date.now;
  const createDottedOrder =
    dependencies.createDottedOrder ??
    ((epoch: number, runId: string) =>
      convertToDottedOrderFormat(epoch, runId).dottedOrder);
  const createClient = dependencies.createClient ?? defaultCreateClient;
  let configured:
    | { configuration: ClientConfiguration; client: LangSmithTraceClient }
    | null
    | undefined;

  function readConfiguredClient() {
    if (configured !== undefined) return configured;
    const configuration = readConfiguration(environment);
    if (!configuration) {
      configured = null;
      return configured;
    }
    try {
      configured = { configuration, client: createClient(configuration) };
    } catch {
      configured = null;
    }
    return configured;
  }

  return {
    async trace<T>(args: {
      operationId: string | null;
      workflowId: string;
      workflowVersion: string;
      environment: string;
      phase: "initial" | "continuation";
      execute: () => Promise<T>;
    }): Promise<T> {
      if (!args.operationId || !UUID_PATTERN.test(args.operationId)) {
        return args.execute();
      }
      const active = readConfiguredClient();
      if (!active) return args.execute();

      const runId = randomUUID();
      const startedAt = now();
      let created = false;
      try {
        await active.client.createRun({
          id: runId,
          trace_id: runId,
          start_time: startedAt,
          dotted_order: createDottedOrder(startedAt, runId),
          name: "PressTuner Press Agent operation",
          run_type: "chain",
          project_name: active.configuration.projectName,
          inputs: { phase: args.phase },
          extra: {
            metadata: {
              operation_id: args.operationId,
              workflow_id: args.workflowId,
              workflow_version: args.workflowVersion,
              environment: args.environment,
              phase: args.phase,
            },
          },
        });
        created = true;
      } catch {
        // Telemetry delivery must never prevent the Agent from running.
      }

      try {
        const result = await args.execute();
        if (created) {
          try {
            await active.client.updateRun(runId, {
              end_time: now(),
              outputs: { status: "completed" },
            });
          } catch {
            // The Agent result remains authoritative when telemetry fails.
          }
        }
        return result;
      } catch (error) {
        if (created) {
          try {
            await active.client.updateRun(runId, {
              end_time: now(),
              outputs: { status: "failed" },
              error: safeErrorClass(error),
            });
          } catch {
            // Preserve the original Agent failure.
          }
        }
        throw error;
      }
    },
  };
}

const defaultTracer = createLangSmithOperationTracer();

export const traceLangSmithOperation = defaultTracer.trace;
