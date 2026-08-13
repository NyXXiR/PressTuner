export const AI_PROCESS_CONSOLE_FACT_DESTINATION = "presstuner.ai-process-console.fact-ingest.v1" as const;

export type ConfigurationCode =
  | "VALID"
  | "DISABLED"
  | "DESTINATION_ID_REQUIRED"
  | "DESTINATION_UNKNOWN"
  | "DESTINATION_URL_REQUIRED"
  | "DESTINATION_URL_INVALID"
  | "DESTINATION_URL_UNSAFE"
  | "INBOUND_SECRET_INVALID"
  | "OUTBOUND_SECRET_INVALID"
  | "DIRECTIONAL_SECRETS_MUST_DIFFER"
  | "HTTP_TIMEOUT_INVALID"
  | "AUTH_MAX_SKEW_INVALID"
  | "FLUSH_BATCH_INVALID"
  | "RETENTION_DAYS_INVALID"
  | "RETENTION_BATCH_INVALID"
  | "PENDING_DEGRADED_AFTER_INVALID";

export type AiProcessConsoleAdapterSettings = Readonly<{
  destinationId: typeof AI_PROCESS_CONSOLE_FACT_DESTINATION;
  destinationUrl: URL;
  inboundHmacSecret: string;
  outboundHmacSecret: string;
  httpTimeoutMs: number;
  authMaxSkewSeconds: number;
  flushBatchSize: number;
  deliveredRetentionDays: number;
  retentionBatchSize: number;
  pendingDegradedAfterSeconds: number;
}>;

export type AiProcessConsoleAdapterConfiguration =
  | Readonly<{ status: "VALID"; code: "VALID"; settings: AiProcessConsoleAdapterSettings }>
  | Readonly<{ status: "DISABLED"; code: "DISABLED" }>
  | Readonly<{ status: "INVALID"; code: Exclude<ConfigurationCode, "VALID" | "DISABLED"> }>;

type Environment = Readonly<Record<string, string | undefined>>;
const invalid = (code: Exclude<ConfigurationCode, "VALID" | "DISABLED">): AiProcessConsoleAdapterConfiguration => ({ status: "INVALID", code });
const destinationRegistry = Object.freeze({
  [AI_PROCESS_CONSOLE_FACT_DESTINATION]: "AI_PROCESS_CONSOLE_DESTINATION_URL",
} as const);

function valid(settings: AiProcessConsoleAdapterSettings): AiProcessConsoleAdapterConfiguration {
  const result = { status: "VALID", code: "VALID" } as { status: "VALID"; code: "VALID"; settings: AiProcessConsoleAdapterSettings };
  Object.defineProperty(result, "settings", { value: Object.freeze(settings), enumerable: false, writable: false });
  return Object.freeze(result);
}

