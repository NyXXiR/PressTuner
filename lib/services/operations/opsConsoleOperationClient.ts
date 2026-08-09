import { createHash, randomUUID as nodeRandomUUID } from "node:crypto";

import {
  OpsProducerClient,
  ProducerClientError,
  type ExecutionFactBatch,
  type ProducerCapabilities,
  type WorkflowManifest,
} from "@nyxxir/ops-producer";

import type { PressAgentGuardrailVerdictRecord } from "@/domain/evaluation/pressAgentGuardrailSignals";
import { isSecureCredentialEndpoint } from "./credentialEndpointSecurity";

export const PRESS_AGENT_WORKFLOW_ID = "presstuner.press-agent";

/** Ops Console accepts at most 100 events per batch. */
const MAX_GUARDRAIL_EVENTS = 100;

type OperationEnvironment = Record<string, string | undefined>;
type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type OperationClientDependencies = {
  environment?: OperationEnvironment;
  fetch?: FetchImplementation;
  now?: () => Date;
  randomUUID?: () => string;
};

type OperationSuccess = {
  status: "registered" | "completed" | "reported";
  operationId: string;
  environment: string;
};

type OperationUnavailable = {
  status: "disabled" | "failed";
  code:
    | "OPS_CONSOLE_DISABLED"
    | "OPS_CONSOLE_INVALID_OPERATION_ID"
    | "OPS_CONSOLE_INVALID_TRACE_ID"
    | "OPS_CONSOLE_CAPABILITY_UNAVAILABLE"
    | "OPS_CONSOLE_PROTOCOL_ERROR"
    | "OPS_CONSOLE_HTTP_ERROR"
    | "OPS_CONSOLE_NETWORK_ERROR"
    | "OPS_CONSOLE_TIMEOUT";
  operationId: string;
  environment: string | null;
};

export type OpsConsoleOperationResult = OperationSuccess | OperationUnavailable;

type ClientConfiguration = {
  baseUrl: string;
  writeKey: string;
  environment: string;
  timeoutMs: number;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;
const ENVIRONMENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_TIMEOUT_MS = 10_000;
const CAPABILITY_CACHE_TTL_MS = 30_000;

export function pseudonymizeOperationReference(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function readConfiguration(
  environment: OperationEnvironment,
): ClientConfiguration | null {
  const rawUrl = environment.OPS_CONSOLE_AI_OPERATIONS_URL?.trim();
  const writeKey = environment.OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY?.trim();
  const operationEnvironment =
    environment.OPS_CONSOLE_AI_OPERATIONS_ENVIRONMENT?.trim();
  if (!rawUrl || !writeKey || !operationEnvironment) return null;
  if (!/^[A-Za-z0-9._~+/=-]{1,512}$/.test(writeKey)) return null;
  if (!ENVIRONMENT_PATTERN.test(operationEnvironment)) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (
    !isSecureCredentialEndpoint(url) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  const requestedTimeout = Number(
    environment.OPS_CONSOLE_AI_OPERATIONS_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS,
  );
  const timeoutMs = Number.isFinite(requestedTimeout)
    ? Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.floor(requestedTimeout)))
    : DEFAULT_TIMEOUT_MS;
  return {
    baseUrl: url.toString().replace(/\/$/, ""),
    writeKey,
    environment: operationEnvironment,
    timeoutMs,
  };
}

function disabled(operationId: string): OperationUnavailable {
  return {
    status: "disabled",
    code: "OPS_CONSOLE_DISABLED",
    operationId,
    environment: null,
  };
}

function failed(
  code: OperationUnavailable["code"],
  operationId: string,
  environment: string,
): OperationUnavailable {
  return { status: "failed", code, operationId, environment };
}

type TransportFailure = "timeout" | "network" | null;

async function runProducerClient<T>(args: {
  configuration: ClientConfiguration;
  fetch: FetchImplementation;
  operationId: string;
  action: (client: OpsProducerClient, transportFailure: () => TransportFailure) => Promise<T>;
}): Promise<{ ok: true; value: T } | { ok: false; result: OperationUnavailable }> {
  let transportFailure: TransportFailure = null;
  const timedFetch: typeof fetch = async (input, init) => {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        args.fetch(input, { ...init, signal: controller.signal }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            transportFailure = "timeout";
            controller.abort();
            reject(new DOMException("Timed out", "TimeoutError"));
          }, args.configuration.timeoutMs);
        }),
      ]);
    } catch (error) {
      if (transportFailure !== "timeout") transportFailure = "network";
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  };
  const client = new OpsProducerClient({
    baseUrl: args.configuration.baseUrl,
    writeKey: args.configuration.writeKey,
    fetch: timedFetch,
  });
  try {
    return { ok: true, value: await args.action(client, () => transportFailure) };
  } catch (error) {
    const code = transportFailure === "timeout"
      ? "OPS_CONSOLE_TIMEOUT"
      : transportFailure === "network"
        ? "OPS_CONSOLE_NETWORK_ERROR"
        : error instanceof ProducerClientError && error.status
          ? "OPS_CONSOLE_HTTP_ERROR"
          : "OPS_CONSOLE_PROTOCOL_ERROR";
    return { ok: false, result: failed(code, args.operationId, args.configuration.environment) };
  }
}

