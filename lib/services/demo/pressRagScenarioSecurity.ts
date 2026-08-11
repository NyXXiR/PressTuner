import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import {
  PUBLIC_PRESS_RAG_COOKIE,
  PUBLIC_PRESS_RAG_LIMITS,
  type PublicPressRagAttempt,
} from "@/domain/demo/pressRagScenarioContract";

export type PublicPressRagSession = {
  sid: string;
  starts: number[];
  runs: Record<string, { revision: number; commands: number }>;
};

export type PublicPressRagCapabilityState = {
  v: 1;
  sid: string;
  runId: string;
  issuedAt: number;
  expiresAt: number;
  commandsUsed: number;
  attempt: PublicPressRagAttempt;
  ancestors: PublicPressRagAttempt[];
};

export class PressRagSecurityError extends Error {
  constructor(
    readonly code: string,
    readonly status: 401 | 409 | 410 | 429 | 503,
    readonly details: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
const sign = (body: string, secret: string) =>
  createHmac("sha256", secret).update(body).digest("base64url");

function signed<T>(value: T, secret: string) {
  const body = encode(value);
  return `${body}.${sign(body, secret)}`;
}

function verifySigned(value: string, secret: string): unknown {
  const [body, signature, extra] = value.split(".");
  if (!body || !signature || extra) {
    throw new PressRagSecurityError("PRESS_RAG_SESSION_INVALID", 401);
  }
  const expected = Buffer.from(sign(body, secret));
  const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new PressRagSecurityError("PRESS_RAG_SESSION_INVALID", 401);
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new PressRagSecurityError("PRESS_RAG_SESSION_INVALID", 401);
  }
}

export function validatePressRagSigningSecret(value: string | undefined) {
  if (!value || value.length < 32 || /\s/u.test(value) || new Set(value).size < 12) {
    throw new PressRagSecurityError("PRESS_RAG_SIGNING_UNAVAILABLE", 503);
  }
  return value;
}

export function resolvePressRagSigningSecret(
  env: { PRESS_RAG_DEMO_SIGNING_SECRET?: string; AI_QA_AUTH_SECRET?: string } = {
    PRESS_RAG_DEMO_SIGNING_SECRET: process.env.PRESS_RAG_DEMO_SIGNING_SECRET,
    AI_QA_AUTH_SECRET: process.env.AI_QA_AUTH_SECRET,
  },
) {
  return validatePressRagSigningSecret(
    env.PRESS_RAG_DEMO_SIGNING_SECRET || env.AI_QA_AUTH_SECRET,
  );
}

function isSession(value: unknown): value is PublicPressRagSession {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).sort().join(",") !== "runs,sid,starts") return false;
  return (
    typeof item.sid === "string" &&
    /^[A-Za-z0-9_-]{16,80}$/u.test(item.sid) &&
    Array.isArray(item.starts) &&
    item.starts.length <= PUBLIC_PRESS_RAG_LIMITS.starts &&
    item.starts.every((entry) => Number.isSafeInteger(entry) && Number(entry) >= 0) &&
    Boolean(item.runs) &&
    typeof item.runs === "object" &&
    !Array.isArray(item.runs) &&
    Object.keys(item.runs as object).length <= PUBLIC_PRESS_RAG_LIMITS.starts
  );
}

export function createPressRagSession(): PublicPressRagSession {
  return { sid: randomBytes(18).toString("base64url"), starts: [], runs: {} };
}

export function readPressRagSession(cookie: string | undefined, secret: string) {
  if (!cookie) return createPressRagSession();
  if (Buffer.byteLength(cookie, "utf8") > 24 * 1024) {
    throw new PressRagSecurityError("PRESS_RAG_SESSION_INVALID", 401);
  }
  const decoded = verifySigned(cookie, secret);
  if (!isSession(decoded)) {
    throw new PressRagSecurityError("PRESS_RAG_SESSION_INVALID", 401);
  }
  for (const run of Object.values(decoded.runs)) {
    if (
      !run ||
      !Number.isSafeInteger(run.revision) ||
      run.revision < 0 ||
      !Number.isSafeInteger(run.commands) ||
      run.commands < 0 ||
      run.commands > PUBLIC_PRESS_RAG_LIMITS.commandBudget
    ) {
      throw new PressRagSecurityError("PRESS_RAG_SESSION_INVALID", 401);
    }
    if (Object.keys(run).sort().join(",") !== "commands,revision") {
      throw new PressRagSecurityError("PRESS_RAG_SESSION_INVALID", 401);
    }
  }
  return decoded;
}

export function writePressRagSession(session: PublicPressRagSession, secret: string) {
  return signed(session, secret);
}

export function pressRagSessionCookie(value: string, production = process.env.NODE_ENV === "production") {
  return [
    `${PUBLIC_PRESS_RAG_COOKIE}=${value}`,
    "Path=/api/demo/press-rag-scenario",
    "HttpOnly",
    "SameSite=Lax",
    production ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

export function acceptPressRagStart(session: PublicPressRagSession, now = Date.now()) {
  const floor = now - PUBLIC_PRESS_RAG_LIMITS.windowSeconds * 1000;
  const starts = session.starts.filter((timestamp) => timestamp > floor && timestamp <= now);
  if (starts.length >= PUBLIC_PRESS_RAG_LIMITS.starts) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((starts[0] + PUBLIC_PRESS_RAG_LIMITS.windowSeconds * 1000 - now) / 1000),
    );
    throw new PressRagSecurityError("PRESS_RAG_START_QUOTA_EXHAUSTED", 429, {
      remainingStarts: 0,
      retryAfterSeconds,
    });
  }
  return {
    ...session,
    starts: [...starts, now],
  };
}

