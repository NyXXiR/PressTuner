import { createHash, randomUUID as nodeRandomUUID } from "node:crypto";

import type { PressAgentGuardrailVerdictRecord } from "@/domain/evaluation/pressAgentGuardrailSignals";
import { CANONICAL_TELEMETRY_PRODUCER_ID } from "@/domain/ai-telemetry/opsConsoleProjection";

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
const ENVIRONMENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/i;
const DEFAULT_TIMEOUT_MS = 3_000;
const MAX_TIMEOUT_MS = 10_000;

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
    !["http:", "https:"].includes(url.protocol) ||
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

async function request(args: {
  configuration: ClientConfiguration;
  fetch: FetchImplementation;
  url: string;
  body: Record<string, unknown>;
  operationId: string;
}): Promise<OpsConsoleOperationResult> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      args.fetch(args.url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${args.configuration.writeKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(args.body),
        signal: controller.signal,
      }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new DOMException("Timed out", "TimeoutError"));
        }, args.configuration.timeoutMs);
      }),
    ]);
    if (!response.ok) {
      return {
        status: "failed",
        code: "OPS_CONSOLE_HTTP_ERROR",
        operationId: args.operationId,
        environment: args.configuration.environment,
      };
    }
    return {
      status: args.body.schemaVersion === "ops-console/operation-registration/v1"
        ? "registered"
        : args.body.schemaVersion === "ops-console/operation-events-batch/v1"
          ? "reported"
          : "completed",
      operationId: args.operationId,
      environment: args.configuration.environment,
    };
  } catch (error) {
    return {
      status: "failed",
      code:
        controller.signal.aborted ||
        (error instanceof DOMException && error.name === "TimeoutError")
          ? "OPS_CONSOLE_TIMEOUT"
          : "OPS_CONSOLE_NETWORK_ERROR",
      operationId: args.operationId,
      environment: args.configuration.environment,
    };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function createOpsConsoleOperationClient(
  dependencies: OperationClientDependencies = {},
) {
  const environment = dependencies.environment ?? process.env;
  const fetchImpl = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? (() => new Date());
  const randomUUID = dependencies.randomUUID ?? nodeRandomUUID;

  return {
    environment(): string | null {
      return readConfiguration(environment)?.environment ?? null;
    },

    async begin(args: {
      teamId: string;
      userId: string;
      workflowVersion: string;
    }): Promise<OpsConsoleOperationResult> {
      const operationId = randomUUID();
      const configuration = readConfiguration(environment);
      if (!configuration) return disabled(operationId);
      const timestamp = now().toISOString();
      return request({
        configuration,
        fetch: fetchImpl,
        url: `${configuration.baseUrl}/api/ai-operations/v1/operations`,
        operationId,
        body: {
          schemaVersion: "ops-console/operation-registration/v1",
          operationId,
          workflow: {
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
        },
      });
    },

    /**
     * Reports guardrail verdicts for a finished operation. Ops Console attributes each
     * verdict to the workflow stage it names, so its report can point at the stage that
     * broke a rule. Reporting nothing is valid: an absent verdict reads as "not checked".
     */
    async reportGuardrails(args: {
      operationId: string;
      verdicts: readonly PressAgentGuardrailVerdictRecord[];
      occurredAt?: Date;
    }): Promise<OpsConsoleOperationResult> {
      const configuration = readConfiguration(environment);
      if (!configuration) return disabled(args.operationId);
      if (!UUID_PATTERN.test(args.operationId)) {
        return {
          status: "failed",
          code: "OPS_CONSOLE_INVALID_OPERATION_ID",
          operationId: args.operationId,
          environment: configuration.environment,
        };
      }
      if (!args.verdicts.length) {
        return { status: "reported", operationId: args.operationId, environment: configuration.environment };
      }

      const timestamp = (args.occurredAt ?? now()).toISOString();
      return request({
        configuration,
        fetch: fetchImpl,
        url: `${configuration.baseUrl}/api/ai-operations/v1/events`,
        operationId: args.operationId,
        body: {
          schemaVersion: "ops-console/operation-events-batch/v1",
          events: args.verdicts.slice(0, MAX_GUARDRAIL_EVENTS).map((entry) => ({
            eventId: randomUUID(),
            operationId: args.operationId,
            occurredAt: timestamp,
            observedAt: timestamp,
            providerId: CANONICAL_TELEMETRY_PRODUCER_ID,
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
        },
      });
    },

    async complete(args: {
      operationId: string;
      completedAt?: Date;
    }): Promise<OpsConsoleOperationResult> {
      const configuration = readConfiguration(environment);
      if (!configuration) return disabled(args.operationId);
      if (!UUID_PATTERN.test(args.operationId)) {
        return {
          status: "failed",
          code: "OPS_CONSOLE_INVALID_OPERATION_ID",
          operationId: args.operationId,
          environment: configuration.environment,
        };
      }
      return request({
        configuration,
        fetch: fetchImpl,
        url: `${configuration.baseUrl}/api/ai-operations/v1/operations/${args.operationId}/complete`,
        operationId: args.operationId,
        body: {
          schemaVersion: "ops-console/operation-completion/v1",
          completedAt: (args.completedAt ?? now()).toISOString(),
        },
      });
    },
  };
}

const defaultClient = createOpsConsoleOperationClient();

export const beginOpsConsoleOperation = defaultClient.begin;
export const completeOpsConsoleOperation = defaultClient.complete;
export const reportOpsConsoleGuardrails = defaultClient.reportGuardrails;
export const readOpsConsoleOperationEnvironment = defaultClient.environment;
