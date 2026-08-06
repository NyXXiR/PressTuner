import { buildOtlpTraceRequest, type OtlpTraceRequest } from "@/domain/ai-telemetry/otlpProjection";
import { readCanonicalRunTelemetryRaw } from "./telemetryReadService";
import { createHash } from "node:crypto";

export const DEFAULT_OTLP_TIMEOUT_MS = 3_000;
export const MAX_OTLP_TIMEOUT_MS = 10_000;
export const DEFAULT_OTLP_BATCH_SIZE = 200;
export const DEFAULT_OTLP_RETRY_MAX_ATTEMPTS = 3;
export const DEFAULT_OTLP_RETRY_BASE_MS = 500;
export const MAX_OTLP_RETRY_BASE_MS = 5_000;

export type OtlpExporterConfiguration = {
  baseUrl: string;
  writeKey: string;
  timeoutMs: number;
  sampleRate: number;
  retryMaxAttempts: number;
  retryBaseMs: number;
};

export type OtlpExporterDependencies = {
  environment?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  readTelemetry?: typeof readCanonicalRunTelemetryRaw;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

const WRITE_KEY_PATTERN = /^[A-Za-z0-9._~+/=-]{1,512}$/;

export function readOtlpExporterConfiguration(environment: Record<string, string | undefined> = process.env): OtlpExporterConfiguration | null {
  const rawUrl = environment.OPS_CONSOLE_OTLP_TRACES_URL?.trim();
  const writeKey = environment.OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY?.trim();
  if (!rawUrl || !writeKey || !WRITE_KEY_PATTERN.test(writeKey)) return null;

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;

  const requestedTimeout = Number(environment.OPS_CONSOLE_OTLP_TRACES_TIMEOUT_MS ?? DEFAULT_OTLP_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(requestedTimeout) ? Math.min(MAX_OTLP_TIMEOUT_MS, Math.max(1, Math.floor(requestedTimeout))) : DEFAULT_OTLP_TIMEOUT_MS;

  const requestedSampleRate = Number(environment.OPS_CONSOLE_OTLP_TRACES_SAMPLE_RATE ?? 1);
  const sampleRate = Number.isFinite(requestedSampleRate) ? Math.min(1, Math.max(0, requestedSampleRate)) : 1;

  const requestedRetryAttempts = Number(environment.OPS_CONSOLE_OTLP_TRACES_RETRY_MAX_ATTEMPTS ?? DEFAULT_OTLP_RETRY_MAX_ATTEMPTS);
  const retryMaxAttempts = Math.max(0, Number.isFinite(requestedRetryAttempts) ? Math.floor(requestedRetryAttempts) : DEFAULT_OTLP_RETRY_MAX_ATTEMPTS);

  const requestedRetryBase = Number(environment.OPS_CONSOLE_OTLP_TRACES_RETRY_BASE_MS ?? DEFAULT_OTLP_RETRY_BASE_MS);
  const retryBaseMs = Number.isFinite(requestedRetryBase)
    ? Math.min(MAX_OTLP_RETRY_BASE_MS, Math.max(1, Math.floor(requestedRetryBase)))
    : DEFAULT_OTLP_RETRY_BASE_MS;

  return { baseUrl: url.toString().replace(/\/$/, ""), writeKey, timeoutMs, sampleRate, retryMaxAttempts, retryBaseMs };
}

export type OtlpExportResult =
  | { status: "exported"; spans: number }
  | { status: "disabled" }
  | { status: "empty" }
  | { status: "sampled_out" }
  | { status: "failed"; code: "OTLP_HTTP_ERROR" | "OTLP_NETWORK_ERROR" | "OTLP_TIMEOUT" | "OTLP_INVALID"; retryable: boolean };

export function createOtlpExporter(dependencies: OtlpExporterDependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  const fetchImpl = dependencies.fetch ?? fetch;
  const readTelemetry = dependencies.readTelemetry ?? readCanonicalRunTelemetryRaw;
  const now = dependencies.now ?? (() => new Date());
  const sleep = dependencies.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));

  return {
    async exportRunTelemetry(args: { teamId: string; runId: string }): Promise<OtlpExportResult> {
      const configuration = readOtlpExporterConfiguration(environment);
      if (!configuration) return { status: "disabled" };
      if (!isRunSampled(args.teamId, args.runId, configuration.sampleRate)) return { status: "sampled_out" };

      const events: Awaited<ReturnType<typeof readTelemetry>> = [];
      let afterSequence: number | undefined = undefined;
      while (events.length < DEFAULT_OTLP_BATCH_SIZE * 100) {
        const readArgs: { teamId: string; runId: string; limit: number; afterSequence?: number } = { teamId: args.teamId, runId: args.runId, limit: DEFAULT_OTLP_BATCH_SIZE };
        if (afterSequence !== undefined) readArgs.afterSequence = afterSequence;
        const batch = await readTelemetry(readArgs);
        if (!batch.length) break;
        events.push(...batch);
        const last = batch.at(-1);
        afterSequence = last?.sequence;
        if (batch.length < DEFAULT_OTLP_BATCH_SIZE) break;
      }

      if (!events.length) return { status: "empty" };

      let exportedSpans = 0;
      let lastResult: OtlpExportResult | null = null;
      for (let index = 0; index < events.length; index += DEFAULT_OTLP_BATCH_SIZE) {
        const batch = events.slice(index, index + DEFAULT_OTLP_BATCH_SIZE);
        const request = buildOtlpTraceRequest(batch);
        const result = await sendOtlpTraceRequestWithRetry({ fetch: fetchImpl, configuration, request, now, sleep });
        lastResult = result;
        if (result.status === "exported") {
          exportedSpans += result.spans;
        } else if (result.status === "failed") {
          return result;
        }
      }

      if (lastResult?.status === "exported") return { status: "exported", spans: exportedSpans };
      return { status: "empty" };
    },
  };
}

