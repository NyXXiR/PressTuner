import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import { createCheckpointAttempt } from "./checkpointDebuggerService";
import { createProducerVerificationService } from "./producerVerificationService";

test("saved checkpoint verification is team-scoped and projects canonical rows without content", async () => {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { loginId: `producer-verification-${suffix}`, label: "Producer verification" } });
  const owner = await prisma.team.create({ data: { slug: `producer-owner-${suffix}`, name: "Producer owner", planId: "free_v1", plan: "FREE", planCategory: "STANDARD", nextPaymentAmount: 0 } });
  const outsider = await prisma.team.create({ data: { slug: `producer-outsider-${suffix}`, name: "Producer outsider", planId: "free_v1", plan: "FREE", planCategory: "STANDARD", nextPaymentAmount: 0 } });
  const attemptId = randomUUID();
  try {
    await createCheckpointAttempt({ teamId: owner.id, userId: user.id, input: { commandId: attemptId, expectedRevision: 0, rawText: "PRIVATE_PROMPT_SENTINEL", tone: "formal", reviewInstruction: "PRIVATE_REVIEW_SENTINEL", rewriteInstruction: "PRIVATE_REWRITE_SENTINEL" } });
    const verify = createProducerVerificationService({ environment: {} });
    const report = await verify({ teamId: owner.id, attemptId });
    assert.equal(report.manifest.status, "verified");
    assert.equal(report.canonical.status, "observed");
    assert.equal(report.canonical.counts["run.lifecycle"], 1);
    assert.equal(report.facts.status, "ready");
    assert.equal(report.otlp.status, "ready");
    assert.equal(report.delivery.operationLinkage, "disabled");
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /PRIVATE_(?:PROMPT|REVIEW|REWRITE)_SENTINEL/);
    assert.doesNotMatch(serialized, new RegExp([owner.id, outsider.id, user.id, attemptId].join("|")));
    await assert.rejects(verify({ teamId: outsider.id, attemptId }), (error: Error & { status?: number; code?: string }) => error.status === 404 && error.code === "PRESS_AI_PRODUCER_VERIFICATION_NOT_FOUND");
    await assert.rejects(verify({ teamId: owner.id, attemptId: randomUUID() }), (error: Error & { status?: number; code?: string }) => error.status === 404 && error.code === "PRESS_AI_PRODUCER_VERIFICATION_NOT_FOUND");
  } finally {
    await prisma.agentRuntimeAuditEvent.deleteMany({ where: { teamId: { in: [owner.id, outsider.id] } } });
    await prisma.team.deleteMany({ where: { id: { in: [owner.id, outsider.id] } } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
