import type { AiProcessFactTransport } from "./factTransport";
import { flushAiProcessFactOutbox } from "./factOutbox";
import { loadAiProcessConsoleAdapterConfiguration, summarizeAiProcessConsoleAdapterConfiguration, type AiProcessConsoleAdapterConfiguration, type AiProcessConsoleAdapterSettings } from "./adapterConfiguration.server";
import { createHttpAiProcessFactTransport } from "./httpFactTransport.server";
import { retainDeliveredAiProcessFacts } from "./deliveredFactRetention";
import { readAiProcessProducerHealth, type AiProcessProducerHealth } from "./producerHealth";

type WorkerDependencies = Readonly<{
  loadConfiguration?: () => AiProcessConsoleAdapterConfiguration;
  createTransport?: (settings: AiProcessConsoleAdapterSettings) => AiProcessFactTransport;
  flush?: (args: { transport: AiProcessFactTransport; limit: number }) => Promise<void>;
  retain?: (args: { retentionDays: number; batchSize: number }) => Promise<Readonly<{ selectedCount: number; deletedCount: number }>>;
  readHealth?: (args: { configuration: AiProcessConsoleAdapterConfiguration }) => Promise<AiProcessProducerHealth>;
}>;

export type AiProcessConsoleProducerWorkerResult = Readonly<{
  exitCode: 0 | 1;
  configuration: Readonly<{ valid: boolean; code: string }>;
  flush: "SKIPPED" | "COMPLETED" | "FAILED";
  retention: "SKIPPED" | "COMPLETED" | "FAILED";
  retainedCount: number;
  health: AiProcessProducerHealth | null;
}>;

export async function runAiProcessConsoleProducerWorker(dependencies: WorkerDependencies = {}): Promise<AiProcessConsoleProducerWorkerResult> {
  const configuration = (dependencies.loadConfiguration ?? loadAiProcessConsoleAdapterConfiguration)();
  const summary = summarizeAiProcessConsoleAdapterConfiguration(configuration);
  if (configuration.status !== "VALID") return { exitCode: configuration.status === "INVALID" ? 1 : 0, configuration: summary, flush: "SKIPPED", retention: "SKIPPED", retainedCount: 0, health: null };
  const createTransport = dependencies.createTransport ?? ((settings: AiProcessConsoleAdapterSettings) => createHttpAiProcessFactTransport({ destinationUrl: settings.destinationUrl, outboundHmacSecret: settings.outboundHmacSecret, timeoutMs: settings.httpTimeoutMs }));
  const transport = createTransport(configuration.settings);
  let flush: "COMPLETED" | "FAILED" = "COMPLETED";
  try { await (dependencies.flush ?? flushAiProcessFactOutbox)({ transport, limit: configuration.settings.flushBatchSize }); }
  catch { flush = "FAILED"; }
  let retention: "COMPLETED" | "FAILED" = "COMPLETED";
  let retainedCount = 0;
  try {
    const result = await (dependencies.retain ?? retainDeliveredAiProcessFacts)({ retentionDays: configuration.settings.deliveredRetentionDays, batchSize: configuration.settings.retentionBatchSize });
    retainedCount = result.deletedCount;
  } catch { retention = "FAILED"; }
  let health: AiProcessProducerHealth;
  try { health = await (dependencies.readHealth ?? readAiProcessProducerHealth)({ configuration }); }
  catch { health = { schemaVersion: "presstuner-ai-process-producer-health/v1", readiness: "NOT_READY", configuration: summary, pendingCount: null, deadLetterCount: null, oldestPendingAgeSeconds: null, lastSuccessfulDeliveryAt: null, reasonCodes: ["HEALTH_QUERY_FAILED"] }; }
  return { exitCode: 0, configuration: summary, flush, retention, retainedCount, health };
}
