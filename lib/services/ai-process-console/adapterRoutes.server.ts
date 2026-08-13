import { createAiProcessTestRunService } from "./testRunService";
import { loadAiProcessConsoleAdapterConfiguration, type AiProcessConsoleAdapterConfiguration, type AiProcessConsoleAdapterSettings } from "./adapterConfiguration.server";
import { createHttpAiProcessFactTransport } from "./httpFactTransport.server";
import type { AiProcessFactTransport } from "./factTransport";
import { classifyAiProcessProducerHealth, readAiProcessProducerHealth, type AiProcessProducerHealth } from "./producerHealth";
import { verifyAiProcessRequest } from "./requestAuthentication";

const TEST_RUN_PATHNAME = "/api/internal/ai-process-console/v1/test-runs";
const HEALTH_PATHNAME = "/api/internal/ai-process-console/v1/health";
const MAX_BODY_BYTES = 64 * 1024;

type TestRunService = Readonly<{ handle: (value: unknown) => Promise<unknown> }>;
type TestRunDependencies = Readonly<{
  loadConfiguration?: () => AiProcessConsoleAdapterConfiguration;
  clock?: () => Date;
  verifyRequest?: typeof verifyAiProcessRequest;
  createTransport?: (settings: AiProcessConsoleAdapterSettings) => AiProcessFactTransport;
  createService?: (args: { transport: AiProcessFactTransport }) => TestRunService;
}>;
type HealthDependencies = Readonly<{
  loadConfiguration?: () => AiProcessConsoleAdapterConfiguration;
  clock?: () => Date;
  verifyRequest?: typeof verifyAiProcessRequest;
  readHealth?: (args: { configuration: AiProcessConsoleAdapterConfiguration }) => Promise<AiProcessProducerHealth>;
}>;

const json = (body: unknown, status: number, noStore = false) => Response.json(body, { status, headers: noStore ? { "Cache-Control": "no-store" } : undefined });

export function createAiProcessTestRunPostHandler(dependencies: TestRunDependencies = {}) {
  return async function post(request: Request): Promise<Response> {
    const configuration = (dependencies.loadConfiguration ?? loadAiProcessConsoleAdapterConfiguration)();
    if (configuration.status !== "VALID") return json({ code: "ADAPTER_UNAVAILABLE" }, 503);
    const url = new URL(request.url);
    if (url.pathname !== TEST_RUN_PATHNAME || url.search !== "") return json({ code: "REQUEST_INVALID" }, 400);
    const mediaType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (mediaType !== "application/json") return json({ code: "JSON_REQUIRED" }, 415);
    const contentLength = request.headers.get("content-length");
    if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_BODY_BYTES) return json({ code: "REQUEST_TOO_LARGE" }, 413);

    let rawBodyBytes: Uint8Array;
    try { rawBodyBytes = new Uint8Array(await request.arrayBuffer()); }
    catch { return json({ code: "REQUEST_INVALID" }, 400); }
    if (rawBodyBytes.byteLength > MAX_BODY_BYTES) return json({ code: "REQUEST_TOO_LARGE" }, 413);
    const authenticated = (dependencies.verifyRequest ?? verifyAiProcessRequest)({
      secret: configuration.settings.inboundHmacSecret,
      timestamp: request.headers.get("x-ai-process-timestamp"),
      signature: request.headers.get("x-ai-process-signature"),
      method: request.method,
      pathname: url.pathname,
      body: rawBodyBytes,
      maxSkewSeconds: configuration.settings.authMaxSkewSeconds,
      clock: dependencies.clock,
    });
    if (!authenticated) return json({ code: "REQUEST_AUTHENTICATION_FAILED" }, 401);

    let input: unknown;
    try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(rawBodyBytes)); }
    catch { return json({ code: "REQUEST_INVALID" }, 400); }
    const createTransport = dependencies.createTransport ?? ((settings: AiProcessConsoleAdapterSettings) => createHttpAiProcessFactTransport({ destinationUrl: settings.destinationUrl, outboundHmacSecret: settings.outboundHmacSecret, timeoutMs: settings.httpTimeoutMs }));
    const transport = createTransport(configuration.settings);
    const service = (dependencies.createService ?? ((args: { transport: AiProcessFactTransport }) => createAiProcessTestRunService(args)))({ transport });
    try {
      const result = await service.handle(input);
      return json(result, 200);
    } catch (error) {
      if (error instanceof Error && error.message === "AI_PROCESS_COMMAND_REUSE_CONFLICT") return json({ code: "COMMAND_REUSE_CONFLICT" }, 409);
      return json({ code: "TEST_RUN_REQUEST_FAILED" }, 500);
    }
  };
}

export function createAiProcessConsoleHealthGetHandler(dependencies: HealthDependencies = {}) {
  return async function get(request: Request): Promise<Response> {
    const configuration = (dependencies.loadConfiguration ?? loadAiProcessConsoleAdapterConfiguration)();
    if (configuration.status !== "VALID") return json(classifyAiProcessProducerHealth({ configuration }), 503, true);
    const url = new URL(request.url);
    if (url.pathname !== HEALTH_PATHNAME || url.search !== "") return json({ code: "REQUEST_INVALID" }, 400, true);
    const authenticated = (dependencies.verifyRequest ?? verifyAiProcessRequest)({
      secret: configuration.settings.inboundHmacSecret,
      timestamp: request.headers.get("x-ai-process-timestamp"),
      signature: request.headers.get("x-ai-process-signature"),
      method: request.method,
      pathname: url.pathname,
      body: "",
      maxSkewSeconds: configuration.settings.authMaxSkewSeconds,
      clock: dependencies.clock,
    });
    if (!authenticated) return json({ code: "REQUEST_AUTHENTICATION_FAILED" }, 401, true);
    const health = await (dependencies.readHealth ?? readAiProcessProducerHealth)({ configuration });
    return json(health, health.readiness === "READY" ? 200 : 503, true);
  };
}
