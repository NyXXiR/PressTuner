import assert from "node:assert/strict";
import test from "node:test";
import { prisma } from "@/lib/prisma";
import { cleanupIsolatedFixtureWorkspace, createIsolatedFixtureWorkspace } from "./isolatedFixtureWorkspace";

test("isolated fixture workspace is project-owned, ephemeral, and fully removed", async () => {
  const workspace = await createIsolatedFixtureWorkspace(`workspace-${Date.now()}`);
  assert.ok(await prisma.team.findUnique({ where: { id: workspace.teamId } }));
  assert.ok(await prisma.user.findUnique({ where: { id: workspace.userId } }));
  await cleanupIsolatedFixtureWorkspace(workspace);
  assert.equal(await prisma.team.findUnique({ where: { id: workspace.teamId } }), null);
  assert.equal(await prisma.user.findUnique({ where: { id: workspace.userId } }), null);
});

test("isolated fixture cleanup removes run audit events before their parent runs", async () => {
  const workspace = await createIsolatedFixtureWorkspace(`workspace-with-run-${Date.now()}`);
  const run = await prisma.agentRun.create({
    data: {
      teamId: workspace.teamId,
      startedById: workspace.userId,
      status: "COMPLETED",
      agentVersion: "ai-process-console-fixture-v1",
      model: "deterministic",
      input: {},
      startedAt: new Date(),
      completedAt: new Date(),
    },
  });
  await prisma.agentRuntimeAuditEvent.create({
    data: {
      teamId: workspace.teamId,
      runId: run.id,
      eventType: "AI_PROCESS_CONSOLE_FIXTURE_TEST",
      details: {},
    },
  });

  await cleanupIsolatedFixtureWorkspace(workspace);

  assert.equal(await prisma.agentRuntimeAuditEvent.findFirst({ where: { teamId: workspace.teamId } }), null);
  assert.equal(await prisma.agentRun.findUnique({ where: { id: run.id } }), null);
  assert.equal(await prisma.team.findUnique({ where: { id: workspace.teamId } }), null);
  assert.equal(await prisma.user.findUnique({ where: { id: workspace.userId } }), null);
});
