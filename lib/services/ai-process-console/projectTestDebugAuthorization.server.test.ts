import assert from "node:assert/strict";
import test from "node:test";
import { authorizeProjectTestDebugSession } from "./projectTestDebugAuthorization.server";

const request = { schemaVersion: "2.0", sessionCredential: "opaque-sid", projectId: "presstuner", environment: "conformance" };
const active = { userId: "db-user-1", expiresAt: new Date("2026-08-26T00:00:00.000Z"), user: { id: "db-user-1", email: "admin@example.com", isActive: true, deleteScheduledAt: null } };

test("project TEST-debug authorization denies missing, unknown, expired, deleted, inactive, and non-super-admin sessions", async () => {
  const now = () => new Date("2026-08-25T08:00:00.000Z");
  assert.deepEqual(await authorizeProjectTestDebugSession({}, { now }), { schemaVersion: "2.0", authorized: false });
  assert.deepEqual(await authorizeProjectTestDebugSession(request, { loadSession: async () => null, now }), { schemaVersion: "2.0", authorized: false });
  for (const session of [
    { ...active, expiresAt: new Date("2026-08-25T07:59:59.000Z") },
    { ...active, user: { ...active.user, isActive: false } },
    { ...active, user: { ...active.user, deleteScheduledAt: new Date("2026-08-26T00:00:00.000Z") } },
  ]) assert.deepEqual(await authorizeProjectTestDebugSession(request, { loadSession: async () => session, now, superAdmin: () => true }), { schemaVersion: "2.0", authorized: false });
  assert.deepEqual(await authorizeProjectTestDebugSession(request, { loadSession: async () => active, now, superAdmin: () => false }), { schemaVersion: "2.0", authorized: false });
});

test("authorization returns the stable DB user ID and ignores submitted identity fields", async () => {
  const input = { ...request, operatorSubject: "spoofed", email: "spoofed@example.com" };
  assert.deepEqual(await authorizeProjectTestDebugSession(input, { loadSession: async () => active, superAdmin: () => true }), { schemaVersion: "2.0", authorized: false });
  const result = await authorizeProjectTestDebugSession(request, { loadSession: async (credential) => { assert.equal(credential, "opaque-sid"); return active; }, superAdmin: (email) => email === active.user.email });
  assert.deepEqual(result, { schemaVersion: "2.0", authorized: true, operatorSubject: "db-user-1", decisionCode: "OPERATOR_AUTHORIZED" });
  assert.notEqual((result as { operatorSubject?: string }).operatorSubject, active.user.email);
});