function isRunSampled(teamId: string, runId: string, sampleRate: number): boolean {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;
  const hash = createHash("sha256").update(`${teamId}:${runId}`).digest("hex");
  const bucket = Number.parseInt(hash.slice(0, 8), 16) / 0xffffffff;
  return bucket < sampleRate;
}

async function sendOtlpTraceRequestWithRetry(args: {
  fetch: typeof fetch;
  configuration: OtlpExporterConfiguration;
  request: OtlpTraceRequest;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}): Promise<OtlpExportResult> {
  let lastResult: OtlpExportResult | null = null;
  for (let attempt = 0; attempt <= args.configuration.retryMaxAttempts; attempt += 1) {
    const result = await sendOtlpTraceRequest({ fetch: args.fetch, configuration: args.configuration, request: args.request, now: args.now });
    lastResult = result;
    if (result.status === "exported" || result.status === "failed" && !result.retryable) return result;
    if (attempt < args.configuration.retryMaxAttempts) {
      const delay = Math.min(args.configuration.retryBaseMs * 2 ** attempt, MAX_OTLP_RETRY_BASE_MS) + Math.floor(Math.random() * 100);
      await args.sleep(delay);
    }
  }
  return lastResult ?? { status: "failed", code: "OTLP_NETWORK_ERROR", retryable: true };
}

async function sendOtlpTraceRequest(args: {
  fetch: typeof fetch;
  configuration: OtlpExporterConfiguration;
  request: OtlpTraceRequest;
  now: () => Date;
}): Promise<OtlpExportResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.configuration.timeoutMs);
  try {
    const response = await args.fetch(args.configuration.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${args.configuration.writeKey}`,
      },
      body: JSON.stringify(args.request),
      signal: controller.signal,
    });
    if (!response.ok) {
      return { status: "failed", code: "OTLP_HTTP_ERROR", retryable: response.status >= 500 || response.status === 429 };
    }
    return { status: "exported", spans: args.request.resourceSpans[0]?.scopeSpans[0]?.spans.length ?? 0 };
  } catch (error) {
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "TimeoutError")) {
      return { status: "failed", code: "OTLP_TIMEOUT", retryable: true };
    }
    return { status: "failed", code: "OTLP_NETWORK_ERROR", retryable: true };
  } finally {
    clearTimeout(timeout);
  }
}

export const defaultOtlpExporter = createOtlpExporter();
export const exportRunTelemetry = defaultOtlpExporter.exportRunTelemetry;