function parseBoundedInteger(value: string | undefined, defaultValue: number, minimum: number, maximum: number): number | null {
  if (value === undefined || value === "") return defaultValue;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function validatedDestinationUrl(raw: string | undefined, nodeEnv: string | undefined): URL | ConfigurationCode {
  if (!raw) return "DESTINATION_URL_REQUIRED";
  let destinationUrl: URL;
  try { destinationUrl = new URL(raw); }
  catch { return "DESTINATION_URL_INVALID"; }
  if (destinationUrl.username || destinationUrl.password || destinationUrl.search || destinationUrl.hash) return "DESTINATION_URL_UNSAFE";
  if (destinationUrl.protocol === "https:") return destinationUrl;
  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (destinationUrl.protocol === "http:" && nodeEnv !== "production" && loopbackHosts.has(destinationUrl.hostname)) return destinationUrl;
  return "DESTINATION_URL_UNSAFE";
}

function strongSecret(secret: string | undefined): secret is string {
  return typeof secret === "string" && Buffer.byteLength(secret, "utf8") >= 32;
}

export function resolveAiProcessConsoleFactDestination(destinationId: string | undefined, environment: Environment = process.env, nodeEnv: string | undefined = process.env.NODE_ENV): AiProcessConsoleAdapterConfiguration {
  if (!destinationId) return invalid("DESTINATION_ID_REQUIRED");
  if (!Object.hasOwn(destinationRegistry, destinationId)) return invalid("DESTINATION_UNKNOWN");
  const registeredDestinationId = destinationId as keyof typeof destinationRegistry;
  const destinationUrl = validatedDestinationUrl(environment[destinationRegistry[registeredDestinationId]], nodeEnv);
  if (!(destinationUrl instanceof URL)) return invalid(destinationUrl as Exclude<ConfigurationCode, "VALID" | "DISABLED">);
  const inboundHmacSecret = environment.AI_PROCESS_CONSOLE_INBOUND_HMAC_SECRET;
  const outboundHmacSecret = environment.AI_PROCESS_CONSOLE_OUTBOUND_HMAC_SECRET;
  if (!strongSecret(inboundHmacSecret)) return invalid("INBOUND_SECRET_INVALID");
  if (!strongSecret(outboundHmacSecret)) return invalid("OUTBOUND_SECRET_INVALID");
  if (inboundHmacSecret === outboundHmacSecret) return invalid("DIRECTIONAL_SECRETS_MUST_DIFFER");

  const httpTimeoutMs = parseBoundedInteger(environment.AI_PROCESS_CONSOLE_HTTP_TIMEOUT_MS, 3000, 100, 30_000);
  if (httpTimeoutMs === null) return invalid("HTTP_TIMEOUT_INVALID");
  const authMaxSkewSeconds = parseBoundedInteger(environment.AI_PROCESS_CONSOLE_AUTH_MAX_SKEW_SECONDS, 300, 30, 900);
  if (authMaxSkewSeconds === null) return invalid("AUTH_MAX_SKEW_INVALID");
  const flushBatchSize = parseBoundedInteger(environment.AI_PROCESS_CONSOLE_FLUSH_BATCH_SIZE, 50, 1, 500);
  if (flushBatchSize === null) return invalid("FLUSH_BATCH_INVALID");
  const deliveredRetentionDays = parseBoundedInteger(environment.AI_PROCESS_CONSOLE_DELIVERED_RETENTION_DAYS, 30, 7, 3650);
  if (deliveredRetentionDays === null) return invalid("RETENTION_DAYS_INVALID");
  const retentionBatchSize = parseBoundedInteger(environment.AI_PROCESS_CONSOLE_RETENTION_BATCH_SIZE, 250, 1, 1000);
  if (retentionBatchSize === null) return invalid("RETENTION_BATCH_INVALID");
  const pendingDegradedAfterSeconds = parseBoundedInteger(environment.AI_PROCESS_CONSOLE_PENDING_DEGRADED_AFTER_SECONDS, 900, 60, 86_400);
  if (pendingDegradedAfterSeconds === null) return invalid("PENDING_DEGRADED_AFTER_INVALID");

  return valid({ destinationId: registeredDestinationId, destinationUrl, inboundHmacSecret, outboundHmacSecret, httpTimeoutMs, authMaxSkewSeconds, flushBatchSize, deliveredRetentionDays, retentionBatchSize, pendingDegradedAfterSeconds });
}

export function loadAiProcessConsoleAdapterConfiguration(environment: Environment = process.env, nodeEnv: string | undefined = environment.NODE_ENV ?? process.env.NODE_ENV): AiProcessConsoleAdapterConfiguration {
  if (environment.AI_PROCESS_CONSOLE_ADAPTER_ENABLED !== "true") return { status: "DISABLED", code: "DISABLED" };
  return resolveAiProcessConsoleFactDestination(AI_PROCESS_CONSOLE_FACT_DESTINATION, environment, nodeEnv);
}

export function summarizeAiProcessConsoleAdapterConfiguration(configuration: AiProcessConsoleAdapterConfiguration): Readonly<{ valid: boolean; code: ConfigurationCode }> {
  return { valid: configuration.status === "VALID", code: configuration.code };
}
