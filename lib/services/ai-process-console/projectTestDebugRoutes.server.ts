import { loadAiProcessConsoleAdapterConfiguration, type AiProcessConsoleAdapterConfiguration } from "./adapterConfiguration.server";
import { verifyAiProcessRequest } from "./requestAuthentication";
import { authorizeProjectTestDebugSession } from "./projectTestDebugAuthorization.server";
import { inspectProjectTestSnapshotV2, replayProjectTestTransitionV2 } from "./projectTestDebugService";

const MAXIMUM_BODY_BYTES = 65_536;
const OPERATOR_AUTHORIZATION_PATH = "/api/ai-process-console/v2/operator-authorizations";
const SNAPSHOT_PATH = "/api/ai-process-console/v2/test-snapshots";
const REPLAY_PATH = "/api/ai-process-console/v2/transition-replays";

type Dependencies = {
  loadConfiguration?: () => AiProcessConsoleAdapterConfiguration;
  clock?: () => Date;
  authorize?: typeof authorizeProjectTestDebugSession;
  inspect?: typeof inspectProjectTestSnapshotV2;
  replay?: typeof replayProjectTestTransitionV2;
};

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function createProjectTestDebugPostHandler(pathname: typeof OPERATOR_AUTHORIZATION_PATH | typeof SNAPSHOT_PATH | typeof REPLAY_PATH, dependencies: Dependencies = {}) {
  return async function post(request: Request): Promise<Response> {
    const configuration = (dependencies.loadConfiguration ?? loadAiProcessConsoleAdapterConfiguration)();
    if (configuration.status !== "VALID") return json({ code: "ADAPTER_UNAVAILABLE" }, 503);
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== pathname || url.search !== "") return json({ code: "REQUEST_INVALID" }, 400);
    if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return json({ code: "JSON_REQUIRED" }, 415);
    const declared = request.headers.get("content-length");
    if (declared && /^\d+$/u.test(declared) && Number(declared) > MAXIMUM_BODY_BYTES) return json({ code: "REQUEST_TOO_LARGE" }, 413);
    let bytes: Uint8Array;
    try { bytes = new Uint8Array(await request.arrayBuffer()); } catch { return json({ code: "REQUEST_INVALID" }, 400); }
    if (bytes.byteLength > MAXIMUM_BODY_BYTES) return json({ code: "REQUEST_TOO_LARGE" }, 413);
    if (!verifyAiProcessRequest({
      secret: configuration.settings.inboundHmacSecret,
      timestamp: request.headers.get("x-ai-process-timestamp"),
      signature: request.headers.get("x-ai-process-signature"),
      method: request.method,
      pathname,
      body: bytes,
      maxSkewSeconds: configuration.settings.authMaxSkewSeconds,
      clock: dependencies.clock,
    })) return json({ code: "REQUEST_AUTHENTICATION_FAILED" }, 401);
    let input: unknown;
    try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return json({ code: "REQUEST_INVALID" }, 400); }
    try {
      const result = pathname === OPERATOR_AUTHORIZATION_PATH
        ? await (dependencies.authorize ?? authorizeProjectTestDebugSession)(input)
        : pathname === SNAPSHOT_PATH
          ? await (dependencies.inspect ?? inspectProjectTestSnapshotV2)(input)
          : await (dependencies.replay ?? replayProjectTestTransitionV2)(input);
      return json(result, 200);
    } catch {
      return json({ code: "PROJECT_TEST_DEBUG_FAILED" }, 500);
    }
  };
}

export const PROJECT_TEST_DEBUG_OPERATOR_AUTHORIZATION_PATH = OPERATOR_AUTHORIZATION_PATH;
export const PROJECT_TEST_DEBUG_SNAPSHOT_PATH = SNAPSHOT_PATH;
export const PROJECT_TEST_DEBUG_REPLAY_PATH = REPLAY_PATH;