export function createOpsConsoleOperationClient(
  dependencies: OperationClientDependencies = {},
) {
  const environment = dependencies.environment ?? process.env;
  const fetchImpl = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  const randomUUID = dependencies.randomUUID ?? nodeRandomUUID;
  let capabilityCache:
    | { expiresAt: number; value: ProducerCapabilities | null }
    | undefined;

  const getProducerCapabilities = async (client: OpsProducerClient) => {
    const nowMs = now().getTime();
    if (capabilityCache && capabilityCache.expiresAt > nowMs) {
      return capabilityCache.value;
    }
    const value = await client.getProducerCapabilities();
    capabilityCache = { expiresAt: nowMs + CAPABILITY_CACHE_TTL_MS, value };
    return value;
  };

  return {
    environment(): string | null {
      return readConfiguration(environment)?.environment ?? null;
    },

    async begin(args: {
      teamId: string;
      userId: string;
      workflowVersion: string;
      workflowManifest?: WorkflowManifest;
      traceId: string;
    }): Promise<OpsConsoleOperationResult> {
      const operationId = randomUUID();
      const configuration = readConfiguration(environment);
      if (!configuration) return disabled(operationId);
      if (!TRACE_ID_PATTERN.test(args.traceId)) {
        return failed("OPS_CONSOLE_INVALID_TRACE_ID", operationId, configuration.environment);
      }
      const timestamp = now().toISOString();
      const outcome = await runProducerClient({
        configuration,
        fetch: fetchImpl,
        operationId,
        action: async (client, transportFailure) => {
          if (args.workflowManifest) {
            if (
              args.workflowManifest.workflow.version !== args.workflowVersion ||
              args.workflowManifest.protocolVersion !== "ops-console/producer-protocol/v1"
            ) {
              throw new ProducerClientError("PRODUCER_REQUEST_INVALID");
            }
            const capabilities = await getProducerCapabilities(client);
            if (
              !capabilities ||
              transportFailure() ||
              !capabilities.acceptedProtocolVersions.includes(args.workflowManifest.protocolVersion) ||
              !args.workflowManifest.capabilities.every((capability) =>
                capabilities.capabilities.includes(capability)
              )
            ) {
              return { capabilityUnavailable: true } as const;
            }
            await client.registerWorkflow(args.workflowManifest);
          }
          await client.registerOperation({
            schemaVersion: "ops-console/operation-registration/v1",
            operationId,
            traceId: args.traceId,
            workflow: args.workflowManifest?.workflow ?? {
              id: PRESS_AGENT_WORKFLOW_ID,
              version: args.workflowVersion,
            },
            tenantRef: pseudonymizeOperationReference(args.teamId),
            environment: configuration.environment,
            actor: {
              type: "human",
              reference: pseudonymizeOperationReference(args.userId),
            },
            startedAt: timestamp,
            registeredAt: timestamp,
          });
          return { capabilityUnavailable: false } as const;
        },
      });
      if (outcome.ok === false) return outcome.result;
      if (outcome.value.capabilityUnavailable) {
        return failed("OPS_CONSOLE_CAPABILITY_UNAVAILABLE", operationId, configuration.environment);
      }
      return { status: "registered", operationId, environment: configuration.environment };
    },

    async appendExecutionFacts(args: {
      batch: ExecutionFactBatch;
    }): Promise<OpsConsoleOperationResult> {
      const operationId = args.batch.facts[0]?.operationId ?? "";
      const configuration = readConfiguration(environment);
      if (!configuration) return disabled(operationId);
      if (!UUID_PATTERN.test(operationId)) {
        return failed("OPS_CONSOLE_INVALID_OPERATION_ID", operationId, configuration.environment);
      }
      const outcome = await runProducerClient({
        configuration,
        fetch: fetchImpl,
        operationId,
        action: (client) => client.appendExecutionFacts(args.batch),
      });
      if (outcome.ok === false) return outcome.result;
      return { status: "reported", operationId, environment: configuration.environment };
    },

    async reportGuardrails(args: {
      operationId: string;
      verdicts: readonly PressAgentGuardrailVerdictRecord[];
      occurredAt?: Date;
    }): Promise<OpsConsoleOperationResult> {
      const configuration = readConfiguration(environment);
      if (!configuration) return disabled(args.operationId);
      if (!UUID_PATTERN.test(args.operationId)) {
        return failed("OPS_CONSOLE_INVALID_OPERATION_ID", args.operationId, configuration.environment);
      }
      if (!args.verdicts.length) {
        return { status: "reported", operationId: args.operationId, environment: configuration.environment };
      }
      const timestamp = (args.occurredAt ?? now()).toISOString();
      const outcome = await runProducerClient({
        configuration,
        fetch: fetchImpl,
        operationId: args.operationId,
        action: (client) => client.pushOperationEvents({
          schemaVersion: "ops-console/operation-events-batch/v1",
          events: args.verdicts.slice(0, MAX_GUARDRAIL_EVENTS).map((entry) => ({
            eventId: randomUUID(),
            operationId: args.operationId,
            occurredAt: timestamp,
            observedAt: timestamp,
            providerId: "opentelemetry",
            providerRecordId: `guardrail:${entry.stageId}:${entry.guardrailId}`,
            signal: {
              kind: "quality",
              metricId: "guardrail_verdict",
              value: entry.verdict === "violation" ? 1 : 0,
              unit: "violations",
              sampleCount: 1,
              direction: "lower_is_better",
              stageId: entry.stageId,
              guardrailId: entry.guardrailId,
              verdict: entry.verdict,
            },
          })),
        }),
      });
      if (outcome.ok === false) return outcome.result;
      return { status: "reported", operationId: args.operationId, environment: configuration.environment };
    },

    async complete(args: {
      operationId: string;
      completedAt?: Date;
    }): Promise<OpsConsoleOperationResult> {
      const configuration = readConfiguration(environment);
      if (!configuration) return disabled(args.operationId);
      if (!UUID_PATTERN.test(args.operationId)) {
        return failed("OPS_CONSOLE_INVALID_OPERATION_ID", args.operationId, configuration.environment);
      }
      const outcome = await runProducerClient({
        configuration,
        fetch: fetchImpl,
        operationId: args.operationId,
        action: (client) => client.completeOperation(args.operationId, {
          schemaVersion: "ops-console/operation-completion/v1",
          completedAt: (args.completedAt ?? now()).toISOString(),
        }),
      });
      if (outcome.ok === false) return outcome.result;
      return { status: "completed", operationId: args.operationId, environment: configuration.environment };
    },
  };
}

const defaultClient = createOpsConsoleOperationClient();

export const beginOpsConsoleOperation = defaultClient.begin;
export const appendOpsConsoleExecutionFacts = defaultClient.appendExecutionFacts;
export const completeOpsConsoleOperation = defaultClient.complete;
export const reportOpsConsoleGuardrails = defaultClient.reportGuardrails;
export const readOpsConsoleOperationEnvironment = defaultClient.environment;
