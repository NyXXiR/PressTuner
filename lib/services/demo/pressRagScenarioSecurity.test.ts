import assert from "node:assert/strict";
import test from "node:test";

import { PUBLIC_PRESS_RAG_EVIDENCE, PUBLIC_PRESS_RAG_LIMITS } from "@/domain/demo/pressRagScenarioContract";
import { createPublicPressRagAttempt } from "@/domain/demo/pressRagScenarioMachine";
import {
  PressRagSecurityError,
  acceptPressRagStart,
  consumePressRagCommand,
  createPressRagSession,
  decodePressRagCapability,
  encodePressRagCapability,
  pressRagQuota,
  pressRagSessionCookie,
  readPressRagSession,
  registerPressRagRun,
  resolvePressRagSigningSecret,
  validatePressRagSigningSecret,
  writePressRagSession,
} from "./pressRagScenarioSecurity";

const secret = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";

test("rolling quota accepts the configured number of starts and calculates retry after", () => {
  let session = createPressRagSession();
  const latestStart = (PUBLIC_PRESS_RAG_LIMITS.starts - 1) * 1000;
  const retryAfterSeconds = PUBLIC_PRESS_RAG_LIMITS.windowSeconds - (PUBLIC_PRESS_RAG_LIMITS.starts - 1);
  for (let index = 0; index < PUBLIC_PRESS_RAG_LIMITS.starts; index += 1) session = acceptPressRagStart(session, index * 1000);
  assert.deepEqual(pressRagQuota(session, latestStart), { remainingStarts: 0, retryAfterSeconds });
  assert.throws(() => acceptPressRagStart(session, latestStart), (error: unknown) => error instanceof PressRagSecurityError && error.status === 429 && error.details.retryAfterSeconds === retryAfterSeconds);
  const afterWindow = PUBLIC_PRESS_RAG_LIMITS.windowSeconds * 1000 + 1;
  const pruned = acceptPressRagStart(session, afterWindow);
  assert.equal(pruned.starts.length, PUBLIC_PRESS_RAG_LIMITS.starts);
  assert.equal(pressRagQuota(pruned, afterWindow).remainingStarts, 0);
});

test("starting again after the rolling window prunes the oldest run record", () => {
  let session = createPressRagSession();
  for (let index = 0; index < PUBLIC_PRESS_RAG_LIMITS.starts; index += 1) {
    session = acceptPressRagStart(session, index * 1000);
    session = registerPressRagRun(session, `run-${index}`);
  }

  session = acceptPressRagStart(session, 600_001);
  session = registerPressRagRun(session, "run-after-window");

  assert.equal(Object.keys(session.runs).length, PUBLIC_PRESS_RAG_LIMITS.starts);
  assert.equal(session.runs["run-0"], undefined);
  assert.ok(session.runs["run-after-window"]);
  assert.equal(readPressRagSession(writePressRagSession(session, secret), secret).sid, session.sid);
});

test("session cookies are signed, tampering is rejected, and production attributes are safe", () => {
  const session = createPressRagSession();
  const token = writePressRagSession(session, secret);
  assert.equal(readPressRagSession(token, secret).sid, session.sid);
  assert.throws(() => readPressRagSession(`${token}x`, secret), /PRESS_RAG_SESSION_INVALID/);
  const cookie = pressRagSessionCookie(token, true);
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Secure/);
  assert.doesNotMatch(cookie, /Expires|Max-Age/);
  assert.throws(() => validatePressRagSigningSecret("weak"), /PRESS_RAG_SIGNING_UNAVAILABLE/);
  assert.equal(resolvePressRagSigningSecret({ AI_QA_AUTH_SECRET: secret }), secret);
  assert.throws(() => resolvePressRagSigningSecret({ PRESS_RAG_DEMO_SIGNING_SECRET: "weak", AI_QA_AUTH_SECRET: secret }), /PRESS_RAG_SIGNING_UNAVAILABLE/);
});

test("capabilities bind session, TTL, revision, size and command budget", () => {
  const now = 10_000;
  const attempt = createPublicPressRagAttempt({ runId: "run", memo: "memo", tone: "formal", now });
  let session = registerPressRagRun(createPressRagSession(), "run");
  const state = { v: 1 as const, sid: session.sid, runId: "run", issuedAt: now, expiresAt: now + 1000, commandsUsed: 0, evidence: PUBLIC_PRESS_RAG_EVIDENCE, attempt, ancestors: [] };
  const token = encodePressRagCapability(state, secret);
  assert.equal(decodePressRagCapability(token, session, secret, now).runId, "run");
  const otherSession = registerPressRagRun(createPressRagSession(), "run");
  assert.throws(() => decodePressRagCapability(token, otherSession, secret, now), /PRESS_RAG_CAPABILITY_INVALID/);
  assert.throws(() => decodePressRagCapability(`${token}x`, session, secret, now), /PRESS_RAG_CAPABILITY_INVALID/);
  assert.throws(() => decodePressRagCapability(token, session, secret, now + 1000), /PRESS_RAG_CAPABILITY_EXPIRED/);
  const consumed = consumePressRagCommand(session, state, 0);
  session = consumed.session;
  assert.throws(() => decodePressRagCapability(token, session, secret, now), /PRESS_RAG_COMMAND_STALE/);
  session.runs.run.commands = PUBLIC_PRESS_RAG_LIMITS.commandBudget;
  const exhausted = { ...state, commandsUsed: PUBLIC_PRESS_RAG_LIMITS.commandBudget, attempt: { ...attempt, revision: session.runs.run.revision } };
  assert.throws(() => decodePressRagCapability(encodePressRagCapability(exhausted, secret), session, secret, now), /PRESS_RAG_COMMAND_BUDGET_EXHAUSTED/);
  const huge = { ...state, attempt: { ...attempt, inputSnapshot: { ...attempt.inputSnapshot, rawText: "x".repeat(50_000) } } };
  assert.throws(() => encodePressRagCapability(huge, secret), /PRESS_RAG_CAPABILITY_TOO_LARGE/);
});
