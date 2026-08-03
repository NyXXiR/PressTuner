export type PressTone = "formal" | "neutral" | "friendly";
export type PressArticleStatus =
  | "BRIEF"
  | "DRAFT"
  | "IN_PROGRESS"
  | "DECLINED"
  | "FINAL";

export type PressFlowExchange = {
  method: string;
  path: string;
  request: unknown;
  response: unknown;
  timestamp: string;
  status: number | null;
};

export class PressFlowApiError extends Error {
  readonly status: number | null;
  readonly code: string;
  readonly response: unknown;
  readonly exchange: PressFlowExchange;

  constructor(args: {
    message: string;
    status: number | null;
    code: string;
    response: unknown;
    exchange: PressFlowExchange;
  }) {
    super(args.message);
    this.name = "PressFlowApiError";
    this.status = args.status;
    this.code = args.code;
    this.response = args.response;
    this.exchange = args.exchange;
  }
}

export type InitializeArticleInput = {
  type: "PRESS_RELEASE" | "BLOG_POST" | "NEWSLETTER" | "OTHER";
  teamId?: string;
  [key: string]: unknown;
};

export type NormalizeBriefInput = {
  rawText: string;
  tone: PressTone;
  quotaMode?: "simplified";
  teamId?: string;
};

export type GenerateArticleInput = {
  teamId?: string;
  serviceName?: string;
  announceType: string;
  oneLiner?: string;
  points: string[];
  quoteMessage?: string;
  quoteWho?: string;
  tone: PressTone;
  rawText?: string;
  eventAt?: string;
  publishAt?: string;
  quotaMode?: "simplified";
};

export type VerificationState = {
  freshness: "CURRENT" | "STALE";
  verification: {
    result: "PASS" | "WARN" | "BLOCK";
    findings: Array<{
      id: string;
      claim: string;
      explanation: string;
      result: "PASS" | "WARN" | "BLOCK";
    }>;
  } | null;
};

type ClientOptions = {
  fetch?: typeof fetch;
  now?: () => Date;
  onExchange?: (exchange: PressFlowExchange) => void;
};

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY = /authorization|cookie|token|secret|password/i;

function sanitize(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key)) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (childValue !== undefined) {
        output[childKey] = sanitize(childValue, childKey);
      }
    }
    return output;
  }
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return value === undefined ? null : String(value);
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorCode(response: unknown, fallback: string) {
  if (!response || typeof response !== "object") return fallback;
  const body = response as Record<string, unknown>;
  return typeof body.error === "string"
    ? body.error
    : typeof body.code === "string"
      ? body.code
      : fallback;
}

function errorMessage(response: unknown, fallback: string) {
  if (!response || typeof response !== "object") return fallback;
  const body = response as Record<string, unknown>;
  return typeof body.message === "string"
    ? body.message
    : typeof body.error === "string"
      ? body.error
      : fallback;
}

