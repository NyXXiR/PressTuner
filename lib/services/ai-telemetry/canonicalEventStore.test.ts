import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mapRunLifecycle } from "@/domain/ai-telemetry/pressMapper";
import { prisma } from "@/lib/prisma";
import { appendCanonicalEventInTransaction } from "./canonicalEventStore";

test("canonical store serializes sequence allocation with a void advisory lock", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { loginId: `canonical-${suffix}`, label: "Canonical telemetry integration" } });
  const team = await prisma.team.create({ data: { slug: `canonical-${suffix}`, name: "Canonical telemetry integration", planId: "free_v1", plan: "FREE", planCategory: "STANDARD", nextPaymentAmount: 0 } });
  const run = await prisma.agentRun.create({ data: { teamId: team.id, startedById: user.id, status: "RUNNING", agentVersion: "canonical-test", model: "test", input: {}, startedAt: new Date(), traceId: suffix.replaceAll("-", "") } });
  try {
    const input = mapRunLifecycle({ teamId: team.id, runId: run.id, traceId: run.traceId, attemptId: run.id }, "STARTED");
    const appended = await appendCanonicalEventInTransaction(input);
    const duplicate = await appendCanonicalEventInTransaction(input);
    assert.equal(appended.sequence, 1);
    assert.equal(duplicate.eventId, appended.eventId);
    assert.equal(await prisma.agentRuntimeAuditEvent.count({ where: { canonicalEventId: appended.eventId } }), 1);
  } finally {
    await prisma.agentRuntimeAuditEvent.deleteMany({ where: { teamId: team.id } });
    await prisma.team.delete({ where: { id: team.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }

  const source = readFileSync("lib/services/ai-telemetry/canonicalEventStore.ts", "utf8");
  assert.match(source, /\$executeRaw`SELECT pg_advisory_xact_lock/); assert.doesNotMatch(source, /\$queryRaw`SELECT pg_advisory_xact_lock/); assert.match(source, /canonicalEventId: proposed\.eventId/); assert.match(source, /\(latest\?\.sequence \?\? 0\) \+ 1/); assert.match(source, /P2002/); assert.match(source, /details: json\(event\)/);
});

test("experiment cycle uses executeRaw for its void advisory lock", () => {
  const source = readFileSync("lib/services/press-agent/experimentPersistenceService.ts", "utf8");
  assert.match(source, /\$executeRaw`SELECT pg_advisory_xact_lock/);
  assert.doesNotMatch(source, /\$queryRaw`SELECT pg_advisory_xact_lock/);
});