export function pressRagQuota(session: PublicPressRagSession, now = Date.now()) {
  const floor = now - PUBLIC_PRESS_RAG_LIMITS.windowSeconds * 1000;
  const starts = session.starts.filter((timestamp) => timestamp > floor && timestamp <= now);
  return {
    remainingStarts: Math.max(0, PUBLIC_PRESS_RAG_LIMITS.starts - starts.length),
    retryAfterSeconds:
      starts.length >= PUBLIC_PRESS_RAG_LIMITS.starts
        ? Math.max(1, Math.ceil((starts[0] + PUBLIC_PRESS_RAG_LIMITS.windowSeconds * 1000 - now) / 1000))
        : 0,
  };
}

export function registerPressRagRun(
  session: PublicPressRagSession,
  runId: string,
  revision = 0,
) {
  const retainedRuns = Object.fromEntries(
    Object.entries(session.runs).slice(-(PUBLIC_PRESS_RAG_LIMITS.starts - 1)),
  );
  return {
    ...session,
    runs: { ...retainedRuns, [runId]: { revision, commands: 0 } },
  };
}

export function encodePressRagCapability(
  state: PublicPressRagCapabilityState,
  secret: string,
) {
  const token = signed(state, secret);
  if (Buffer.byteLength(token, "utf8") > PUBLIC_PRESS_RAG_LIMITS.capabilityBytes) {
    throw new PressRagSecurityError("PRESS_RAG_CAPABILITY_TOO_LARGE", 410);
  }
  return token;
}

export function decodePressRagCapability(
  token: string,
  session: PublicPressRagSession,
  secret: string,
  now = Date.now(),
) {
  if (Buffer.byteLength(token, "utf8") > PUBLIC_PRESS_RAG_LIMITS.capabilityBytes) {
    throw new PressRagSecurityError("PRESS_RAG_CAPABILITY_TOO_LARGE", 410);
  }
  let value: unknown;
  try {
    value = verifySigned(token, secret);
  } catch (error) {
    if (error instanceof PressRagSecurityError) {
      throw new PressRagSecurityError("PRESS_RAG_CAPABILITY_INVALID", 401);
    }
    throw error;
  }
  const state = value as Partial<PublicPressRagCapabilityState>;
  if (
    !value ||
    typeof value !== "object" ||
    Object.keys(value).sort().join(",") !== "ancestors,attempt,commandsUsed,expiresAt,issuedAt,runId,sid,v"
  ) throw new PressRagSecurityError("PRESS_RAG_CAPABILITY_INVALID", 401);
  const validAttempt = (attempt: unknown) => {
    if (!attempt || typeof attempt !== "object" || Array.isArray(attempt)) return false;
    const item = attempt as Record<string, unknown>;
    return typeof item.id === "string" &&
      Number.isSafeInteger(item.revision) && Number(item.revision) >= 0 &&
      Array.isArray(item.checkpoints) && Array.isArray(item.transitions);
  };
  if (
    state.v !== 1 ||
    state.sid !== session.sid ||
    typeof state.runId !== "string" ||
    !Number.isSafeInteger(state.issuedAt) ||
    !Number.isSafeInteger(state.expiresAt) ||
    !Number.isSafeInteger(state.commandsUsed) || Number(state.commandsUsed) < 0 || Number(state.commandsUsed) > PUBLIC_PRESS_RAG_LIMITS.commandBudget ||
    !validAttempt(state.attempt) ||
    !Array.isArray(state.ancestors) || state.ancestors.length > PUBLIC_PRESS_RAG_LIMITS.starts || !state.ancestors.every(validAttempt) ||
    Number(state.expiresAt) - Number(state.issuedAt) > PUBLIC_PRESS_RAG_LIMITS.capabilityTtlSeconds * 1000 ||
    Number(state.expiresAt) <= Number(state.issuedAt)
  ) {
    throw new PressRagSecurityError("PRESS_RAG_CAPABILITY_INVALID", 401);
  }
  const verifiedState = state as PublicPressRagCapabilityState;
  if (now >= verifiedState.expiresAt) {
    throw new PressRagSecurityError("PRESS_RAG_CAPABILITY_EXPIRED", 410);
  }
  const run = session.runs[verifiedState.runId];
  if (!run) throw new PressRagSecurityError("PRESS_RAG_CAPABILITY_INVALID", 401);
  if (run.commands >= PUBLIC_PRESS_RAG_LIMITS.commandBudget) {
    throw new PressRagSecurityError("PRESS_RAG_COMMAND_BUDGET_EXHAUSTED", 410);
  }
  if (
    run.revision !== verifiedState.attempt.revision ||
    run.commands !== verifiedState.commandsUsed
  ) {
    throw new PressRagSecurityError("PRESS_RAG_COMMAND_STALE", 409, {
      expectedRevision: run.revision,
    });
  }
  return verifiedState;
}

export function consumePressRagCommand(
  session: PublicPressRagSession,
  state: PublicPressRagCapabilityState,
  expectedRevision: number,
) {
  const run = session.runs[state.runId];
  if (!run || expectedRevision !== run.revision || state.attempt.revision !== run.revision) {
    throw new PressRagSecurityError("PRESS_RAG_COMMAND_STALE", 409, {
      expectedRevision: run?.revision ?? null,
    });
  }
  if (run.commands >= PUBLIC_PRESS_RAG_LIMITS.commandBudget) {
    throw new PressRagSecurityError("PRESS_RAG_COMMAND_BUDGET_EXHAUSTED", 410);
  }
  const next = {
    revision: run.revision + 1,
    commands: run.commands + 1,
  };
  return {
    session: { ...session, runs: { ...session.runs, [state.runId]: next } },
    revision: next.revision,
    commandsUsed: next.commands,
  };
}