export function createPressFlowApiClient(options: ClientOptions = {}) {
  const fetchImpl = options.fetch ?? fetch;
  const now = options.now ?? (() => new Date());

  function observe(exchange: PressFlowExchange) {
    try {
      options.onExchange?.(exchange);
    } catch {
      // Diagnostics must never change the production request outcome.
    }
  }

  async function request<T>(
    method: string,
    path: string,
    requestBody?: unknown,
    init: RequestInit = {},
    validate?: (
      response: T,
    ) => { code: string; message: string } | null,
  ): Promise<T> {
    const requestInit: RequestInit = { ...init, method };
    if (requestBody !== undefined) {
      requestInit.headers = { "Content-Type": "application/json" };
      requestInit.body = JSON.stringify(requestBody);
    }

    try {
      const response = await fetchImpl(path, requestInit);
      const parsed = await parseResponse(response);
      const exchange: PressFlowExchange = {
        method,
        path,
        request: sanitize(requestBody ?? null),
        response: sanitize(parsed),
        timestamp: now().toISOString(),
        status: response.status,
      };
      observe(exchange);
      if (!response.ok) {
        throw new PressFlowApiError({
          message: errorMessage(parsed, `Request failed (${response.status})`),
          status: response.status,
          code: errorCode(parsed, "PRESS_FLOW_API_ERROR"),
          response: parsed,
          exchange,
        });
      }
      const validationError = validate?.(parsed as T);
      if (validationError) {
        throw new PressFlowApiError({
          message: validationError.message,
          status: response.status,
          code: validationError.code,
          response: parsed,
          exchange,
        });
      }
      return parsed as T;
    } catch (cause) {
      if (cause instanceof PressFlowApiError) throw cause;
      const safeResponse = {
        error: "NETWORK_ERROR",
        message: "Network request failed",
      };
      const exchange: PressFlowExchange = {
        method,
        path,
        request: sanitize(requestBody ?? null),
        response: safeResponse,
        timestamp: now().toISOString(),
        status: null,
      };
      observe(exchange);
      throw new PressFlowApiError({
        message: safeResponse.message,
        status: null,
        code: safeResponse.error,
        response: safeResponse,
        exchange,
      });
    }
  }

  return {
    async initializeArticle(input: InitializeArticleInput) {
      const response = await request<Record<string, unknown>>(
        "POST",
        "/api/articles/init",
        input,
        {},
        (body) =>
          typeof body.id === "string" || typeof body.articleId === "string"
            ? null
            : {
                code: "ARTICLE_ID_MISSING",
                message: "문서 초기화 응답에 id가 없습니다.",
              },
      );
      const articleId =
        typeof response.id === "string"
          ? response.id
          : typeof response.articleId === "string"
            ? response.articleId
            : null;
      // The request validator guarantees an ID before this transport result
      // reaches production state mapping.
      if (!articleId) throw new Error("unreachable");
      return { ...response, id: articleId, articleId };
    },

    normalizeBrief(articleId: string, input: NormalizeBriefInput) {
      return request<Record<string, any>>(
        "POST",
        `/api/articles/${encodeURIComponent(articleId)}/brief/normalize`,
        input,
      );
    },

    generateArticle(articleId: string, input: GenerateArticleInput) {
      return request<Record<string, any>>(
        "POST",
        `/api/articles/${encodeURIComponent(articleId)}/generate`,
        input,
      );
    },

    readGrounding(articleId: string) {
      return request<Record<string, any>>(
        "GET",
        `/api/articles/${encodeURIComponent(articleId)}/grounding`,
        undefined,
        { cache: "no-store" },
      );
    },

    decideGroundingCandidate(
      articleId: string,
      candidateId: string,
      decision: "ACCEPTED" | "REJECTED",
    ) {
      return request<Record<string, any>>(
        "PATCH",
        `/api/articles/${encodeURIComponent(articleId)}/grounding/candidates/${encodeURIComponent(candidateId)}`,
        { decision },
      );
    },

    readVerification(articleId: string, teamId?: string | null) {
      const query = new URLSearchParams();
      if (teamId) query.set("teamId", teamId);
      const suffix = query.size ? `?${query.toString()}` : "";
      return request<VerificationState & Record<string, any>>(
        "GET",
        `/api/articles/${encodeURIComponent(articleId)}/verification${suffix}`,
        undefined,
        { cache: "no-store" },
      );
    },

    runVerification(articleId: string, input: { teamId?: string } = {}) {
      return request<Record<string, any>>(
        "POST",
        `/api/articles/${encodeURIComponent(articleId)}/verification`,
        input,
      );
    },

    updateStatus(
      articleId: string,
      input: { status: PressArticleStatus; teamId?: string },
    ) {
      return request<Record<string, any>>(
        "PATCH",
        `/api/articles/${encodeURIComponent(articleId)}/status`,
        input,
      );
    },
  };
}
