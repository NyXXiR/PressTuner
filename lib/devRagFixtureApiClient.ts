import {
  parseDevRagFixtureDomain,
  type DevRagFixtureDomain,
  type DevRagFixtureState,
} from "@/domain/dev-rag-fixtures/contracts";

export type DevRagFixtureExchange = {
  method: "GET" | "PUT";
  path: string;
  request: unknown;
  response: unknown;
  status: number | null;
  timestamp: string;
};

export class DevRagFixtureApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number | null,
    readonly exchange: DevRagFixtureExchange,
  ) {
    super(message);
    this.name = "DevRagFixtureApiError";
  }
}
type Options = {
  fetch?: typeof fetch;
  now?: () => Date;
  onExchange?: (exchange: DevRagFixtureExchange) => void;
};

const SENSITIVE_KEY = /authorization|cookie|token|secret|password/i;

function sanitize(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        sanitize(child, childKey),
      ]),
    );
  }
  return value;
}

function isState(value: unknown): value is DevRagFixtureState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<DevRagFixtureState>;
  return (
    (state.domain === "PRESS" || state.domain === "RESUME") &&
    typeof state.mounted === "boolean" &&
    typeof state.fixtureVersion === "string" &&
    typeof state.summary === "string" &&
    typeof state.resourceVersion === "number" &&
    Boolean(state.scope) &&
    (state.scope?.kind === "TEAM" || state.scope?.kind === "USER") &&
    typeof state.scope?.id === "string"
  );
}

export function createDevRagFixtureApiClient(options: Options = {}) {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());

  const observe = (exchange: DevRagFixtureExchange) => {
    try {
      options.onExchange?.(exchange);
    } catch {
      // Diagnostics must not change the request outcome.
    }
  };

  async function request(
    method: "GET" | "PUT",
    path: string,
    body?: { mounted: boolean },
  ) {
    const init: RequestInit = { method };
    if (method === "GET") init.cache = "no-store";
    if (body) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify({ mounted: body.mounted });
    }
    try {
      const response = await fetchImpl(path, init);
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      const exchange: DevRagFixtureExchange = {
        method,
        path,
        request: sanitize(body ?? null),
        response: sanitize(parsed),
        status: response.status,
        timestamp: now().toISOString(),
      };
      observe(exchange);
      const record =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null;
      if (!response.ok) {
        throw new DevRagFixtureApiError(
          typeof record?.message === "string"
            ? record.message
            : typeof record?.error === "string"
              ? record.error
              : `Request failed (${response.status})`,
          typeof record?.code === "string"
            ? record.code
            : typeof record?.error === "string"
              ? record.error
              : "DEV_RAG_FIXTURE_API_ERROR",
          response.status,
          exchange,
        );
      }
      return { parsed, exchange };
    } catch (cause) {
      if (cause instanceof DevRagFixtureApiError) throw cause;
      const exchange: DevRagFixtureExchange = {
        method,
        path,
        request: sanitize(body ?? null),
        response: { error: "NETWORK_ERROR", message: "Network request failed" },
        status: null,
        timestamp: now().toISOString(),
      };
      observe(exchange);
      throw new DevRagFixtureApiError(
        "Network request failed",
        "NETWORK_ERROR",
        null,
        exchange,
      );
    }
  }

  return {
    async read() {
      const { parsed, exchange } = await request(
        "GET",
        "/api/dev/api-playground/rag",
      );
      const record =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null;
      const fixtures = record?.fixtures;
      if (!Array.isArray(fixtures) || !fixtures.every(isState)) {
        throw new DevRagFixtureApiError(
          "Malformed fixture status response",
          "MALFORMED_SUCCESS_RESPONSE",
          exchange.status,
          exchange,
        );
      }
      return fixtures;
    },

    async setMounted(domain: DevRagFixtureDomain, mounted: boolean) {
      const routeDomain = domain.toLowerCase();
      if (!parseDevRagFixtureDomain(routeDomain)) {
        throw new Error("Unsupported fixture domain");
      }
      const { parsed, exchange } = await request(
        "PUT",
        `/api/dev/api-playground/rag/${routeDomain}`,
        { mounted },
      );
      const record =
        parsed && typeof parsed === "object"
          ? (parsed as Record<string, unknown>)
          : null;
      const state = record?.fixture;
      if (!isState(state) || state.domain !== domain) {
        throw new DevRagFixtureApiError(
          "Malformed fixture mutation response",
          "MALFORMED_SUCCESS_RESPONSE",
          exchange.status,
          exchange,
        );
      }
      return state;
    },
  };
}
