import { PressTunerDebugRunSnapshotSchema, type PressTunerDebugRunSnapshot } from "@/domain/press-ai-debugger/presstunerDebugRunContract";

type Environment = Record<string, string | undefined>;
type Result = { status: "delivered" } | { status: "pending" | "terminal"; code: "OPS_CONSOLE_DISABLED" | "OPS_CONSOLE_TIMEOUT" | "OPS_CONSOLE_NETWORK_ERROR" | "OPS_CONSOLE_SERVER_ERROR" | "OPS_CONSOLE_AUTH_ERROR" | "OPS_CONSOLE_DELIVERY_CONFLICT" | "OPS_CONSOLE_CONTRACT_ERROR" | "OPS_CONSOLE_HTTP_ERROR" };

function configuration(environment: Environment) {
  if (environment.OPS_CONSOLE_PRESSTUNER_DEBUG_ENABLED === "false") return null;
  const base = environment.OPS_CONSOLE_AI_OPERATIONS_URL?.trim(); const key = environment.OPS_CONSOLE_AI_OPERATIONS_WRITE_KEY?.trim();
  if (!base || !key) return null;
  try { const url = new URL(base); if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null; return { url: `${url.toString().replace(/\/$/, "")}/api/ai-operations/v1/presstuner-debug-runs`, key }; } catch { return null; }
}

export function createPressTunerDebugSnapshotClient(dependencies: { environment?: Environment; fetch?: typeof fetch; timeoutMs?: number } = {}) {
  return async (input: PressTunerDebugRunSnapshot): Promise<Result> => {
    const config = configuration(dependencies.environment ?? process.env); if (!config) return { status: "pending", code: "OPS_CONSOLE_DISABLED" };
    let body: string; try { body = JSON.stringify(PressTunerDebugRunSnapshotSchema.parse(input)); } catch { return { status: "terminal", code: "OPS_CONSOLE_CONTRACT_ERROR" }; }
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), Math.min(3000, Math.max(1, dependencies.timeoutMs ?? 3000)));
    try {
      const response = await (dependencies.fetch ?? fetch)(config.url, { method: "POST", headers: { authorization: `Bearer ${config.key}`, "content-type": "application/json" }, body, signal: controller.signal });
      if (response.ok) return { status: "delivered" };
      if (response.status === 401 || response.status === 403) return { status: "terminal", code: "OPS_CONSOLE_AUTH_ERROR" };
      if (response.status === 409) return { status: "terminal", code: "OPS_CONSOLE_DELIVERY_CONFLICT" };
      if (response.status === 422 || response.status === 413) return { status: "terminal", code: "OPS_CONSOLE_CONTRACT_ERROR" };
      if (response.status >= 500) return { status: "pending", code: "OPS_CONSOLE_SERVER_ERROR" };
      return { status: "pending", code: "OPS_CONSOLE_HTTP_ERROR" };
    } catch (error) { return { status: "pending", code: controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError") ? "OPS_CONSOLE_TIMEOUT" : "OPS_CONSOLE_NETWORK_ERROR" }; }
    finally { clearTimeout(timeout); }
  };
}

export const deliverPressTunerDebugSnapshot = createPressTunerDebugSnapshotClient();
